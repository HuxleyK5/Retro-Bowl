import { chromium, expect } from '@playwright/test';
import { startFranchise } from './start-helper.mjs';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://localhost:5173');
  await page.evaluate(async () => (await import('/src/main.js')).loop.stop());
  await startFranchise(page);
  const render = () => page.evaluate(async () => (await import('/src/main.js')).loop.render());
  await page.evaluate(async () => {
    const { match, state, loop } = await import('/src/main.js');
    state.set('playing'); match.start(120, false); match.prepare();
    match.rules.clockRunning = true; loop.render();
  });
  await expect(page.locator('#strategy-panel select, #strategy-panel fieldset, #beginner-strategy-options')).toHaveCount(0);
  await expect(page.locator('#call-fit')).toBeHidden();
  await expect(page.locator('#strategy-timeout')).toBeEnabled();
  await expect(page.locator('#strategy-timeouts')).toHaveText('3 timeouts left');
  await page.locator('#strategy-timeout').click(); await render();
  const result = await page.evaluate(async () => {
    const { match } = await import('/src/main.js');
    return { left: match.rules.timeouts.home, running: match.rules.clockRunning };
  });
  assert.deepEqual(result, { left: 2, running: false });
  await expect(page.locator('#strategy-timeouts')).toHaveText('2 timeouts left');
  await page.evaluate(async () => {
    const { state, match, loop } = await import('/src/main.js');
    match.rules.clockRunning = true; state.set('paused'); loop.render();
  });
  await expect(page.locator('#strategy-timeout')).toBeDisabled();
  for (const width of [320, 390, 540, 960, 1440]) {
    await page.setViewportSize({ width, height: 1000 }); await render();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await expect(page.locator('#strategy-panel')).toBeVisible();
  }
  assert.deepEqual(errors, []);
  console.log('PASS: advanced controls removed, coverage read hidden, timeout charges and stops clock, pause disables timeout, mobile and desktop layouts, zero browser errors.');
} finally { await browser.close(); }
