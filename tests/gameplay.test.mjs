import test from 'node:test';
import assert from 'node:assert/strict';
import { Play } from '../src/football/Play.js';
import { Field } from '../src/world/Field.js';
import { Football } from '../src/entities/Football.js';
import { fumbleChance } from '../src/football/RatingEffects.js';

const dt = 1 / 60;
const make = (rng = () => .4) => new Play(new Field(), rng);
const step = (p, seconds, movement = { x: 0, y: 0 }) => {
  for (let i = 0; i < Math.round(seconds / dt) && p.live; i++) p.update(dt, movement);
};

test('manual passing honors aim; leading the receiver completes while a misplaced throw misses', () => {
  for (const miss of [false, true]) {
    const p = make(); p.configure(25, 'home', 35, 'go'); p.defenders = [];
    p.snap(); step(p, 1);
    const target = p.aim(p.receivers[0]).target;
    const point = { ...target, y: target.y + (miss ? 230 : 0), manual: true };
    assert.deepEqual(p.aim(point).target, point);
    p.throw(point); step(p, 2);
    if (miss) assert.equal(p.result, 'INCOMPLETE');
    else { assert.equal(p.carrier, p.receivers[0]); assert.ok(p.events.some(e => e.type === 'catch')); }
  }
});

test('the aim preview distinguishes open, contested and dangerous landing windows', () => {
  const p = make(), defender = p.defenders[0], point = { x: 1500, y: 350, manual: true };
  p.defenders = [defender]; defender.vx = defender.vy = 0;
  defender.x = point.x; defender.y = point.y;
  assert.equal(p.aim(point).risk, 'danger');
  defender.y += 65; assert.equal(p.aim(point).risk, 'contested');
  defender.y += 150; assert.equal(p.aim(point).risk, 'open');
});

test('an aware defender in the flight path can intercept before the pass lands', () => {
  const p = make(), d = p.defenders[0]; p.snap();
  p.receivers = []; p.defenders = [d];
  d.setRatings({ awareness: 99, coverage: 99 });
  d.x = 1130; d.y = 300;
  p.ball.throw({ x: 500, y: 300 }, { x: 1200, y: 300 }, 1);
  p.carrier = null; p.phase = 'flight'; p.ball.update(.9);
  p.defense.update = () => {};
  p.update(dt);
  assert.equal(p.result, 'INTERCEPTION');
  assert.ok(p.ball.elapsed < p.ball.duration);
  assert.equal(p.events.filter(e => e.type === 'interception').length, 1);
});

test('secure ball carriers fumble less often, while hard side hits increase risk', () => {
  const p = make(), defender = p.defenders[0].ratings;
  const weak = { ...p.rb.ratings, awareness: 10, strength: 10, catching: 10 };
  const secure = { ...weak, awareness: 99, strength: 99, catching: 99 };
  assert.ok(fumbleChance(defender, weak) > fumbleChance(defender, secure));
  assert.ok(fumbleChance(defender, weak, { momentum: 1, sideHit: true }) > fumbleChance(defender, weak));
});

test('a hard contact can dislodge the ball; loose-ball physics is stable across frame rates', () => {
  const p = make(() => 0); p.snap(); p.handoff();
  const d = p.defenders[0]; p.defenders = [d];
  p.rb.setRatings({ strength: 20, elusiveness: 20, awareness: 20, catching: 20 });
  d.setRatings({ tackling: 99, strength: 99, awareness: 99 });
  d.x = p.rb.x + 8; d.y = p.rb.y + 8;
  p.update(dt);
  assert.equal(p.phase, 'loose'); assert.equal(p.ball.mode, 'loose'); assert.equal(p.carrier, null);
  assert.equal(p.canThrow, false); assert.equal(p.juke({ x: 1, y: 0 }), false);
  assert.equal(p.events.filter(e => e.type === 'fumble').length, 1);
  const balls = [new Football(), new Football()];
  for (const [i, ball] of balls.entries()) {
    ball.loosen({ x: 500, y: 400 }, { x: 200, y: -80 });
    for (let t = 0; t < (i ? 120 : 60); t++) ball.update(1 / (i ? 120 : 60));
  }
  assert.ok(Math.abs(balls[0].x - balls[1].x) < .001);
  assert.ok(Math.abs(balls[0].y - balls[1].y) < .001);
});

test('offensive recovery restores control and defensive recovery ends the play as a turnover', () => {
  for (const defense of [false, true]) {
    const p = make(); p.snap(); p.handoff(); const d = p.defenders[0];
    d.x = p.rb.x + 8; d.y = p.rb.y; p.players = defense ? [p.rb, d] : [p.rb]; p.defenders = defense ? [d] : [];
    p.forceFumble(d); step(p, 1);
    assert.equal(p.ball.mode, 'held');
    assert.equal(p.recoveredBy, defense ? 'defense' : 'offense');
    assert.equal(p.controlled, defense ? d : p.rb);
    if (defense) { assert.equal(p.result, 'FUMBLE'); assert.equal(p.outcome.recoveredBy, 'defense'); }
    else { assert.equal(p.phase, 'running'); assert.equal(p.autoRunAfterCatch, true); }
    assert.ok(p.events.some(e => e.type === 'recovery'));
  }
});

