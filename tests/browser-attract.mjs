import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { startFranchise } from './start-helper.mjs';

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.clock.install();
  await page.goto('http://localhost:5173');
  const demo = page.locator('#attract-mode');
  await page.clock.fastForward(44900);
  await expect(demo).toBeHidden();
  await page.mouse.move(50, 50);
  await page.clock.fastForward(44900);
  await expect(demo).toBeHidden();
  await page.clock.fastForward(200);
  await expect(demo).toBeVisible();
  await expect(page.locator('.app')).toHaveAttribute('inert', '');
  await expect(demo).toContainText('CPU vs CPU');
  const progress = await page.evaluate(async () => {
    const { attract } = await import('/src/main.js');
    const sides = new Set();
    for (let i = 0; i < 5000; i++) {
      attract.update(1 / 60);
      if (attract.match.rules.phase === 'live') sides.add(attract.match.rules.possession);
    }
    attract.render();
    return { sides: [...sides], plays: attract.match.rules.playNumber };
  });
  assert.ok(progress.plays > 0, 'exhibition runs actual plays');
  await page.screenshot({ path: 'test-results/attract-desktop.png' });
  for (const [width, height] of [[390, 844], [740, 360]]) {
    await page.setViewportSize({ width, height });
    await page.clock.runFor(50);
    const bounds = await demo.locator('canvas').boundingBox();
    assert.ok(bounds.width > 0 && bounds.height > 90);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.runFor(50);
  await page.screenshot({ path: 'test-results/attract-mobile.png' });
  await page.keyboard.press('Space');
  await expect(demo).toBeHidden();
  await expect(page.locator('#league-screen')).toBeVisible();
  assert.equal(await page.locator('.app').evaluate(node => node.inert), false);

  // A paused game and its save survive the whole demo and its wake-up click.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await startFranchise(page);
  await page.evaluate(async () => {
    const { state, match, loop } = await import('/src/main.js');
    state.set('playing'); match.start(60, false); state.set('paused'); loop.render();
  });
  const snapshot = () => page.evaluate(async () => {
    const { play, match, state } = await import('/src/main.js');
    return { phase: match.rules.phase, clock: match.rules.clock, score: match.rules.score,
      players: play.players.map(p => [p.x, p.y]), state: state.playing, saved: JSON.stringify(localStorage) };
  });
  const before = await snapshot();
  await page.clock.fastForward(45100);
  await expect(demo).toBeVisible();
  await page.evaluate(async () => {
    const { attract } = await import('/src/main.js');
    attract.match.rules.phase = 'final'; attract.match.lastPhase = 'final'; attract.match.phaseAge = 7;
    const n = attract.gameNumber; attract.update(1 / 60);
    if (attract.gameNumber !== n + 1) throw new Error('Next exhibition did not start');
  });
  await page.clock.runFor(1000);
  assert.deepEqual(await snapshot(), before, 'exhibition never changes the real game or saved franchise');
  await page.mouse.click(600, 400);
  await expect(demo).toBeHidden();
  assert.deepEqual(await snapshot(), before, 'wake-up click is consumed and the game stays paused');
  assert.deepEqual(errors, []);
  console.log('PASS: 45-second idle threshold, activity resets timer, live CPU exhibition, rotating games, desktop/mobile/landscape layouts, wake-up input consumed, exact paused-game and save preservation, zero browser errors.');
} finally { await browser.close(); }
