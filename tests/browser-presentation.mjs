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
  await page.evaluate(async () => (await import('/src/main.js')).loop.stop());
  await page.locator('#start-franchise').click();

  const tick = count => page.evaluate(async count => {
    const { loop } = await import('/src/main.js');
    for (let i = 0; i < count; i++) loop.update(1 / 60);
    loop.render();
  }, count);
  const layout = () => page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    (await import('/src/main.js')).loop.render();
  });
  const fixture = () => page.evaluate(async () => {
    const { match, play, renderer, state, audio, loop, camera } = await import('/src/main.js');
    state.set('playing'); match.start(60, false); match.selectPlay('go');
    renderer.resetPresentation(); audio.reset(play, match.rules); play.random = () => .99;
    for (const defender of play.defenders) { defender.x = play.field.width - 400; defender.y = play.field.height - 70; defender.vx = defender.vy = 0; }
    camera.follow(play.controlled, 0, true); loop.render();
  });
  const snapshot = () => page.evaluate(async () => {
    const { match, play, renderer, audio, state } = await import('/src/main.js');
    return { phase: match.rules.phase, playPhase: play.phase, score: { ...match.rules.score }, possession: match.rules.possession,
      result: match.rules.result, playResult: play.result, down: match.rules.down, spot: match.rules.spot,
      events: play.events.map(event => event.type), paused: !state.playing,
      effects: renderer.effects.effects.map(effect => ({ id: effect.id, type: effect.type, age: effect.age })),
      time: renderer.stadium.time, darkness: renderer.stadium.darkness, crowd: renderer.stadium.crowdEnergy,
      weather: renderer.stadium.weather, cycle: renderer.stadium.cycle, label: renderer.stadium.label,
      audio: { enabled: audio.enabled, context: audio.context?.state || null, status: audio.status, time: audio.time,
        notes: audio.notes.length, voices: audio.voices.size, reaction: audio.reaction, crowd: !!audio.crowd } };
  });
  const audioState = state => page.waitForFunction(async expected => {
    const { audio } = await import('/src/main.js'); return audio.context?.state === expected;
  }, state);
  const screenshot = async name => {
    await layout(); await page.screenshot({ path: `test-results/${name}.png` });
  };
  // Compare the actual composited canvas; weather and lighting must visibly paint.
  const pixels = () => page.locator('#game').evaluate(canvas => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const prior = window.presentationPixels;
    let luminance = 0, changed = 0;
    for (let i = 0; i < data.length; i += 4) {
      luminance += data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722;
      if (prior?.length === data.length && Math.max(Math.abs(data[i] - prior[i]), Math.abs(data[i + 1] - prior[i + 1]), Math.abs(data[i + 2] - prior[i + 2])) > 3) changed++;
    }
    window.presentationPixels = data;
    return { luminance: luminance / (data.length / 4), changed: changed / (data.length / 4), width: canvas.width, height: canvas.height };
  });

  await fixture(); await layout();
  assert.equal(await page.locator('.stadium-bar').isVisible(), true);
  assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'false');
  const initial = await snapshot();
  assert.equal(initial.audio.enabled, false); assert.equal(initial.audio.context, null);
  assert.equal(initial.audio.voices, 0); assert.equal(initial.audio.status, 'muted');

  const beforeControls = await snapshot();
  for (const weather of ['rain', 'snow', 'clear']) await page.selectOption('#stadium-weather', weather);
  for (const cycle of ['night', 'dusk', 'day', 'auto']) await page.selectOption('#stadium-lighting', cycle);
  await page.locator('#stadium-weather').focus(); await page.keyboard.press('Space');
  await page.keyboard.press('Escape');
  const afterControls = await snapshot();
  for (const key of ['score', 'possession', 'phase', 'playPhase', 'down', 'spot']) assert.deepEqual(afterControls[key], beforeControls[key], `${key} unchanged by presentation selectors`);
  // Escape intentionally controls pause globally; resume before exercising sound.
  if (afterControls.paused) await page.locator('#resume').click();

  await page.locator('#sound-toggle').click(); await audioState('running'); await tick(2);
  const audible = await snapshot();
  assert.equal(audible.audio.enabled, true); assert.equal(audible.audio.status, 'on'); assert.equal(audible.audio.crowd, true);
  assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'true');
  await page.evaluate(async () => { const { match, play, loop } = await import('/src/main.js'); match.snap(); play.juke({ x: 1, y: 0 }); loop.update(1 / 60); loop.render(); });
  assert.ok((await snapshot()).effects.some(effect => effect.type === 'juke'));
  await page.locator('#pause').click(); await audioState('suspended');
  const paused = await snapshot(); assert.equal(paused.paused, true);
  await tick(40); const frozen = await snapshot();
  assert.equal(frozen.time, paused.time); assert.equal(frozen.audio.time, paused.audio.time);
  assert.deepEqual(frozen.effects, paused.effects); assert.equal(frozen.audio.voices, 0);
  await page.locator('#resume').click(); await audioState('running'); await tick(2);
  const resumed = await snapshot(); assert.ok(resumed.time > paused.time);
  assert.ok(resumed.effects[0].age > paused.effects[0].age);
  await page.locator('#sound-toggle').click(); await audioState('suspended');
  const muted = await snapshot(); assert.equal(muted.audio.enabled, false); assert.equal(muted.audio.voices, 0); assert.equal(muted.audio.notes, 0);

  await fixture();
  await page.selectOption('#stadium-lighting', 'day'); await page.selectOption('#stadium-weather', 'clear'); await tick(120); await layout();
  const day = await pixels(); assert.ok(day.luminance > 30, 'daylight field remains readable');
  await page.selectOption('#stadium-lighting', 'night'); await page.selectOption('#stadium-weather', 'rain'); await tick(240);
  const rainNight = await pixels();
  assert.ok(rainNight.luminance < day.luminance * .96, 'night is visibly darker than daylight');
  assert.ok(rainNight.changed > .6, 'lighting changes the full stadium atmosphere');
  assert.equal((await snapshot()).label, 'RAIN / NIGHT'); await screenshot('presentation-rain-night');
  await page.selectOption('#stadium-weather', 'clear'); await tick(0);
  const clearNight = await pixels(); assert.ok(clearNight.changed > .001, 'rain visibly changes the composited field');
  await page.selectOption('#stadium-lighting', 'day'); await tick(240);
  await pixels(); await page.selectOption('#stadium-weather', 'snow'); await tick(0);
  const snowDay = await pixels(); assert.ok(snowDay.changed > .001, 'snow visibly changes the composited field');
  assert.equal((await snapshot()).label, 'SNOW / DAY'); await screenshot('presentation-snow-day');

  await fixture(); await page.selectOption('#stadium-lighting', 'auto'); await page.selectOption('#stadium-weather', 'clear');
  assert.ok((await snapshot()).darkness < .01);
  await page.evaluate(async () => { const { match } = await import('/src/main.js'); match.rules.quarter = 4; match.rules.clock = 0; });
  await tick(240); assert.ok((await snapshot()).darkness > .95, 'automatic cycle follows match progress into night');

  // Resolve a real goal crossing and inspect the resulting celebration and music.
  await fixture(); await page.selectOption('#stadium-lighting', 'day');
  await page.locator('#sound-toggle').click(); await audioState('running'); await tick(1);
  await page.evaluate(async () => {
    const { match, play, loop, camera } = await import('/src/main.js'); match.snap(); play.giveToBack();
    play.rb.x = play.field.width - play.field.endZone - 1; play.rb.y = play.field.height / 2;
    play.rb.vx = play.rb.speed; play.autoRunAfterCatch = true; play.ball.attach(play.rb);
    camera.follow(play.rb, 0, true); loop.update(1 / 60); loop.render();
  });
  const touchdown = await snapshot();
  assert.equal(touchdown.playResult, 'TOUCHDOWN'); assert.equal(touchdown.score.home, 6);
  assert.ok(touchdown.effects.some(effect => effect.type === 'touchdown')); assert.ok(touchdown.crowd >= 1);
  assert.ok(touchdown.audio.notes > 4, `touchdown schedules a synthesized celebration: ${JSON.stringify(touchdown.audio)}`); assert.equal(touchdown.audio.reaction, 1);
  assert.equal(await page.locator('#viewport').evaluate(element => element.classList.contains('celebrating')), true);
  await tick(12); await screenshot('presentation-touchdown');

  for (const width of [1440, 540, 390]) {
    await page.setViewportSize({ width, height: 1100 }); await layout();
    const dimensions = await page.locator('#game').evaluate(canvas => ({
      overflow: document.documentElement.scrollWidth > innerWidth, width: canvas.width, height: canvas.height,
      cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight,
    }));
    assert.equal(dimensions.overflow, false, `${width}px layout has no horizontal overflow`);
    assert.ok(dimensions.cssWidth > 200 && dimensions.cssHeight > 100, `${width}px field remains visible`);
    assert.equal(dimensions.width, dimensions.cssWidth); assert.equal(dimensions.height, dimensions.cssHeight);
    assert.equal(await page.locator('#sound-toggle').isVisible(), true);
    assert.equal(await page.locator('#stadium-weather').isVisible(), true);
    await screenshot(`presentation-responsive-${width}`);
  }

  // A failed fourth-down run is tackled by normal physics, then rules.completePlay
  // changes possession and Renderer turns that rules result into a turnover cue.
  await page.setViewportSize({ width: 1440, height: 1100 }); await layout(); await fixture();
  await page.evaluate(async () => {
    const { play, match, loop } = await import('/src/main.js'); match.rules.down = 4; match.snap(); play.giveToBack();
    const runner = play.rb, defender = play.defenders[0];
    runner.x = play.lineOfScrimmage + 5; runner.y = play.field.height / 2; runner.vx = runner.vy = 0;
    runner.setRatings({ strength: 1, elusiveness: 1, awareness: 1, catching: 1 });
    defender.x = runner.x + 18; defender.y = runner.y; defender.vx = defender.vy = 0;
    defender.setRatings({ tackling: 99, strength: 99, awareness: 99 }); play.ball.attach(runner);
    loop.update(1 / 60); loop.render();
  });
  const turnover = await snapshot();
  assert.equal(turnover.playResult, 'TACKLED'); assert.equal(turnover.result, 'TURNOVER ON DOWNS'); assert.equal(turnover.possession, 'away');
  assert.ok(turnover.effects.some(effect => effect.type === 'turnover')); assert.equal(turnover.audio.reaction, .9);
  const turnoverCount = turnover.effects.filter(effect => effect.type === 'turnover').length;
  await tick(1); assert.equal((await snapshot()).effects.filter(effect => effect.type === 'turnover').length, turnoverCount, 'rules turnover cue is not duplicated');

  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.reload();
  await page.evaluate(async () => (await import('/src/main.js')).loop.stop());
  await page.locator('#start-franchise').click(); await layout();
  assert.deepEqual(await page.evaluate(async () => {
    const { renderer, audio } = await import('/src/main.js');
    return { stadium: renderer.stadium.reducedMotion, effects: renderer.effects.reducedMotion, muted: !audio.enabled };
  }), { stadium: true, effects: true, muted: true });
  assert.deepEqual(errors, []);
  console.log('PASS: silent default and gesture audio unlock, pause/resume/mute, frozen presentation, safe selectors, visible rain/snow/day/night, match-driven cycle, real touchdown music/crowd, fourth-down turnover cues, 1440/540/390 layouts, reduced motion, zero browser errors.');
} finally { await browser.close(); }