test('loose ball exits carry their original loss spot and reset removes all temporary state', () => {
  const p = make(); p.snap(); p.handoff(); const d = p.defenders[0];
  p.forceFumble(d); const lost = p.fumbleSpot;
  p.ball.y = -1; p.update(dt);
  assert.equal(p.result, 'FUMBLE_OUT_OF_BOUNDS'); assert.equal(p.outcome.fumbleSpot, lost);
  const generation = p.generation, serial = p.eventSerial;
  p.reset(); assert.ok(p.generation > generation); assert.deepEqual(p.events, []);
  assert.equal(p.fumbleCount, 0); assert.equal(p.recoveredBy, undefined);
  p.snap(); p.emit('catch', p.rb); assert.ok(p.events[0].id > serial);
  p.finish('TOUCHDOWN'); p.finish('TOUCHDOWN');
  assert.equal(p.events.filter(e => e.type === 'touchdown').length, 1);
});

test('a receiver on the ball beats a farther eligible defender in the same catch window', () => {
  const p = make(), receiver = p.receivers[0], defender = p.defenders[0]; p.snap();
  p.receivers = [receiver]; p.defenders = [defender];
  Object.assign(receiver, { x: 1000, y: 500, vx: 0, vy: 0 });
  Object.assign(defender, { x: 1030, y: 500, vx: 0, vy: 0 });
  receiver.setRatings({ catching: 99, awareness: 99 });
  defender.setRatings({ coverage: 99, awareness: 99 });
  p.defense.update = () => {};
  p.ball.throw({ x: 1000, y: 500 }, { x: 1000, y: 500 }, 1);
  p.ball.update(.98); p.carrier = null; p.phase = 'flight'; p.update(dt);
  assert.equal(p.carrier, receiver); assert.equal(p.phase, 'running');
  assert.ok(p.events.some(e => e.type === 'catch'));
  assert.equal(p.events.some(e => e.type === 'interception'), false);
});

test('recovery at the play time limit ends normally rather than becoming a phantom fumble exit', () => {
  const p = make(), defender = p.defenders[0]; p.snap(); p.handoff();
  p.defenders = []; p.players = [p.rb];
  p.forceFumble(defender); p.rb.stunned = 0;
  p.ball.vx = p.ball.vy = 0; p.ball.elapsed = .3; p.elapsed = 35 - dt / 2;
  p.update(dt);
  assert.equal(p.recoveredBy, 'offense'); assert.equal(p.ball.mode, 'held');
  assert.equal(p.phase, 'running'); assert.equal(p.result, '');
  p.update(dt);
  assert.equal(p.result, 'PLAY OVER'); assert.equal(p.outcome.recoveredBy, 'offense');
});

test('a lineman who recovers a screen fumble follows steering without being dragged toward a blocking landmark', () => {
  const p = make(), defender = p.defenders[0], lineman = p.linemen[0];
  p.configure(25, 'home', 35, 'screen'); p.defenders = []; p.snap(); step(p, .7);
  p.forceFumble(defender); p.players = [lineman];
  Object.assign(lineman, { x: 700, y: 500, vx: 0, vy: 0, stunned: 0 });
  p.ball.loosen(lineman, { x: 0, y: 0 }); p.ball.elapsed = .3;
  p.update(dt); assert.equal(p.carrier, lineman); assert.equal(p.controlled, lineman);
  p.update(dt, { x: 0, y: 0 });
  lineman.vx = lineman.vy = 0;
  const start = { x: lineman.x, y: lineman.y };
  step(p, 1, { x: 0, y: -1 });
  assert.ok(lineman.y < start.y - 120, 'recovered lineman moves in the requested direction');
  assert.ok(Math.abs(lineman.x - start.x) < 1, 'blocking cannot add horizontal carrier movement');
});

test('a QB fumble cancels the scripted draw exchange so it cannot take possession from a recoverer', () => {
  const p = make(), defender = p.defenders[0], receiver = p.receivers[0];
  p.configure(25, 'home', 35, 'draw'); p.defenders = []; p.snap(); step(p, .2);
  p.forceFumble(defender); p.players = [receiver];
  Object.assign(receiver, { x: 800, y: 500, vx: 0, vy: 0, stunned: 0 });
  p.ball.loosen(receiver, { x: 0, y: 0 }); p.ball.elapsed = .3;
  p.update(dt); assert.equal(p.carrier, receiver);
  step(p, 1.2, { x: 1, y: 0 });
  assert.ok(p.elapsed > p.call.exchangeTime);
  assert.equal(p.carrier, receiver); assert.equal(p.controlled, receiver);
  assert.equal(p.recoveredBy, 'offense'); assert.equal(p.ball.mode, 'held');
});

test('waiting for the real slant break creates a completion window that an early throw misses', () => {
  const results = [];
  for (const timing of [1, 2]) {
    const p = make(); p.configure(25, 'home', 35, 'slants'); p.snap(); step(p, timing);
    const receiver = p.receivers[0], risk = p.aim(receiver).risk;
    assert.equal(p.throw(receiver), true);
    for (let frame = 0; frame < 240 && p.phase === 'flight'; frame++) p.update(dt);
    results.push({ p, receiver, risk });
  }
  assert.equal(results[0].p.result, 'INTERCEPTION'); assert.equal(results[0].risk, 'contested');
  assert.equal(results[1].p.carrier, results[1].receiver); assert.equal(results[1].risk, 'open');
  assert.equal(results[1].p.phase, 'running');
  assert.ok(results[1].p.events.some(e => e.type === 'catch'));
});
