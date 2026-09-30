import { pullPass } from './pull-helper.mjs';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto('http://localhost:5173'); await page.locator('#start-franchise').click(); await page.locator('#screen-action').click(); await page.evaluate(async()=>{(await import('/src/main.js')).match.start(120,false)});
  const read = () => page.evaluate(async () => {
    const { play, match } = await import('/src/main.js');
    return { id: play.call?.id, phase: match.rules.phase, playPhase: play.phase, elapsed: play.elapsed, carrier: play.carrier?.number, canThrow: play.canThrow, clock: match.rules.clock, playClock: match.rules.playClock, down: match.rules.down, spot: match.rules.spot, routes: play.receivers.map(p => p.route), rb: { x: play.rb.x, y: play.rb.y }, guided: play.execution.guided };
  });
  const waitFor = async (condition, timeout = 3000) => {
    const until = Date.now() + timeout;
    while (Date.now() < until) { const v = await read(); if (condition(v)) return v; await page.waitForTimeout(25); }
    assert.fail(JSON.stringify(await read()));
  };
  const prepare = async () => {
    await page.evaluate(async () => { const {match,state,play} = await import('/src/main.js'); state.set('playing'); match.start(120, false); play.random = () => .4; });
    await page.locator('#game').focus(); await page.waitForTimeout(80);
  };
  assert.equal(await page.locator('[data-play]').count(), 12);
  const before = await read(); const signatures = [];
  for (const id of ['slants','outs','curls','posts','go','crosses','screen','play-action','inside','outside','sweep','draw']) {
    await page.locator(`[data-play="${id}"]`).click();
    await waitFor(v => v.id === id); await page.waitForTimeout(30);
    assert.equal(await page.locator(`[data-play="${id}"]`).getAttribute('aria-pressed'), 'true');
    const v = await read(); assert.equal(v.down, before.down); assert.equal(v.spot, before.spot); assert.equal(v.clock, before.clock);
    assert.ok(v.playClock <= before.playClock); signatures.push(JSON.stringify(v.routes));
  }
  assert.equal(new Set(signatures).size, 12);
  await page.keyboard.press('e'); await waitFor(v => v.id === 'slants');
  await page.keyboard.press('q'); await waitFor(v => v.id === 'draw');
  await page.locator('[data-play="crosses"]').click();
  await expect(page.locator('#call-formation')).toHaveText('Bunch right');
  await page.screenshot({path:'test-results/phase4-playbook.png',fullPage:true});
  await page.keyboard.press('Escape'); await expect(page.locator('[data-play="go"]')).toBeDisabled();
  const paused = await read(); await page.keyboard.press('e'); await page.waitForTimeout(100);
  assert.equal((await read()).id, paused.id); assert.equal((await read()).playClock, paused.playClock);
  await page.keyboard.press('Escape');
  for (const id of ['inside','outside','sweep','draw']) {
    await prepare(); await page.locator(`[data-play="${id}"]`).click();
    await page.locator('#playbook-snap').click(); await expect(page.locator('#playbook')).toBeHidden();
    await waitFor(v => v.carrier === '04');
    assert.equal((await read()).playPhase, 'running'); assert.equal((await read()).canThrow, false);
    await page.keyboard.press('e'); assert.equal((await read()).id, id);
    if (id === 'outside') {
      await page.keyboard.down('w'); await page.waitForTimeout(120); await page.keyboard.up('w');
      assert.equal((await read()).guided, false);
      await page.screenshot({path:'test-results/phase4-outside-run.png',fullPage:true});
    }
  }
  await prepare(); await page.locator('[data-play="play-action"]').click(); await page.keyboard.press('Space');
  assert.equal((await read()).canThrow, false); await waitFor(v => v.canThrow); assert.equal((await read()).carrier, '01');
  await prepare(); await page.locator('[data-play="screen"]').click(); await page.keyboard.press('Space');
  await page.waitForTimeout(1000);
  const target = await page.evaluate(async () => { const {play}=await import('/src/main.js');return {x:play.rb.x,y:play.rb.y}; });
  await pullPass(page,target); await waitFor(v => v.playPhase === 'running'); assert.equal((await read()).carrier, '04');
  for (const [width,height] of [[960,720],[540,800]]) {
    await prepare(); await page.setViewportSize({width,height}); await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('[data-play="sweep"]').click(); assert.equal((await read()).id,'sweep');
    await page.screenshot({path:`test-results/phase4-playbook-${width}.png`,fullPage:true});
    await page.locator('#playbook-snap').click(); await waitFor(v => v.carrier === '04');
  }
  await prepare();
  await page.evaluate(async () => {const {match} = await import('/src/main.js'); match.rules.changePossession(25); match.prepare();});
  await page.waitForTimeout(100); assert.equal(await page.locator('#playbook').isVisible(),false);
  const cpu = await read(); await page.keyboard.press('e'); assert.equal((await read()).id,cpu.id);
  assert.deepEqual(errors,[]);
  console.log('PASS: all 12 UI choices, distinct previews, formation changes, Q/E audibles, clocks preserved, pause/live/CPU lockout, all run exchanges, manual steering, play-action delay, screen completion, desktop/narrow layouts, zero browser errors.');
} finally { await browser.close(); }
