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
  await page.goto('http://localhost:5173');
  await page.evaluate(async () => (await import('/src/main.js')).loop.stop());
  await page.locator('#start-franchise').click();

  const render = () => page.evaluate(async () => (await import('/src/main.js')).loop.render());
  const layout = () => page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    (await import('/src/main.js')).loop.render();
  });
  const tick = count => page.evaluate(async count => {
    const { loop } = await import('/src/main.js');
    for (let i = 0; i < count; i++) loop.update(1 / 60);
    loop.render();
  }, count);
  const fixture = async (options = {}) => {
    await page.evaluate(async options => {
      const { match, play, state, loop, camera } = await import('/src/main.js');
      state.set('playing'); match.opponent.random = () => .35; match.start(120, false);
      const r = match.rules;
      r.possession = options.side || 'home'; r.quarter = options.quarter || 1;
      r.spot = options.spot ?? 25; r.down = options.down || 1;
      r.firstDownLine = Math.min(100, r.spot + (options.distance || 10));
      r.clock = options.clock ?? 120; r.clockRunning = !!options.running;
      match.prepare();
      if (match.humanTurn) {
        match.cpuCoverage = options.coverage || 'man'; match.cpuAdjustment = 'balanced';
        match.configurePlay(options.play || 'slants'); match.selectedPlayId = options.play || 'slants';
      }
      play.random = () => .25;
      camera.follow(play.controlled, 0, true); loop.render();
      document.querySelector('#game').focus({ preventScroll: true });
    }, options);
    await layout();
  };
  const read = () => page.evaluate(async () => {
    const { match, play, state } = await import('/src/main.js');
    const r = match.rules;
    return {
      phase: r.phase, playPhase: play.phase, playId: play.call?.id, formation: play.formation,
      selectedFormation: match.selectedFormation, motion: match.selectedMotion, depth: match.throwDepth,
      tempo: match.tempo, coverage: play.coverage, adjustment: play.defensiveAdjustment,
      clock: r.clock, playClock: r.playClock, running: r.clockRunning, timeouts: { ...r.timeouts },
      down: r.down, distance: r.yardsToGo, spot: r.spot, quarter: r.quarter, possession: r.possession,
      result: r.result, playNumber: r.playNumber, canThrow: play.canThrow, paused: !state.playing,
      line: play.lineOfScrimmage, yard: play.field.yard,
      receivers: play.receivers.map(player => ({ slot: player.slot, x: player.x, y: player.y, route: player.route })),
      defenders: play.defenders.map(player => ({ x: player.x, y: player.y, role: player.coverageRole })),
      ball: { mode: play.ball.mode, target: play.ball.target, elapsed: play.ball.elapsed },
    };
  });
  const chart = () => page.locator('#call-preview').evaluate(canvas => canvas.toDataURL());
  const sameSituation = (before, after, message) => {
    for (const key of ['clock', 'playClock', 'down', 'distance', 'spot', 'quarter', 'possession', 'timeouts']) {
      assert.deepEqual(after[key], before[key], `${message}: ${key}`);
    }
  };
  const screenshot = async name => {
    // Render after expanding the capture viewport: ResizeObserver clears canvas
    // pixels, and this deterministic suite deliberately has no animation loop.
    await layout();
    const originalViewport = page.viewportSize();
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: originalViewport.width, height: Math.max(originalViewport.height, height + 200) });
    await layout();
    await page.screenshot({ path: `test-results/strategy-${name}.png` });
    await page.setViewportSize(originalViewport); await layout();
  };

  await render(); await expect(page.locator('#strategy-panel')).toBeHidden();
  await fixture({ down: 3, distance: 7, spot: 45, quarter: 2, clock: 77 });
  await expect(page.locator('#strategy-panel')).toBeVisible();
  await expect(page.locator('#down-distance')).toHaveText('3RD & 7');
  await expect(page.locator('#ball-spot')).toHaveText('OWN 45');
  await expect(page.locator('#strategy-situation')).toHaveText('Q2 1:17 / 3RD & 7 / OWN 45');
  await expect(page.locator('#strategy-look')).toContainText('Man coverage');
  assert.ok((await page.locator('#strategy-advice').innerText()).length > 70);

  const formations = { spread: 'Shotgun spread', bunch: 'Bunch right', tight: 'Singleback tight', offset: 'Offset left' };
  const alignments = new Set(), charts = new Set();
  const initial = await read();
  for (const [id, name] of Object.entries(formations)) {
    await page.selectOption('#strategy-formation', id); await render();
    const selected = await read();
    assert.equal(selected.formation, id); assert.equal(selected.selectedFormation, id);
    sameSituation(initial, selected, `${id} formation keeps the game situation`);
    await expect(page.locator('#call-formation')).toHaveText(name);
    await expect(page.locator('#call-preview')).toHaveAttribute('aria-label', new RegExp(name));
    alignments.add(JSON.stringify(selected.receivers.map(player => [player.x, player.y])));
    charts.add(await chart());
  }
  assert.equal(alignments.size, 4, 'all four formations move actual player alignments');
  assert.equal(charts.size, 4, 'the play chart paints all four formation changes');
  await page.selectOption('#strategy-formation', 'play'); await render();
  assert.equal((await read()).formation, 'spread');

  // Audibles change the call while both clocks and the current down stay intact.
  await page.locator('#game').focus(); const beforeAudible = await read();
  await page.keyboard.press('e'); await render();
  assert.equal((await read()).playId, 'outs'); sameSituation(beforeAudible, await read(), 'next audible');
  await page.keyboard.press('q'); await render();
  assert.equal((await read()).playId, 'slants'); sameSituation(beforeAudible, await read(), 'previous audible');

  // A real presnap motion update moves both the receiver and his man defender.
  await fixture({ running: true });
  const beforeMotion = await read(), beforeMotionChart = await chart();
  await page.selectOption('#strategy-motion', 'right'); await render();
  sameSituation(beforeMotion, await read(), 'motion selection does not reset clocks');
  await tick(60); const afterMotion = await read();
  const receiverBefore = beforeMotion.receivers.find(player => player.slot === '81');
  const receiverAfter = afterMotion.receivers.find(player => player.slot === '81');
  const manIndex = beforeMotion.defenders.findIndex(player => player.role.type === 'man' && player.role.receiverIndex === 1);
  assert.ok(receiverAfter.y - receiverBefore.y > 30, 'motion receiver travels across the formation');
  assert.ok(afterMotion.defenders[manIndex].y - beforeMotion.defenders[manIndex].y > 20, 'man defender follows visible motion');
  assert.ok(Math.abs(afterMotion.clock - 119) < 1e-6); assert.ok(Math.abs(afterMotion.playClock - 39) < 1e-6);
  assert.notEqual(await chart(), beforeMotionChart, 'motion updates the route chart');
  await page.locator('#game').focus();
  await page.keyboard.press('m'); await render(); assert.equal((await read()).motion, 'none');
  await page.keyboard.press('m'); await render(); assert.equal((await read()).motion, 'left');
  await screenshot('motion');
  await page.locator('#strategy-motion').focus(); await tick(2);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'strategy-motion', 'animation updates retain selector focus');

  // Observe the actual renderer's preview input while retaining its normal drawing.
  await page.evaluate(async () => {
    const { renderer } = await import('/src/main.js');
    const original = renderer.playRenderer.drawGuides.bind(renderer.playRenderer);
    renderer.playRenderer.drawGuides = (context, play, aim) => {
      window.strategyPreview = aim ? { target: { ...aim.target }, risk: aim.risk } : null;
      return original(context, play, aim);
    };
  });
  for (const [depth, key, yards] of [['short', '1', 5], ['medium', '2', 14], ['deep', '3', 28]]) {
    await fixture({ play: 'go' });
    await page.locator(`[data-strategy="throwDepth"][data-value="${depth}"]`).click();
    await expect(page.locator(`[data-value="${depth}"]`)).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#game').focus(); await page.keyboard.press('0'); await render();
    assert.equal((await read()).depth, 'auto');
    await expect(page.locator('[data-value="auto"]')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press(key); await render(); assert.equal((await read()).depth, depth);
    await page.locator('#game').scrollIntoViewIfNeeded();
    const box = await page.locator('#game').boundingBox();
    const start = { x: box.x + box.width * .55, y: box.y + box.height * .5 };
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await render(); await layout();
    assert.equal((await read()).playPhase, 'passing');
    assert.equal(await page.locator('#strategy-formation').isEnabled(), false);
    assert.equal(await page.locator('#strategy-motion').isEnabled(), false);
    assert.equal(await page.locator(`[data-value="${depth}"]`).isEnabled(), true);
    // Change the depth while the pointer is held: the live preview follows it.
    await page.keyboard.press(key === '3' ? '1' : '3'); await render();
    await page.mouse.move(start.x - 120, start.y - 12); await render();
    const changedPreview = await page.evaluate(() => window.strategyPreview);
    assert.ok(changedPreview?.target);
    await page.keyboard.press(key); await render();
    const preview = await page.evaluate(() => window.strategyPreview);
    const beforeThrow = await read();
    assert.ok(Math.abs((preview.target.x - beforeThrow.line) / beforeThrow.yard - yards) < 1e-6, `${depth} preview at ${yards} yards`);
    // Full-page screenshots resize the capture viewport and correctly cancel a drag.
    if (depth === 'deep') await page.screenshot({ path: 'test-results/strategy-deep-aim.png' });
    await page.mouse.up(); await render(); const thrown = await read();
    assert.equal(thrown.playPhase, 'flight'); assert.equal(thrown.ball.mode, 'flight');
    // A quarter-turn random error is lateral only, allowing exact distance checks.
    assert.ok(Math.abs(thrown.ball.target.x - preview.target.x) < 1e-6, `${depth} actual mouse release matches the preview depth`);
    assert.ok(Math.abs((thrown.ball.target.x - thrown.line) / thrown.yard - yards) < 1e-6);
    await expect(page.locator(`[data-value="${depth}"]`)).toBeDisabled();
    await page.keyboard.press('0'); await render(); assert.equal((await read()).depth, depth, 'depth locks after the ball leaves the hand');
  }
  await fixture({ play: 'play-action' }); await page.locator('#playbook-snap').click(); await render();
  await expect(page.locator('[data-value="short"]')).toBeDisabled();
  await tick(56); assert.equal((await read()).canThrow, true);
  await expect(page.locator('[data-value="short"]')).toBeEnabled();
  await fixture({ play: 'inside' }); await page.locator('#playbook-snap').click(); await tick(30);
  assert.equal((await read()).playPhase, 'running'); await expect(page.locator('[data-value="short"]')).toBeDisabled();

  // Coverage and adjustment selectors change real presnap alignments and roles.
  await fixture({ side: 'away' });
  await expect(page.locator('#strategy-formation')).toBeHidden();
  await expect(page.locator('#strategy-coverage')).toBeEnabled();
  const defensivePositions = new Set(), defensiveRoles = new Set();
  for (const coverage of ['man', 'cover2', 'cover3', 'blitz']) {
    const before = await read(); await page.selectOption('#strategy-coverage', coverage); await render();
    const selected = await read(); assert.equal(selected.coverage, coverage);
    sameSituation(before, selected, `${coverage} defensive call`);
    defensivePositions.add(JSON.stringify(selected.defenders.map(player => [player.x, player.y])));
    defensiveRoles.add(JSON.stringify(selected.defenders.map(player => [player.role.type, player.role.deep || false])));
  }
  assert.equal(defensivePositions.size, 4); assert.equal(defensiveRoles.size, 4);
  await page.selectOption('#strategy-coverage', 'cover2');
  const adjustmentPositions = new Set();
  for (const adjustment of ['balanced', 'press', 'cushion', 'box']) {
    await page.selectOption('#strategy-adjustment', adjustment); await render();
    const selected = await read(); assert.equal(selected.adjustment, adjustment);
    adjustmentPositions.add(JSON.stringify(selected.defenders.map(player => [player.x, player.y])));
    if (adjustment === 'box') assert.equal(selected.defenders.filter(player => player.role.deep).length, 1, 'box support replaces one deep safety');
  }
  assert.equal(adjustmentPositions.size, 4);
  await page.selectOption('#strategy-coverage', 'cover3'); await page.selectOption('#strategy-adjustment', 'cushion');
  await screenshot('defense'); await tick(242); assert.equal((await read()).phase, 'live', 'CPU leaves a real defensive preparation window before snapping');
  await expect(page.locator('#strategy-coverage')).toBeDisabled(); await expect(page.locator('#strategy-adjustment')).toBeDisabled();
  assert.equal((await read()).coverage, 'cover3'); assert.equal((await read()).adjustment, 'cushion');

  // Timeouts stop the game clock, charge the caller and preserve field situation.
  await fixture({ down: 3, distance: 7, spot: 45, running: true }); await tick(60);
  const beforeTimeout = await read(); await page.locator('#strategy-timeout').click(); await render();
  const timeout = await read(); assert.equal(timeout.timeouts.home, 2); assert.equal(timeout.timeouts.away, 3);
  assert.equal(timeout.running, false); assert.equal(timeout.clock, beforeTimeout.clock); assert.equal(timeout.playClock, 25);
  for (const key of ['down', 'distance', 'spot', 'possession']) assert.equal(timeout[key], beforeTimeout[key]);
  await tick(60); assert.equal((await read()).clock, timeout.clock);
  await page.locator('#game').focus(); await page.keyboard.press('t'); await render();
  assert.equal((await read()).timeouts.home, 1);
  await page.locator('#strategy-timeout').click(); await render();
  await expect(page.locator('#strategy-timeout')).toBeDisabled();
  await expect(page.locator('#strategy-timeouts')).toContainText('YOU 0 / CPU 3');
  await fixture({ side: 'away', running: true });
  await page.locator('#strategy-timeout').click(); await render();
  assert.equal((await read()).timeouts.home, 2); assert.equal((await read()).possession, 'away'); assert.equal((await read()).running, false);

  await fixture(); await page.locator('#strategy-kneel').click(); await render();
  const kneel = await read(); assert.equal(kneel.phase, 'result'); assert.equal(kneel.result, 'QB KNEEL');
  assert.equal(kneel.down, 2); assert.equal(kneel.distance, 11); assert.equal(kneel.spot, 24); assert.equal(kneel.clock, 119); assert.equal(kneel.running, true);
  await expect(page.locator('#down-distance')).toHaveText('2ND & 11');
  await page.locator('#strategy-timeout').click(); await render(); assert.equal((await read()).running, false);
  assert.equal((await read()).phase, 'result'); assert.equal((await read()).down, 2);
  await fixture(); await page.locator('#strategy-spike').click(); await render();
  const spike = await read(); assert.equal(spike.result, 'SPIKE'); assert.equal(spike.down, 2);
  assert.equal(spike.spot, 25); assert.equal(spike.distance, 10); assert.equal(spike.clock, 118); assert.equal(spike.running, false);
  await tick(60); assert.equal((await read()).clock, 118);

  // Hurry-up lines up without snapping; chew advances actual clocks and respects pause.
  await fixture(); await page.locator('#strategy-kneel').click(); await render();
  await expect(page.locator('#strategy-tempo')).toBeEnabled(); await page.selectOption('#strategy-tempo', 'hurry');
  await tick(20); assert.equal((await read()).phase, 'result');
  await tick(3); const hurried = await read(); assert.equal(hurried.phase, 'ready'); assert.equal(hurried.playPhase, 'presnap'); assert.equal(hurried.playNumber, 1);
  await fixture({ running: true }); await page.selectOption('#strategy-tempo', 'chew');
  await tick(60); const chewed = await read();
  assert.ok(Math.abs(chewed.clock - 114) < 1e-6); assert.ok(Math.abs(chewed.playClock - 34) < 1e-6);
  await page.locator('#pause').click(); await render(); const paused = await read();
  assert.equal(paused.paused, true); await expect(page.locator('#strategy-formation')).toBeDisabled();
  await expect(page.locator('#strategy-timeout')).toBeDisabled(); await expect(page.locator('#strategy-tempo')).toBeDisabled();
  await tick(120); const frozen = await read(); sameSituation(paused, frozen, 'pause freezes both strategy clocks');
  assert.deepEqual(frozen.receivers, paused.receivers); assert.deepEqual(frozen.defenders, paused.defenders);
  await page.locator('#resume').click(); await tick(1); assert.ok((await read()).clock < frozen.clock);
  await fixture(); await page.selectOption('#strategy-tempo', 'chew'); await tick(60);
  assert.equal((await read()).clock, 120); assert.ok(Math.abs((await read()).playClock - 39) < 1e-6, 'chew cannot accelerate a stopped game clock');

  // Inspect the full application's width across possession, play and break screens.
  const scenes = ['ready', 'live', 'result', 'cpuReady', 'cpuLive', 'pregame', 'halftime', 'quarterBreak', 'extraPoint', 'kickMeter', 'kickoff', 'return'];
  for (const width of [320, 390, 540, 960, 1440]) {
    await page.setViewportSize({ width, height: 1100 });
    for (const scene of scenes) {
      await fixture({ side: scene.startsWith('cpu') ? 'away' : 'home' });
      await page.evaluate(async scene => {
        const { match, play, loop } = await import('/src/main.js');
        const r = match.rules;
        if (['live', 'cpuLive'].includes(scene)) match.snap();
        if (scene === 'result') match.clockPlay('spike');
        if (['pregame', 'halftime', 'quarterBreak'].includes(scene)) { r.phase = scene; r.breakQuarter = 1; }
        if (scene === 'extraPoint') r.phase = 'extraPoint';
        if (scene === 'kickMeter') match.kick('fieldGoal');
        if (['kickoff', 'return'].includes(scene)) {
          match.returns.launch(r, { power: .1, accuracy: 0 });
          if (scene === 'return') match.returns.updateFlight(3, r);
        }
        loop.render();
      }, scene);
      await layout();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}px ${scene} has no horizontal page overflow`);
      const active = ['ready', 'live', 'result', 'cpuReady', 'cpuLive'].includes(scene);
      assert.equal(await page.locator('#strategy-panel').isVisible(), active, `${scene}: appropriate sideline visibility`);
      const dimensions = await page.locator('#game').evaluate(canvas => ({ width: canvas.clientWidth, height: canvas.clientHeight }));
      assert.ok(dimensions.width > 200 && dimensions.height > 100, `${width}px ${scene} keeps the field usable`);
    }
    await fixture(); await screenshot(`responsive-${width}`);
  }
  // Final is last because rendering it commits the current fixture game result.
  for (const width of [320, 390, 540, 960, 1440]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.evaluate(async () => { const { match, loop } = await import('/src/main.js'); match.rules.phase = 'final'; loop.render(); });
    await layout();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}px final has no horizontal page overflow`);
    await expect(page.locator('#strategy-panel')).toBeHidden();
  }
  assert.deepEqual(errors, []);
  console.log('PASS: four actual formations and charts; Q/E audibles; receiver/man-defender motion; mouse throw previews and releases at 5/14/28 yards; 0–3 depth keys and live locks; four coverage roles and adjustments; charged timeouts; kneel/spike; real hurry/chew clocks; frozen pause; all match phase layouts at 320/390/540/960/1440; zero browser errors.');
} finally { await browser.close(); }
