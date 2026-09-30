import test from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/entities/Player.js';
import { Field } from '../src/world/Field.js';
import { Camera } from '../src/world/Camera.js';
import { GameState } from '../src/core/GameState.js';
import { Play } from '../src/football/Play.js';
import { Football } from '../src/entities/Football.js';
import { distance } from '../src/football/Routes.js';

const dt = 1 / 60;
const advance = (play, frames, movement) => { for (let i = 0; i < frames; i++) play.update(dt, movement); };
const makePlay = (random = () => .4) => new Play(new Field(), random);

test('movement is time based, sprint is faster, field bounds hold, reset restores spawn', () => {
  const field = new Field();
  const p = new Player({ number: '01', x: 700, y: 500 });
  for (let i = 0; i < 60; i++) p.update(1 / 60, { x: 1, y: 0, sprint: false }, field);
  assert.ok(p.x > 830 && p.x < 855, 'acceleration reduces first-second travel');
  assert.equal(p.vx, p.speed);
  p.reset(); p.update(1, { x: 1, y: 0, sprint: true }, field);
  assert.ok(p.x > 855);
  p.update(1000, { x: 1, y: 1 }, field);
  assert.equal(p.x, field.width - p.radius); assert.equal(p.y, field.height - p.radius);
  p.update(1000, { x: -1, y: -1 }, field);
  assert.equal(p.x, p.radius); assert.equal(p.y, p.radius);
  p.reset(); assert.equal(p.x, 700); assert.equal(p.y, 500);
});

test('acceleration ramps smoothly, diagonal movement preserves speed, and juke has a cooldown', () => {
  const p = new Player({ x: 600, y: 500 }); const field = new Field();
  p.update(dt, { x: 1, y: 0 }, field); assert.ok(p.vx > 0 && p.vx < p.speed);
  p.reset();
  for (let i = 0; i < 120; i++) p.update(dt, { x: Math.SQRT1_2, y: Math.SQRT1_2 }, field);
  assert.ok(Math.abs(Math.hypot(p.vx, p.vy) - p.speed) < .001);
  assert.equal(p.juke({ x: 0, y: 1 }), true); assert.equal(p.juke({ x: 0, y: 1 }), false);
  for (let i = 0; i < 100; i++) p.update(dt, { x: 0, y: 0 }, field);
  assert.equal(p.juke({ x: 1, y: 0 }), true);
});

test('pre-snap formation is fixed, snap starts routes and coverage, and idle QB is sacked', () => {
  const p = makePlay(); const start = p.players.map(v => [v.x, v.y]);
  advance(p, 60, { x: 1, y: 0 }); assert.deepEqual(p.players.map(v => [v.x, v.y]), start);
  assert.equal(p.throw({ x: 1000, y: 500 }), false);
  assert.equal(p.snap(), true); assert.equal(p.snap(), false);
  advance(p, 60); assert.ok(p.receivers[0].x > start[1][0]); assert.notEqual(p.defenders[0].x, p.defenders[0].spawn.x);
  advance(p, 900); assert.equal(p.result, 'SACK');
  const end = p.players.map(v => [v.x, v.y]); advance(p, 120, { x: 1, y: 0 }); assert.deepEqual(p.players.map(v => [v.x, v.y]), end);
  p.reset(); assert.deepEqual(p.players.map(v => [v.x, v.y]), start); assert.equal(p.phase, 'presnap'); assert.equal(p.ball.mode, 'held');
});

test('airborne ball follows an arc and arrives at the target', () => {
  const ball = new Football(); ball.throw({ x: 100, y: 200 }, { x: 700, y: 500 }, 1);
  ball.update(.5); assert.equal(ball.x, 400); assert.equal(ball.y, 350); assert.ok(ball.height > 100); assert.equal(ball.landed, false);
  ball.update(.5); assert.equal(ball.x, 700); assert.equal(ball.y, 500); assert.equal(ball.height, 0); assert.equal(ball.landed, true);
});

test('real routed pass is caught, control transfers, defenders pursue, and carrier can be tackled', () => {
  const p = makePlay(); p.snap(); advance(p, 60);
  assert.equal(p.throw(p.receivers[0]), true); assert.equal(p.phase, 'flight'); assert.equal(p.carrier, null);
  assert.equal(p.throw(p.receivers[1]), false);
  for (let i = 0; i < 150 && p.phase === 'flight'; i++) p.update(dt);
  assert.equal(p.phase, 'running'); assert.equal(p.carrier, p.receivers[0]); assert.equal(p.controlled, p.carrier);
  const defenderDistance = Math.min(...p.defenders.map(d => distance(d, p.carrier)));
  advance(p, 10); assert.ok(Math.min(...p.defenders.map(d => distance(d, p.carrier))) < defenderDistance);
  advance(p, 600); assert.equal(p.result, 'TACKLED');
});

