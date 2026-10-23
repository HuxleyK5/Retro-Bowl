import { chromium } from '@playwright/test';
import { startFranchise } from './start-helper.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:5173');
  await startFranchise(page);
  await page.evaluate(async () => { const { loop, match } = await import('/src/main.js'); loop.stop(); match.start(60, false); loop.render(); });
  await page.waitForTimeout(100);
  const fixture = async () => page.evaluate(async () => {
    const { match, play, renderer, state } = await import('/src/main.js');
    state.set('playing'); match.start(60, false); match.selectPlay('go');
    play.random = () => .99;
    for (const defender of play.defenders) { defender.x = play.field.width - 400; defender.y = play.field.height - 70; defender.vx = defender.vy = 0; }
    renderer.updateEffects(0, play);
  });
  const snapshot = () => page.evaluate(async () => {
    const { play, renderer, match, state } = await import('/src/main.js');
    return { phase: play.phase, result: play.result, mode: play.ball.mode, generation: play.generation,
      score: { ...match.rules.score }, paused: !state.playing, recoveredBy: play.recoveredBy,
      events: play.events.map(event => ({ id: event.id, type: event.type })),
      effects: renderer.effects.effects.map(effect => ({ id: effect.id, type: effect.type, age: effect.age })) };
  });
  const tick = async count => page.evaluate(async count => {
    const { loop } = await import('/src/main.js'); for (let i = 0; i < count; i++) loop.update(1 / 60); loop.render();
  }, count);
  const screenshot = async name => {
    // The stopped fixture loop must redraw after HUD layout triggers ResizeObserver.
    await page.waitForTimeout(80);
    await page.evaluate(async () => (await import('/src/main.js')).loop.render());
    const painted = await page.locator('#game').evaluate(canvas => {
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const colors = new Set();
      for (let i = 0; i < pixels.length; i += 4 * 113) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
      return colors.size > 8;
    });
    assert.equal(painted, true, 'field and effects remain painted after responsive canvas resize');
    // Full-page capture temporarily resizes Edge's viewport, clearing this paused canvas.
    await page.screenshot({ path: `test-results/${name}.png` });
  };

  // A real input creates one juke event; repeated renders must never replay it.
  await fixture();
  await page.evaluate(async () => { (await import('/src/main.js')).match.snap(); });
  await page.locator('#game').focus(); await page.keyboard.press('j'); await tick(1);
  const juked = await snapshot(); assert.equal(juked.events.filter(event => event.type === 'juke').length, 1);
  assert.equal(juked.effects.filter(effect => effect.type === 'juke').length, 1);
  await page.evaluate(async () => { const { loop } = await import('/src/main.js'); loop.render(); loop.render(); });
  assert.deepEqual((await snapshot()).effects, juked.effects);
  await page.keyboard.press('Escape'); const paused = await snapshot(); assert.equal(paused.paused, true);
  await tick(20); assert.deepEqual((await snapshot()).effects, paused.effects);
  await page.keyboard.press('Escape'); await tick(1);
  assert.ok((await snapshot()).effects[0].age > paused.effects[0].age);
  await fixture(); assert.equal((await snapshot()).effects.length, 0);
  assert.ok((await snapshot()).generation > juked.generation);

  // Exercise the displayed risk read through real aim plans and canvas text.
  const reads = await page.evaluate(async () => {
    const { play, match, renderer } = await import('/src/main.js'); match.snap();
    const target = { x: play.lineOfScrimmage + 100, y: play.qb.y, manual: true };
    const defender = play.defenders[0], output = [];
    const c = renderer.ctx, fillText = c.fillText;
    try {
      c.fillText = function(text, ...args) { output.push(String(text)); return fillText.call(this, text, ...args); };
      for (const gap of [160, 65, 15]) {
        defender.x = target.x + gap; defender.y = target.y; defender.vx = defender.vy = 0;
        renderer.render(play.players, play.controlled, play, play.aim(target));
      }
    } finally { c.fillText = fillText; }
    return output.filter(text => ['AIMED PASS', 'CONTESTED', 'TIGHT WINDOW'].includes(text));
  });
  assert.deepEqual(reads, ['AIMED PASS', 'CONTESTED', 'TIGHT WINDOW']);

  // Actual flight/catch resolution, rather than manually inserting visual events.
  await fixture();
  await page.evaluate(async () => {
    const { play, match } = await import('/src/main.js'); match.snap();
    const receiver = play.receivers[0]; receiver.x = play.lineOfScrimmage + 100; receiver.y = play.qb.y - 100;
    receiver.route = [{ x: receiver.x, y: receiver.y }]; receiver.routeIndex = 0; receiver.vx = receiver.vy = 0;
    receiver.setRatings({ catching: 99, awareness: 99 }); play.qb.setRatings({ accuracy: 99, awareness: 99 });
    play.throw({ x: receiver.x, y: receiver.y, manual: true });
  });
  await tick(45); const caught = await snapshot();
  assert.equal(caught.phase, 'running'); assert.ok(caught.events.some(event => event.type === 'catch'));
  assert.ok(caught.effects.some(effect => effect.type === 'catch'));
  await screenshot('gameplay-catch');

  // Place a strong tackler in contact with a weak runner, then use the normal tick.
  const contact = async fumble => page.evaluate(async fumble => {
    const { play, match, loop } = await import('/src/main.js'); match.snap(); play.giveToBack();
    const runner = play.rb, defender = play.defenders[0];
    runner.x = play.lineOfScrimmage + 160; runner.y = play.field.height / 2; runner.vx = runner.vy = 0;
    runner.setRatings({ strength: 1, elusiveness: 1, awareness: 1, catching: 1 });
    defender.x = runner.x + 18; defender.y = runner.y; defender.vx = defender.vy = 0;
    defender.setRatings({ tackling: 99, strength: 99, awareness: 99 });
    play.ball.attach(runner); play.random = () => fumble ? 0 : .99;
    loop.update(1 / 60); loop.render();
  }, fumble);
  await fixture(); await contact(false); await tick(7);
  const tackled = await snapshot(); assert.equal(tackled.result, 'TACKLED');
  assert.ok(tackled.effects.some(effect => effect.type === 'tackle'));
  await screenshot('gameplay-tackle');

  for (const side of ['offense', 'defense']) {
    await fixture(); await contact(true); const loose = await snapshot();
    assert.equal(loose.mode, 'loose'); assert.equal(loose.phase, 'loose');
    assert.ok(loose.effects.some(effect => effect.type === 'fumble'));
    await screenshot(`gameplay-fumble-${side}`);
    await page.evaluate(async side => {
      const { play } = await import('/src/main.js');
      for (const player of play.players) { player.x = play.field.width - 400; player.y = play.field.height - 70; player.vx = player.vy = 0; }
      const recoverer = side === 'offense' ? play.qb : play.defenders[1];
      recoverer.x = play.ball.x - 15; recoverer.y = play.ball.y; recoverer.stunned = 0;
    }, side);
    await tick(20); const recovered = await snapshot(); assert.equal(recovered.recoveredBy, side);
    assert.equal(recovered.mode, 'held'); assert.ok(recovered.effects.some(effect => effect.type === 'recovery'));
    if (side === 'defense') assert.equal(recovered.result, 'FUMBLE');
  }

  // A risky throw through a defender produces the interception banner.
  await fixture();
  await page.evaluate(async () => {
    const { play, match } = await import('/src/main.js'); match.snap();
    const defender = play.defenders[0]; defender.x = play.lineOfScrimmage + 100; defender.y = play.qb.y;
    defender.setRatings({ coverage: 99, awareness: 99 }); play.qb.setRatings({ accuracy: 99, awareness: 99 });
    play.throw({ x: defender.x, y: defender.y, manual: true });
  });
  await tick(90); const intercepted = await snapshot(); assert.equal(intercepted.result, 'INTERCEPTION');
  assert.ok(intercepted.effects.some(effect => effect.type === 'interception'));
  await screenshot('gameplay-interception');

  for (const width of [1440, 540]) {
    await page.setViewportSize({ width, height: 1100 }); await page.waitForTimeout(80); await fixture();
    await page.evaluate(async () => {
      const { play, match, loop, camera } = await import('/src/main.js'); match.snap(); play.giveToBack();
      play.rb.x = play.field.width - play.field.endZone - 1; play.rb.y = play.field.height / 2;
      play.rb.vx = play.rb.speed; play.autoRunAfterCatch = true; play.ball.attach(play.rb);
      camera.follow(play.rb, 0, true); loop.update(1 / 60); loop.render();
    });
    const touchdown = await snapshot(); assert.equal(touchdown.result, 'TOUCHDOWN'); assert.equal(touchdown.score.home, 6);
    assert.ok(touchdown.effects.some(effect => effect.type === 'touchdown'));
    await screenshot(`gameplay-touchdown-${width}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }

  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.reload(); await startFranchise(page);
  assert.equal(await page.evaluate(async () => (await import('/src/main.js')).renderer.effects.reducedMotion), true);
  assert.deepEqual(errors, []);
  console.log('PASS: event feedback from real catches, tackles, interceptions, contact fumbles, both recovery sides and touchdowns; aim risk labels; event deduplication, paused effects, reset cleanup, mobile/desktop canvas, reduced motion, zero browser errors.');
} finally { await browser.close(); }
