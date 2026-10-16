import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto('http://127.0.0.1:5173');
  await page.locator('#start-franchise').click();
  const render = () => page.evaluate(async () => (await import('/src/main.js')).loop.render());
  const layout = () => page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    (await import('/src/main.js')).loop.render();
  });
  const fixture = async (options = {}) => {
    await page.evaluate(async options => {
      const { match, play, state, loop, renderer, camera } = await import('/src/main.js');
      loop.stop(); state.set('playing'); match.start(120, false);
      const r = match.rules;
      r.down = options.down || 1; r.newSeries(options.spot || 35); r.down = options.down || 1;
      r.firstDownLine = Math.min(100, r.spot + (options.distance || 10));
      r.quarter = options.quarter || 1; r.clock = options.clock || 120;
      match.cpuCoverage = options.coverage || 'man'; match.cpuAdjustment = options.adjustment || 'balanced';
      match.selectedPlayId = options.play || 'slants'; match.configurePlay();
      renderer.resetPresentation(); renderer.stadium.cycle = 'day';
      camera.follow(play.controlled, 0, true); loop.render();
    }, options);
    await layout();
  };
  const screenshot = async name => { await layout(); await page.screenshot({ path: `test-results/design-${name}.png` }); };
  await fixture();

  // Field and pause remain crisp; pausing cannot advance either clock or motion.
  await page.locator('#pause').click(); await render();
  const pausedStyle = await page.locator('#overlay').evaluate(element => {
    const style = getComputedStyle(element);
    return { blur: style.backdropFilter, background: style.backgroundColor };
  });
  assert.equal(pausedStyle.blur, 'none');
  const alpha = Number(pausedStyle.background.match(/[\d.]+/g).at(-1));
  assert.ok(alpha <= .35, 'pause tint preserves the readable field beneath the card');
  const frozen = await page.evaluate(async () => {
    const { match, play } = await import('/src/main.js');
    return { clock: match.rules.clock, playClock: match.rules.playClock, x: play.qb.x, y: play.qb.y };
  });
  await page.evaluate(async () => { const { loop } = await import('/src/main.js'); for (let i = 0; i < 60; i++) loop.update(1 / 60); loop.render(); });
  assert.deepEqual(await page.evaluate(async () => { const { match, play } = await import('/src/main.js'); return { clock: match.rules.clock, playClock: match.rules.playClock, x: play.qb.x, y: play.qb.y }; }), frozen);
  await screenshot('paused-desktop');
  await page.locator('#resume').click(); await render();

  // Actual score changes animate once. Rendering the same score must not replay the cue.
  await page.evaluate(async () => { const { match, loop } = await import('/src/main.js'); match.rules.addScore('home', 6); loop.render(); });
  await layout();
  await expect(page.locator('#home-score')).toHaveText('6');
  const animation = () => page.locator('#home-score').evaluate(element => element.getAnimations().map(animation => ({ name: animation.animationName, start: animation.startTime, state: animation.playState, time: animation.currentTime })));
  const scored = await animation();
  assert.ok(scored.length > 0, 'the changed score gets a visible animation');
  await render(); await render();
  assert.equal((await animation())[0].start, scored[0].start, 'repeated renders do not restart the score animation');
  await page.locator('#pause').click(); await render();
  const held = await animation();
  assert.equal(held[0].state, 'paused');
  await page.waitForTimeout(100);
  assert.equal((await animation())[0].time, held[0].time, 'presentation pauses with the game');
  await page.locator('#resume').click(); await render();

  // Main information stays visible and the field remains usable at narrow widths.
  for (const width of [320, 390, 540, 960, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1100 }); await fixture();
    for (const id of ['home-score', 'away-score', 'quarter', 'game-clock', 'down-distance', 'ball-spot', 'possession']) await expect(page.locator(`#${id}`)).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}px pre-snap fits`);
    const field = await page.locator('#game').evaluate(canvas => ({ width: canvas.clientWidth, height: canvas.clientHeight }));
    assert.ok(field.width > 200 && field.height > 250, 'field retains useful dimensions');
    await screenshot(`ready-${width}`);
    await page.locator('#pause').click(); await render();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}px paused fits`);
    if (width === 390) await screenshot('paused-mobile');
    await page.locator('#resume').click(); await render();
  }

  await page.setViewportSize({ width: 1440, height: 1100 }); await fixture();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(async () => { const { match, loop } = await import('/src/main.js'); match.rules.addScore('away', 3); loop.render(); });
  assert.equal(await page.locator('#away-score').evaluate(element => getComputedStyle(element).animationName), 'none');
  await expect(page.locator('#away-score')).toHaveText('3');
  assert.deepEqual(errors, []);
  console.log('PASS: readable paused field, frozen clocks, score animation without replay, paused/reduced-motion cues, visible scoreboard metrics and usable field from 320–1920px, zero browser errors.');
} finally { await browser.close(); }
