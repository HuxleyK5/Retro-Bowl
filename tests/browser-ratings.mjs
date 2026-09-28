import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
await mkdir('test-results', {recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1100}}), errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.goto('http://localhost:5173'); await page.locator('#start-franchise').click();
  const state=()=>page.evaluate(async()=>{
    const {state,match,play}=await import('/src/main.js');
    return {playing:state.playing,clock:match.rules.clock,playClock:match.rules.playClock,elapsed:play.elapsed,phase:match.rules.phase};
  });
  await page.locator('#ratings-toggle').click(); await expect(page.locator('#ratings-panel')).toBeVisible();
  assert.equal((await state()).playing,false);
  const schemas={QB:['throwPower','accuracy','speed','awareness'],RB:['speed','acceleration','strength','elusiveness','awareness'],WR:['speed','acceleration','catching','routeRunning','awareness'],OL:['strength','blocking','awareness'],DEF:['speed','strength','tackling','coverage','passRush','awareness']};
  for(const team of ['home','away']) {
    await page.selectOption('#ratings-team',team);
    assert.equal(await page.locator('#ratings-player option').count(),53);
    for(const [position,keys] of Object.entries(schemas)) {
      const record=await page.evaluate(async({team,position})=>{
        const {play}=await import('/src/main.js');return play.rosters[team].find(p=>p.position===position).toJSON();
      },{team,position});
      await page.selectOption('#ratings-player',record.id);
      await expect(page.locator('#ratings-name')).toHaveText(record.name);
      const rows=await page.locator('.rating-row').evaluateAll(rows=>rows.map(row=>({key:row.dataset.rating,value:Number(row.querySelector('strong').textContent),meter:row.querySelector('meter').value})));
      assert.deepEqual(rows.map(r=>r.key),keys);
      for(const row of rows){assert.equal(row.value,record.ratings[row.key]);assert.equal(row.meter,row.value);}
    }
  }
  await page.selectOption('#ratings-team','home');
  await page.screenshot({path:'test-results/phase5-ratings-qb.png',fullPage:true});
  await page.keyboard.press('Escape'); await expect(page.locator('#ratings-panel')).toBeHidden();
  assert.equal((await state()).playing,true);assert.equal((await state()).phase,'pregame');
  await page.locator('#screen-action').click();await page.locator('#game').focus();await page.keyboard.press('Space');await page.waitForTimeout(200);
  await page.locator('#ratings-toggle').click();const frozen=await state();await page.waitForTimeout(250);assert.deepEqual(await state(),frozen);
  await page.locator('#ratings-close').click();assert.equal((await state()).playing,true);await page.waitForTimeout(100);assert.ok((await state()).elapsed>frozen.elapsed);
  await page.keyboard.press('Escape');assert.equal((await state()).playing,false);
  await page.locator('#ratings-toggle').click();await page.keyboard.press('p');
  await expect(page.locator('#ratings-panel')).toBeHidden();assert.equal((await state()).playing,false);await expect(page.locator('#overlay')).toBeVisible();
  await page.locator('#ratings-toggle').click();
  await page.locator('#ratings-close').focus();await page.keyboard.press('Shift+Tab');await expect(page.locator('#ratings-player')).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.locator('#ratings-close')).toBeFocused();
  for(const [width,height] of [[960,720],[540,800]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(80);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await expect(page.locator('#ratings-close')).toBeVisible();
    await page.screenshot({path:`test-results/phase5-ratings-${width}.png`,fullPage:true});
  }
  await page.locator('#ratings-close').click();await page.locator('#resume').click();
  assert.deepEqual(errors,[]);
  console.log('PASS: both 53-player rosters, every position rating/value, derived abilities, pregame/live/already-paused inspection, frozen clocks, focus trap, responsive panel, zero browser errors.');
} finally {await browser.close();}
