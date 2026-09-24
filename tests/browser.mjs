import { chromium } from '@playwright/test';
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
  await page.goto('http://localhost:5173');
  await page.evaluate(async () => { const { play } = await import('/src/main.js'); play.random = () => .4; });
  const snapshot = () => page.evaluate(async () => {
    const { play, state } = await import('/src/main.js');
    return { phase: play.phase, result: play.result, controlled: play.controlled.number, x: play.controlled.x, y: play.controlled.y, elapsed: play.elapsed, ball: { x: play.ball.x, y: play.ball.y, height: play.ball.height, mode: play.ball.mode }, jukeCooldown: play.controlled.jukeCooldown, paused: !state.playing };
  });
  const hold = async (key, ms = 300) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
  const reset = async () => { await page.locator('#game').focus(); await page.keyboard.press('r'); await page.waitForTimeout(40); };
  const waitPhase = async (phase, timeout = 5000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if ((await snapshot()).phase === phase) return;
      await page.waitForTimeout(40);
    }
    assert.fail(`Expected ${phase}; got ${JSON.stringify(await snapshot())}`);
  };
  const clickWorld = async point => {
    const position = await page.evaluate(async p => {
      const { camera } = await import('/src/main.js'); const s = camera.worldToScreen(p); const rect = document.querySelector('#game').getBoundingClientRect();
      return { x: s.x + rect.left, y: s.y + rect.top };
    }, point);
    await page.mouse.move(position.x, position.y); await page.mouse.click(position.x, position.y);
  };
  assert.equal((await snapshot()).phase, 'presnap');
  await hold('d'); assert.equal((await snapshot()).x, 790);
  await page.screenshot({ path: 'test-results/phase2-presnap.png', fullPage: true });
  await page.keyboard.press('Space'); await waitPhase('passing');
  for (const key of ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']) {
    await reset(); await page.keyboard.press('Space'); const before = await snapshot(); await hold(key, 160); const after = await snapshot();
    assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > 3, `${key} moves QB`);
  }
  await reset(); await page.keyboard.press('Space'); await hold('d'); const walk = (await snapshot()).x;
  await reset(); await page.keyboard.press('Space'); await page.keyboard.down('Shift'); await hold('d'); await page.keyboard.up('Shift'); assert.ok((await snapshot()).x > walk);
  await reset(); await page.locator('#snap').click(); await waitPhase('passing');
  await page.waitForTimeout(1000);
  const receiver = await page.evaluate(async () => { const p = (await import('/src/main.js')).play.receivers[0]; return { x: p.x, y: p.y }; });
  await clickWorld(receiver); await waitPhase('flight'); await page.waitForTimeout(100);
  const flying = await snapshot(); assert.ok(flying.ball.height > 0); assert.equal(flying.ball.mode, 'flight');
  await page.keyboard.press('Escape'); assert.equal(await page.locator('#overlay').isVisible(), true);
  const frozen = await snapshot(); await hold('d', 180); assert.deepEqual((await snapshot()).ball, frozen.ball); assert.equal((await snapshot()).elapsed, frozen.elapsed);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'test-results/phase2-flight.png', fullPage: true });
  await waitPhase('running'); assert.equal((await snapshot()).controlled, '08');
  await page.keyboard.down('Shift'); await page.keyboard.down('d'); await page.keyboard.press('j');
  assert.ok((await snapshot()).jukeCooldown > 0);
  await page.screenshot({ path: 'test-results/phase2-catch.png', fullPage: true });
  await waitPhase('dead', 12000);
  await page.keyboard.up('d'); await page.keyboard.up('Shift');
  assert.equal((await snapshot()).result, 'TOUCHDOWN');
  assert.equal(await page.locator('#play-result').innerText(), 'TOUCHDOWN');
  await page.screenshot({ path: 'test-results/phase2-touchdown.png', fullPage: true });
  await page.keyboard.press('Space'); assert.equal((await snapshot()).phase, 'presnap');
  await page.keyboard.press('Space'); await page.keyboard.press('h'); assert.equal((await snapshot()).controlled, '22');
  await waitPhase('dead', 12000);
  assert.equal((await snapshot()).result, 'TACKLED');
  await page.locator('#snap').click(); assert.equal((await snapshot()).phase, 'presnap');
  await page.keyboard.press('Space'); await clickWorld({ x: 500, y: 250 }); await waitPhase('dead'); assert.equal((await snapshot()).result, 'INCOMPLETE');
  await reset(); await page.keyboard.press('Space');
  // Pass directly at the safety: actual mouse throw, no player or ball teleporting.
  await clickWorld({ x: 1450, y: 540 }); await waitPhase('dead'); assert.equal((await snapshot()).result, 'INTERCEPTION');
  await reset(); await page.keyboard.press('Space');
  await page.locator('#pause').click(); assert.equal((await snapshot()).paused, true);
  await page.locator('#resume').click(); assert.equal((await snapshot()).paused, false);
  await page.keyboard.press('p'); assert.equal((await snapshot()).paused, true); await page.keyboard.press('p');
  await page.evaluate(() => window.dispatchEvent(new Event('blur'))); assert.equal((await snapshot()).paused, true);
  await page.locator('#resume').click(); await reset();
  for (const [width, height] of [[960, 720], [1920, 1080], [540, 800]]) {
    await page.setViewportSize({ width, height }); await page.waitForTimeout(100);
    const size = await page.locator('#game').evaluate(c => ({ width: c.width, height: c.height, cssWidth: c.clientWidth, cssHeight: c.clientHeight, overflow: document.documentElement.scrollWidth > innerWidth }));
    assert.equal(size.width, size.cssWidth); assert.equal(size.height, size.cssHeight); assert.equal(size.overflow, false);
    await page.screenshot({ path: `test-results/phase2-viewport-${width}.png`, fullPage: true });
    await page.keyboard.press('Space'); await page.waitForTimeout(850);
    const target = await page.evaluate(async () => { const p = (await import('/src/main.js')).play.receivers[0]; return { x: p.x, y: p.y }; });
    await clickWorld(target); await waitPhase('running'); assert.equal((await snapshot()).controlled, '08'); await reset();
  }
  assert.deepEqual(errors, []);
  console.log('PASS: snap, routes, mouse passing, airborne pause, catches/control transfer, all movement keys, sprint, juke, handoff, full touchdown/tackle/interception/incompletion plays, restart, focus loss, 4 viewport sizes and mouse coordinate mapping, zero browser errors.');
} finally { await browser.close(); }
