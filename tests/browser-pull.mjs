import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('http://localhost:5173');await page.locator('#start-franchise').click();await page.locator('#screen-action').click(); await page.evaluate(async()=>{(await import('/src/main.js')).match.start(120,false)});
 // One continuous gesture snaps, survives the disappearing playbook, then throws.
 await page.evaluate(async()=>{const {loop}=await import('/src/main.js');loop.stop();loop.render()});
 await page.locator('#game').scrollIntoViewIfNeeded();
 const pre=await page.locator('#game').boundingBox(),sx=pre.x+pre.width/2,sy=pre.y+pre.height/2;
 await page.mouse.move(sx,sy);await page.mouse.down();
 assert.equal(await page.evaluate(async()=>(await import('/src/main.js')).match.rules.phase),'live');
 await page.evaluate(async()=>{(await import('/src/main.js')).loop.render()});await page.waitForTimeout(80);
 await page.mouse.move(sx-100,sy);await page.mouse.up();
 const snapped=await page.evaluate(async()=>{const {play}=await import('/src/main.js');return {phase:play.phase,dx:play.ball.target.x-play.qb.x,dy:play.ball.target.y-play.qb.y}});
 assert.equal(snapped.phase,'flight');assert.ok(snapped.dx>450&&snapped.dx<650);assert.ok(Math.abs(snapped.dy)<40);
 const prepare=async()=>{await page.evaluate(async()=>{const {match,state,loop}=await import('/src/main.js');state.set('playing');match.start(120, false);match.snap();loop.stop();loop.render();});await page.locator('#game').focus();await page.locator('#game').scrollIntoViewIfNeeded();await page.waitForTimeout(80)};
 const phase=()=>page.evaluate(async()=>(await import('/src/main.js')).play.phase);
 await prepare();const box=await page.locator('#game').boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
 await page.mouse.click(x,y);assert.equal(await phase(),'passing');
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-100,y+30);
 assert.equal(await phase(),'passing');
 // Render the held gesture and inspect the actual canvas drawing calls.
 const dots=await page.evaluate(async()=>{const {loop}=await import('/src/main.js');const ctx=document.querySelector('#game').getContext('2d'),original=ctx.arc;let dots=0;ctx.arc=function(...args){if(args[2]===3.5)dots++;return original.apply(this,args)};loop.render();ctx.arc=original;return dots});
 assert.ok(dots>=12);await page.screenshot({path:'test-results/pull-pass-preview.png'});
 await page.mouse.up();assert.equal(await phase(),'flight');
 const path=await page.evaluate(async()=>{const {play}=await import('/src/main.js');return {dx:play.ball.target.x-play.qb.x,dy:play.ball.target.y-play.qb.y}});assert.ok(path.dx>0&&path.dy<0);
 for(const cancel of ['pause','blur','cancel','resize']){
  await prepare();await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-80,y);
  if(cancel==='pause'){await page.keyboard.press('Escape');await page.keyboard.press('Escape')}
  if(cancel==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  if(cancel==='cancel')await page.locator('#game').dispatchEvent('pointercancel');
  if(cancel==='resize')await page.setViewportSize({width:1300,height:1000});
  await page.waitForTimeout(100);await page.mouse.up();assert.equal(await phase(),'passing',cancel);
 }
 assert.deepEqual(errors,[]);console.log('PASS: pull snaps and throws through layout change, no click throws, hold does not throw, dotted arc, opposite pull direction, release throws, pause/blur/cancel/resize cancel safely, zero console errors.');
}finally{await browser.close()}