test('each receiver and the RB can complete a full snap-to-catch-to-touchdown play', () => {
  for (let index = 0; index < 5; index++) {
    const p = makePlay(); p.snap(); advance(p, 60); p.throw(p.receivers[index]);
    for (let i = 0; i < 180 && p.phase === 'flight'; i++) p.update(dt);
    assert.equal(p.carrier, p.receivers[index]);
    for (let i = 0; i < 1000 && p.live; i++) {
      if (i % 90 === 0) p.juke({ x: 1, y: 0 });
      p.update(dt, { x: 1, y: 0, sprint: true });
    }
    assert.equal(p.result, 'TOUCHDOWN');
  }
});

test('reset during flight clears ball state and out-of-bounds passes cannot be caught', () => {
  const p = makePlay(); p.snap(); advance(p, 40); p.throw(p.receivers[0]); p.update(dt);
  p.reset(); assert.equal(p.hasThrown, false); assert.equal(p.carrier, p.qb); assert.equal(p.ball.attempted.size, 0);
  assert.equal(p.snap(), true); assert.equal(p.throw(p.receivers[0]), true);
  p.ball.y = -1; p.receivers[0].y = 14; p.receivers[0].x = p.ball.x;
  assert.equal(p.resolveCatch(), false);
});

test('QB accuracy changes dispersion and difficult catches depend on catching rating', () => {
  const errors = [];
  for (const accuracy of [1, 99]) {
    const p = makePlay(); p.snap(); p.qb.setRatings({ accuracy });
    const point = { x: 1600, y: 120 }; const target = p.aim(point).target;
    p.throw(point); errors.push(distance(target, p.ball.target));
  }
  assert.ok(errors[0] > 40); assert.ok(errors[1] < errors[0] / 20);
  const p = makePlay(); const receiver = p.receivers[0]; p.passDistance = 900;
  p.defenders[0].x = receiver.x; p.defenders[0].y = receiver.y;
  receiver.setRatings({ catching: 20 }); const low = p.catchMargin(receiver, 35);
  receiver.setRatings({ catching: 95 }); assert.ok(p.catchMargin(receiver, 35) > low + .4);
});

test('defender intercepts a bad pass and a missed pass ends incomplete', () => {
  const p = makePlay(() => .1); p.snap();
  const d = p.defenders[7];
  p.ball.throw(p.qb, d, .6); p.phase = 'flight'; p.carrier = null;
  advance(p, 100); assert.equal(p.result, 'INTERCEPTION'); assert.equal(p.carrier.team, 'away');
  const miss = makePlay(); miss.snap(); miss.throw({ x: 500, y: 50 }); advance(miss, 120);
  assert.equal(miss.result, 'INCOMPLETE'); assert.equal(miss.ball.mode, 'ground');
});

test('drop does not get retried each frame and ineligible linemen cannot catch', () => {
  const p = makePlay(() => .9999); p.snap();
  const receiver = p.receivers[0]; receiver.setRatings({ catching: 1, awareness: 1 });
  p.ball.x = receiver.x + 44; p.ball.y = receiver.y;
  assert.equal(p.resolveCatch(), false); assert.equal(p.ball.attempted.has(receiver), true);
  receiver.setRatings({ catching: 99, awareness: 99 }); assert.equal(p.resolveCatch(), false);
  p.ball.x = p.linemen[2].x; p.ball.y = p.linemen[2].y;
  assert.equal(p.resolveCatch(), false);
});

test('handoff gives RB control, juke evades tackle, and scrambles cannot be passed', () => {
  const p = makePlay(); p.snap(); assert.equal(p.handoff(), true); assert.equal(p.controlled, p.rb); assert.equal(p.throw(p.receivers[0]), false);
  const d = p.defenders[0]; d.x = p.rb.x + 5; d.y = p.rb.y;
  assert.equal(p.juke({ x: 1, y: 0 }), true); p.update(dt, { x: 1, y: 0, sprint: true }); assert.equal(p.live, true); assert.ok(d.stunned > 0);
  const scramble = makePlay(); scramble.snap(); scramble.qb.x = scramble.lineOfScrimmage + 1; scramble.update(dt);
  assert.equal(scramble.phase, 'running'); assert.equal(scramble.throw(scramble.receivers[0]), false);
});

