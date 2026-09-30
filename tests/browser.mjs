import { lockMeter } from './special-helper.mjs';
import { pullPass } from './pull-helper.mjs';
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
  await page.goto('http://localhost:5173'); await page.locator('#start-franchise').click();
  await page.evaluate(async () => { const { match, play } = await import('/src/main.js'); match.rules.random = () => .4; match.opponent.random = () => .4; play.random = () => .4; });
  const snapshot = () => page.evaluate(async () => {
    const { play, state, match } = await import('/src/main.js'); const r = match.rules;
    return { phase: r.phase, playPhase: play.phase, result: r.result, score: {...r.score}, possession: r.possession, quarter: r.quarter, clock: r.clock, playClock: r.playClock, down: r.down, spot: r.spot, controlled: play.controlled.number, x: play.controlled.x, y: play.controlled.y, ball: { x: play.ball.x, y: play.ball.y, height: play.ball.height, mode: play.ball.mode }, paused: !state.playing };
  });
  const waitFor = async (predicate, timeout = 7000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) { const value = await snapshot(); if (predicate(value)) return value; await page.waitForTimeout(40); }
    assert.fail(`State timeout: ${JSON.stringify(await snapshot())}`);
  };
  const key = async code => { await page.keyboard.press(code); await page.waitForTimeout(40); };
  const clickWorld = point => pullPass(page, point);
  const fixture = async ({ spot = 25, down = 1, quarter = 1, clock = 60, playClock = 40 } = {}) => {
    await page.evaluate(async f => {
      const { match, state } = await import('/src/main.js'); state.set('playing'); match.start(60, false);
      Object.assign(match.rules, { down: f.down, quarter: f.quarter, clock: f.clock, playClock: f.playClock });
      match.rules.newSeries(f.spot); match.rules.down = f.down; match.prepare(); match.selectPlay('go');
    }, { spot, down, quarter, clock, playClock });
    await page.locator('#game').focus(); await page.waitForTimeout(80);
  };

  assert.equal((await snapshot()).phase, 'pregame');
  await page.screenshot({ path: 'test-results/phase3-start.png', fullPage: true });
  await page.selectOption('#quarter-length', '60'); await page.locator('#screen-action').click(); await page.evaluate(async()=>{const{match,loop}=await import('/src/main.js');match.start(60,false);loop.render()});
  await waitFor(s => s.phase === 'ready'); assert.equal((await snapshot()).spot, 25);
  assert.equal(await page.locator('#down-distance').innerText(), '1ST & 10'); assert.equal(await page.locator('#game-clock').innerText(), '1:00');
  await page.locator('[data-play="go"]').click();
  await key('Space'); await page.waitForTimeout(1000);
  const receiver = await page.evaluate(async () => { const p = (await import('/src/main.js')).play.receivers[0]; return { x: p.x, y: p.y }; });
  await clickWorld(receiver); await waitFor(s => s.playPhase === 'flight');
  await key('Escape'); const frozen = await snapshot(); await page.waitForTimeout(200);
  const still = await snapshot(); assert.equal(still.clock, frozen.clock); assert.equal(still.playClock, frozen.playClock); assert.deepEqual(still.ball, frozen.ball);
  await key('Escape'); await waitFor(s => s.playPhase === 'running'); assert.equal((await snapshot()).controlled, '08');
  const caughtX = (await snapshot()).x;
  await page.waitForTimeout(200); assert.ok((await snapshot()).x > caughtX + 10, 'catch automatically runs without movement keys');
  await page.keyboard.down('Shift'); await page.keyboard.down('d'); await key('j');
  await waitFor(s => s.phase === 'result', 14000); await page.keyboard.up('d'); await page.keyboard.up('Shift');
  assert.equal((await snapshot()).result, 'TOUCHDOWN'); assert.equal((await snapshot()).score.home, 6);
  await page.screenshot({ path: 'test-results/phase3-touchdown.png', fullPage: true });
  await key('Space'); assert.equal((await snapshot()).phase, 'extraPoint'); const patClock = (await snapshot()).clock;
  await key('Space'); await lockMeter(page); await waitFor(s => s.phase === 'result');
  assert.equal((await snapshot()).score.home, 7); assert.equal((await snapshot()).clock, patClock); assert.equal((await snapshot()).possession, 'away');
  await key('Space'); await lockMeter(page,.5); await waitFor(s => s.phase === 'return'); await waitFor(s => s.phase === 'live',20000); assert.equal((await snapshot()).possession, 'away');
  const cpuX = (await snapshot()).x; await key('a'); assert.ok((await snapshot()).x >= cpuX - 1, 'human input cannot move CPU QB');

  // Isolated UI fixtures check actions and scoreboard, while full-match test below uses natural outcomes.
  await fixture({ spot: 75, down: 4 }); await key('f'); await lockMeter(page); await waitFor(s => s.phase === 'result');
  assert.equal((await snapshot()).result, 'FIELD GOAL GOOD'); assert.equal((await snapshot()).score.home, 3); assert.equal((await snapshot()).possession, 'away');
  await fixture({ spot: 25, down: 4 }); await page.locator('#punt').click(); await lockMeter(page); await waitFor(s => s.phase === 'result');
  assert.match((await snapshot()).result, /^PUNT/); assert.equal((await snapshot()).possession, 'away'); assert.ok((await snapshot()).spot >= 15 && (await snapshot()).spot <= 20);
  await fixture({ playClock: .15 }); await waitFor(s => s.result === 'DELAY OF GAME'); assert.equal((await snapshot()).spot, 20); assert.equal((await snapshot()).down, 1);
  await fixture(); await key('Space'); const beforeReset = await snapshot(); await key('r'); assert.equal((await snapshot()).phase, 'live'); assert.ok((await snapshot()).clock <= beforeReset.clock);
  await page.locator('#pause').click(); assert.equal((await snapshot()).paused, true); await page.locator('#resume').click();
  await page.evaluate(() => window.dispatchEvent(new Event('blur'))); assert.equal((await snapshot()).paused, true); await page.locator('#resume').click();

  for (const [width, height] of [[960, 720], [1920, 1080], [540, 800]]) {
    await fixture(); await page.setViewportSize({ width, height }); await page.waitForTimeout(100);
    const size = await page.locator('#game').evaluate(c => ({ width: c.width, height: c.height, cssWidth: c.clientWidth, cssHeight: c.clientHeight, overflow: document.documentElement.scrollWidth > innerWidth }));
    assert.equal(size.width, size.cssWidth); assert.equal(size.height, size.cssHeight); assert.equal(size.overflow, false);
    await page.screenshot({ path: `test-results/phase3-viewport-${width}.png`, fullPage: true });
    await key('Space'); await page.waitForTimeout(850);
    const target = await page.evaluate(async () => { const p = (await import('/src/main.js')).play.receivers[0]; return { x: p.x, y: p.y }; });
    await clickWorld(target); await waitFor(s => s.playPhase === 'running'); assert.equal((await snapshot()).controlled, '08');
  }

  // Accelerate only the tick delivery; run the real controller, physics and AI through all four quarters.
  // User-facing quarter/halftime screens are advanced with their actual button.
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.evaluate(async () => {
    const { match, loop, state } = await import('/src/main.js'); state.set('playing'); loop.stop(); match.start(10);
  });
  const seen = new Set();
  for (let segment = 0; segment < 12; segment++) {
    const value = await page.evaluate(async () => {
      const { match, loop } = await import('/src/main.js'); const { Opponent } = await import('/src/game/Opponent.js');
      const coach = new Opponent(() => .4); const r = match.rules;
      for (let i = 0; i < 15000 && !['quarterBreak', 'halftime', 'final'].includes(r.phase); i++) {
        if (r.phase === 'ready' && match.humanTurn) { coach.reset(); match.snap(); }
        if (r.phase === 'extraPoint' && match.humanTurn) match.kick('extraPoint');
        if (r.phase === 'result') match.advance();
        match.update(1 / 60, match.humanTurn && r.phase === 'live' ? coach.movement(match.play) : { x: 0, y: 0 });
      }
      loop.render(); return { phase: r.phase, quarter: r.quarter, score: {...r.score} };
    });
    seen.add(value.phase);
    await page.screenshot({ path: `test-results/phase3-${value.phase}-q${value.quarter}.png`, fullPage: true });
    assert.equal(await page.locator('#match-screen').isVisible(), true);
    if (value.phase === 'final') {
      assert.equal(value.quarter, 4); assert.equal(Number(await page.locator('#home-score').innerText()), value.score.home);
      assert.equal(Number(await page.locator('#away-score').innerText()), value.score.away); assert.equal(await page.locator('#quarter').innerText(), 'FINAL');
      assert.match(await page.locator('#screen-title').innerText(), /wins|Tie game/); break;
    }
    await page.locator('#screen-action').click();
  }
  assert.ok(seen.has('quarterBreak')); assert.ok(seen.has('halftime')); assert.ok(seen.has('final'));
  const final = await snapshot(); await key('f'); await key('k'); assert.deepEqual((await snapshot()).score, final.score);
  await page.locator('#screen-action').click();
  await page.evaluate(async () => { const {loop} = await import('/src/main.js'); loop.start(); });
  await waitFor(s => s.phase === 'pregame'); assert.deepEqual((await snapshot()).score, {home: 0, away: 0});
  await page.locator('#screen-action').click(); await waitFor(s => s.phase === 'kickoff');
  assert.deepEqual(errors, []);
  console.log('PASS: start/quarter selection, live mouse completion and touchdown, untimed PAT, CPU possession, field goal, punt, delay of game, no reset exploit, both clocks paused, focus loss, four responsive viewports, real four-quarter match with quarter/halftime/final screens, scoreboard, new game, zero console/network errors.');
} finally { await browser.close(); }
