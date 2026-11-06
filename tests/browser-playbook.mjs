import { pullPass } from './pull-helper.mjs';
import { startFranchise } from './start-helper.mjs';
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
  await page.goto('http://localhost:5173'); await startFranchise(page); await page.locator('#screen-action').click(); await page.evaluate(async()=>{(await import('/src/main.js')).match.start(120,false)});
  const read = () => page.evaluate(async () => {
    const { play, match } = await import('/src/main.js');
    return { id: play.call?.id, audibles: match.audiblesRemaining, phase: match.rules.phase, playPhase: play.phase, elapsed: play.elapsed, carrierId: play.carrier?.data.id, qbId: play.qb.data.id, rbId: play.rb.data.id, canThrow: play.canThrow, clock: match.rules.clock, playClock: match.rules.playClock, down: match.rules.down, spot: match.rules.spot, routes: play.receivers.map(p => p.route), rb: { x: play.rb.x, y: play.rb.y }, guided: play.execution.guided };
  });
  const waitFor = async (condition, timeout = 3000) => {
    const until = Date.now() + timeout;
    while (Date.now() < until) { const v = await read(); if (condition(v)) return v; await page.waitForTimeout(25); }
    assert.fail(JSON.stringify(await read()));
  };
  const prepare = async () => {
    await page.evaluate(async () => { const {match,state,play} = await import('/src/main.js'); state.set('playing'); match.start(120, false); match.cpuAdjustment = 'cushion'; match.configurePlay('slants'); play.random = () => .4; });
    await page.locator('#game').focus(); await page.waitForTimeout(80);
  };
  await prepare();
  await expect(page.locator('[data-play], #beginner-more-plays, #pass-plays, #run-plays')).toHaveCount(0);
  await expect(page.locator('#audible-button')).toBeVisible();
  await expect(page.locator('#audible-count')).toContainText('2 AUDIBLES LEFT');
  const before = await read();
  await page.evaluate(async () => { (await import('/src/main.js')).match.random = () => .7; });
  await page.locator('#audible-button').click();
  await waitFor(v => v.audibles === 1);
  const first = await read(); assert.notEqual(first.id, before.id);
  assert.equal(first.down, before.down); assert.equal(first.spot, before.spot); assert.equal(first.clock, before.clock);
  await page.locator('#audible-button').click(); await waitFor(v => v.audibles === 0);
  const locked = await read(); assert.notEqual(locked.id, first.id);
  await expect(page.locator('#audible-button')).toBeDisabled();
  await expect(page.locator('#playbook-snap')).toBeEnabled();
  await page.locator('#game').focus(); await page.keyboard.press('e'); assert.equal((await read()).id, locked.id);
  await expect(page.locator('#audible-count')).toContainText('NO AUDIBLES LEFT');
  await page.screenshot({path:'test-results/random-audibles.png',fullPage:true});
  await page.evaluate(async () => {
    const { match, loop } = await import('/src/main.js');
    match.snap(); match.play.finish('INCOMPLETE'); match.rules.completePlay(match.play.outcome); match.advance(); loop.render();
  });
  await expect(page.locator('#audible-count')).toContainText('2 AUDIBLES LEFT');
  await expect(page.locator('#audible-button')).toBeEnabled();
  // Keyboard shortcuts use the same random roll as the button, never list order.
  await prepare();
  await page.evaluate(async () => { (await import('/src/main.js')).match.random = () => .999; });
  await page.locator('#game').focus(); await page.keyboard.press('e'); await waitFor(v => v.audibles === 1);
  assert.equal((await read()).id,'draw');
  await page.evaluate(async () => { (await import('/src/main.js')).match.random = () => 0; });
  await page.keyboard.press('q'); await waitFor(v => v.audibles === 0); assert.equal((await read()).id,'slants');
  await prepare();
  await page.keyboard.press('Escape'); await expect(page.locator('#audible-button')).toBeDisabled();
  const paused = await read(); await page.keyboard.press('e'); await page.waitForTimeout(100);
  assert.equal((await read()).id,paused.id);assert.equal((await read()).audibles,paused.audibles);
  await page.keyboard.press('Escape');
  for (const id of ['inside','outside','sweep','draw']) {
    await prepare(); await page.evaluate(async id=>{const{match,loop}=await import('/src/main.js');match.configurePlay(id);loop.render()},id);
    await page.locator('#playbook-snap').click(); await expect(page.locator('#playbook')).toBeHidden();
    await waitFor(v => v.carrierId === v.rbId);
    assert.equal((await read()).playPhase, 'running'); assert.equal((await read()).canThrow, false);
    await page.keyboard.press('e'); assert.equal((await read()).id, id);
    if (id === 'outside') {
      await page.keyboard.down('w'); await page.waitForTimeout(120); await page.keyboard.up('w');
      assert.equal((await read()).guided, false);
      await page.screenshot({path:'test-results/phase4-outside-run.png',fullPage:true});
    }
  }
  await prepare(); await page.evaluate(async()=>{const{match,loop}=await import('/src/main.js');match.configurePlay('play-action');loop.render()}); await page.keyboard.press('Space');
  assert.equal((await read()).canThrow, false); const afterFake = await waitFor(v => v.canThrow); assert.equal(afterFake.carrierId, afterFake.qbId);
  await prepare(); await page.evaluate(async()=>{const{match,loop}=await import('/src/main.js');match.configurePlay('screen');loop.render()}); await page.keyboard.press('Space');
  await page.waitForTimeout(1000);
  const target = await page.evaluate(async () => { const {play}=await import('/src/main.js');return {x:play.rb.x,y:play.rb.y}; });
  await pullPass(page,target); const afterCatch = await waitFor(v => v.playPhase === 'running'); assert.equal(afterCatch.carrierId, afterCatch.rbId);
  for (const [width,height] of [[960,720],[540,800]]) {
    await prepare(); await page.setViewportSize({width,height}); await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.evaluate(async()=>{const{match,loop}=await import('/src/main.js');match.configurePlay('sweep');loop.render()}); assert.equal((await read()).id,'sweep');
    await page.screenshot({path:`test-results/phase4-playbook-${width}.png`,fullPage:true});
    await page.locator('#playbook-snap').click(); await waitFor(v => v.carrierId === v.rbId);
  }
  await prepare();
  await page.evaluate(async () => {const {match} = await import('/src/main.js'); match.rules.changePossession(25); match.prepare();});
  await page.waitForTimeout(100); assert.equal(await page.locator('#playbook').isVisible(),false);
  const cpu = await read(); await page.keyboard.press('e'); assert.equal((await read()).id,cpu.id);
  assert.deepEqual(errors,[]);
  console.log('PASS: random assigned play, no manual play selection, random Audible button and Q/E, shared two-audible limit, next-down reset, clocks preserved, pause/live/CPU lockout, all run exchanges, manual steering, play-action delay, screen completion, desktop/narrow layouts, zero browser errors.');
} finally { await browser.close(); }