test('touchdown, out of bounds, safety, and play time limit end a play', () => {
  for (const [x, y, expected] of [[2210, 300, 'TOUCHDOWN'], [1400, 13, 'OUT OF BOUNDS'], [13, 500, 'SAFETY']]) {
    const p = makePlay(); p.snap(); p.handoff(); p.rb.x = x; p.rb.y = y; p.update(dt); assert.equal(p.result, expected);
  }
  const p = makePlay(); p.snap(); p.elapsed = 35; p.update(dt); assert.equal(p.result, 'PLAY OVER');
});

test('camera coordinate conversion is reversible after following and resizing', () => {
  const camera = new Camera(new Field()); const point = { x: 1400, y: 333 };
  for (const [w, h] of [[960, 400], [1920, 700], [540, 400]]) {
    camera.resize(w, h); camera.follow(point, 0, true); const back = camera.screenToWorld(camera.worldToScreen(point));
    assert.ok(distance(point, back) < .001);
  }
});
test('state transition notifications are idempotent', () => {
  const changes = []; const state = new GameState(mode => changes.push(mode));
  state.togglePause(); state.set('paused'); assert.equal(state.playing, false);
  state.togglePause(); assert.equal(state.playing, true);
  assert.deepEqual(changes, ['paused', 'playing']);
  assert.throws(() => state.set('invalid'));
});
test('camera stays within field margins and converges on target at multiple view sizes', () => {
  const field = new Field(); const camera = new Camera(field);
  for (const [w, h] of [[1200, 600], [800, 400], [1920, 700]]) {
    camera.resize(w, h); camera.follow({ x: 0, y: 0 }, 0, true);
    assert.ok(Number.isFinite(camera.x)); assert.ok(camera.x - w / camera.zoom / 2 >= -field.margin - .01);
    camera.follow({ x: field.width, y: field.height }, 0, true);
    assert.ok(camera.x + w / camera.zoom / 2 <= field.width + field.margin + .01);
  }
});

test('catch auto-runs forward, manual steering overrides, release resumes, whistle and reset stop it', () => {
  for (const slot of [0, 4]) {
    const play = makePlay(), receiver = play.receivers[slot];
    play.snap(); play.defenders.forEach(p => { p.x = 2300; p.y = 1000; });
    receiver.x = 1100; receiver.y = 500; receiver.vx = receiver.vy = 0;
    play.ball.x = receiver.x; play.ball.y = receiver.y; play.phase = 'flight';
    assert.equal(play.resolveCatch(), true);
    assert.equal(play.controlled, receiver); assert.equal(play.autoRunAfterCatch, true);
    advance(play, 20); assert.ok(receiver.x > 1120, 'runs without input after WR or RB reception');
    const y = receiver.y;
    advance(play, 20, { x: 0, y: -1 }); assert.ok(receiver.y < y - 20, 'manual steering');
    const x = receiver.x;
    advance(play, 20); assert.ok(receiver.x > x + 20, 'forward running resumes');
    play.finish('TACKLED'); const stopped = receiver.x;
    advance(play, 20); assert.equal(receiver.x, stopped); assert.equal(play.autoRunAfterCatch, false);
    play.reset(); play.snap(); const qbX = play.qb.x;
    advance(play, 10); assert.equal(play.qb.x, qbX); assert.equal(play.autoRunAfterCatch, false);
  }
});

test('catch instantly turns route momentum forward and ignores inherited QB steering until release', () => {
  const play = makePlay(), receiver = play.receivers[0];
  play.snap();play.defenders.forEach(p=>{p.x=2300;p.y=1000;});
  Object.assign(receiver,{x:1100,y:500,vx:-receiver.speed,vy:100,facing:-1});
  Object.assign(play.ball,{x:1100,y:500});play.phase='flight';
  assert.equal(play.resolveCatch(),true);
  assert.equal(receiver.vx,receiver.speed);assert.equal(receiver.vy,0);assert.equal(receiver.facing,1);assert.equal(receiver.moving,true);
  play.update(dt,{x:-1,y:0});assert.ok(receiver.x>1100);assert.equal(receiver.y,500);
  advance(play,10,{x:-1,y:0});assert.ok(receiver.vx>0,'held QB direction cannot stop auto-run');
  play.update(dt,{x:0,y:0});
  advance(play,30,{x:-1,y:0});assert.ok(receiver.vx<0,'fresh steering works after releasing keys');
});
