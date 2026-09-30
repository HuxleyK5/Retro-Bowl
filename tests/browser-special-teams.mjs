import { chromium,expect } from '@playwright/test';
import assert from 'node:assert/strict';
import {lockMeter} from './special-helper.mjs';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
 const read=()=>page.evaluate(async()=>{const{match,play,state}=await import('/src/main.js');return {phase:match.rules.phase,clock:match.rules.clock,playClock:match.rules.playClock,score:match.rules.score,result:match.rules.result,x:play.controlled.x,y:play.controlled.y,spot:match.rules.spot,down:match.rules.down,juke:play.controlled.jukeCooldown,meter:match.meter?{stage:match.meter.stage,value:match.meter.value}:null,paused:!state.playing}});
 const wait=async(fn,ms=8000)=>{const deadline=Date.now()+ms;while(Date.now()<deadline){const s=await read();if(fn(s))return s;await page.waitForTimeout(30)}assert.fail(JSON.stringify(await read()))};
 await page.goto('http://localhost:5173');await page.locator('#start-franchise').click();await page.locator('#screen-action').click();await wait(s=>s.phase==='kickoff');
 const kickoff=await read();await page.waitForTimeout(200);assert.equal((await read()).clock,kickoff.clock);
 await wait(s=>s.phase==='return');const start=await read();await page.waitForTimeout(180);assert.ok((await read()).x>start.x);assert.ok((await read()).clock<start.clock);
 await page.locator('#game').focus();await page.keyboard.press('Escape');const frozen=await read();await page.waitForTimeout(160);assert.deepEqual(await read(),frozen);await page.keyboard.press('Escape');
 await page.keyboard.down('w');await page.keyboard.down('Shift');await page.keyboard.press('j');await page.waitForTimeout(130);await page.keyboard.up('w');await page.keyboard.up('Shift');assert.ok((await read()).y<start.y);assert.ok((await read()).juke>0);
 await page.screenshot({path:'test-results/kickoff-return.png'});
 await wait(s=>s.phase==='result');assert.match((await read()).result,/KICK RETURN/);const returnSpot=(await read()).spot;await page.locator('#snap').click();await wait(s=>s.phase==='ready');assert.equal((await read()).spot,returnSpot);assert.equal((await read()).down,1);
 const setup=async(extra=false)=>{await page.evaluate(async extra=>{const{match,state,loop}=await import('/src/main.js');state.set('playing');match.start(120,false);match.rules.newSeries(75);match.prepare();if(extra)match.rules.phase='extraPoint';loop.start()},extra);await page.locator('#game').focus();await page.waitForTimeout(60)};
 await setup();await page.keyboard.press('f');await expect(page.locator('#kick-meter')).toBeVisible();const meter=await read();await page.waitForTimeout(120);assert.notEqual((await read()).meter.value,meter.meter.value);assert.equal((await read()).clock,meter.clock);
 await page.keyboard.press('Escape');const stopped=await read();await page.waitForTimeout(140);assert.deepEqual(await read(),stopped);await page.keyboard.press('Escape');
 for(const width of [540,960,1440]){await page.setViewportSize({width,height:1100});await expect(page.locator('#kick-lock')).toBeVisible();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)}
 await page.screenshot({path:'test-results/kick-meter.png'});await lockMeter(page);await wait(s=>s.phase==='result');assert.equal((await read()).score.home,3);await page.locator('#snap').click();await wait(s=>s.phase==='kickMeter');await expect(page.locator('#kick-meter-title')).toContainText('KICKOFF');await lockMeter(page);await wait(s=>s.phase==='result');assert.equal((await read()).result,'TOUCHBACK');assert.equal((await read()).spot,25);
 await setup();await page.keyboard.press('k');await expect(page.locator('#kick-meter-title')).toContainText('PUNT');await lockMeter(page,.4);await wait(s=>s.phase==='result');assert.match((await read()).result,/PUNT/);
 await setup(true);await page.keyboard.press('Space');await expect(page.locator('#kick-meter-title')).toContainText('EXTRA POINT');await lockMeter(page);await wait(s=>s.phase==='result');assert.equal((await read()).score.home,1);
 await setup();await page.keyboard.press('f');await lockMeter(page,1,1);await wait(s=>s.phase==='result');assert.equal((await read()).result,'FIELD GOAL MISSED');assert.equal((await read()).score.home,0);
 assert.deepEqual(errors,[]);console.log('PASS: opening kickoff, catch/auto-return, steering/sprint/juke, tackle spot and first down, clock/pause, moving kick meter, power/accuracy UI, FG/PAT/punt, kickoff touchback, wide miss, resizing, zero console/network errors.');
}finally{await browser.close()}
