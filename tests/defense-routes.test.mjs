import test from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/entities/Player.js';
import { Field } from '../src/world/Field.js';
import { Routes, distance, steer } from '../src/football/Routes.js';
import { Defense } from '../src/football/Defense.js';

const dt = 1 / 60, field = new Field();
const receiver = () => new Player({ x: 500, y: 300, ratings: { speed: 80, acceleration: 85, routeRunning: 90 } });
const defender = awareness => {
  const player = new Player({ x: 620, y: 330, role: 'DEFENDER', team: 'away', ratings: { speed: 60, coverage: 85, awareness } });
  player.assignment = 0; return player;
};
const coveragePlay = (wr, defenders) => ({
  receivers: [wr], defenders, carrier: wr, qb: wr, ball: { mode: 'held' }, field,
  phase: 'passing', elapsed: 0, lineOfScrimmage: 450, blocking: { blocks: () => false },
});

test('route prediction exactly follows release, sharp breaks and settling without changing live state', () => {
  const wr = receiver(); wr.route = [{ x: 560, y: 300 }, { x: 560, y: 410 }, { x: 525, y: 410 }];
  const routes = new Routes([wr]);
  const before = { ...wr }, path = JSON.stringify(wr.route), predicted = routes.predict(wr, 2.5, field);
  assert.deepEqual({ ...wr }, before);
  assert.equal(JSON.stringify(wr.route), path);
  for (let i = 0; i < 150; i++) routes.update(wr, dt, field);
  assert.ok(distance(wr, predicted) < .00001);
  assert.equal(wr.routeIndex, 2);
});

test('outside release sells the following cut and vertical routes preserve their lane', () => {
  const cutting = receiver(), vertical = receiver();
  cutting.route = [{ x: 580, y: 300 }, { x: 580, y: 420 }];
  vertical.route = [{ x: 1000, y: 300 }];
  const routes = new Routes([cutting, vertical]);
  for (let i = 0; i < 9; i++) { routes.update(cutting, dt, field); routes.update(vertical, dt, field); }
  assert.ok(cutting.y < cutting.spawn.y - .5, 'the initial release sells the opposite shoulder');
  assert.equal(vertical.y, vertical.spawn.y);
  assert.ok(Math.hypot(cutting.vx, cutting.vy) <= cutting.speed + .001);
});

test('a receiver carried beyond a route landmark continues the break instead of orbiting it', () => {
  const wr = receiver(); wr.route = [{ x: 560, y: 300 }, { x: 560, y: 420 }];
  const routes = new Routes([wr]); wr.x = 575; wr.vx = wr.speed;
  assert.equal(routes.target(wr), wr.route[1]);
  for (let i = 0; i < 60; i++) routes.update(wr, dt, field);
  assert.equal(wr.routeIndex, 1); assert.ok(wr.y > 390);
});

test('receivers settle at a curl landmark and reset all release and cut state for the next snap', () => {
  const wr = receiver(); wr.route = [{ x: 600, y: 300 }, { x: 540, y: 300 }];
  const routes = new Routes([wr]);
  for (let i = 0; i < 300; i++) routes.update(wr, dt, field);
  const settled = { x: wr.x, y: wr.y };
  assert.ok(distance(wr, wr.route[1]) < 4);
  for (let i = 0; i < 60; i++) routes.update(wr, dt, field);
  assert.ok(distance(wr, settled) < .001);
  wr.reset(); routes.reset();
  assert.equal(wr.routeIndex, 0); assert.equal(wr.routeTime, 0); assert.equal(wr.routeCutTime, 0);
});

test('coverage reads actual motion with awareness-dependent delay and never reads future route points', () => {
  const wr = receiver(), aware = defender(95), unaware = defender(10);
  Object.defineProperty(wr, 'route', { get() { throw new Error('Defense must not inspect the route.'); } });
  const play = coveragePlay(wr, [aware, unaware]), defense = new Defense();
  wr.vx = 150; wr.vy = 0;
  for (let i = 0; i < 30; i++) { wr.x += wr.vx * dt; play.elapsed += dt; defense.update(play, dt); }
  wr.vx = 0; wr.vy = 150;
  for (let i = 0; i < 11; i++) { wr.y += wr.vy * dt; play.elapsed += dt; defense.update(play, dt); }
  const quickRead = defense.coverageTarget(aware, wr, field), slowRead = defense.coverageTarget(unaware, wr, field);
  assert.ok(quickRead.y > slowRead.y + 15, 'awareness recognizes the observed cut sooner');
  assert.ok(slowRead.x > quickRead.x + 10, 'the late reader still commits to the previous stem');
  for (let i = 0; i < 30; i++) { wr.y += wr.vy * dt; play.elapsed += dt; defense.update(play, dt); }
  assert.ok(defense.coverageTarget(unaware, wr, field).y > slowRead.y + 60);
});

test('a deep helper protects the middle and responds to receivers entering the zone', () => {
  const wr = receiver(), helper = defender(80), defense = new Defense();
  helper.spawn.x = 1050; helper.x = 1050;
  const play = coveragePlay(wr, [helper]);
  defense.update(play, dt);
  assert.ok(helper.vy > 0, 'the helper starts by shading toward the middle');
  wr.x = 1000; wr.y = 220; wr.vx = 160;
  for (let i = 0; i < 60; i++) { play.elapsed += dt; defense.update(play, dt); }
  const target = defense.helpTarget(helper, [wr], field, play.lineOfScrimmage);
  assert.ok(target.x >= wr.x + 100, 'deep help stays on the goal side of the observed threat');
  assert.ok(target.y > wr.y && target.y < field.height / 2);
});

test('velocity-based pursuit cuts off a crossing runner sooner than following the runner position', () => {
  function timeToContact(intercept) {
    const runner = new Player({ x: 500, y: 500, ratings: { speed: 70 } });
    const tackler = new Player({ x: 850, y: 350, role: 'DEFENDER', ratings: { speed: 60, awareness: 80 } });
    const defense = new Defense(); runner.vx = runner.vy = runner.speed * Math.SQRT1_2;
    for (let time = 0; time < 4; time += dt) {
      runner.update(dt, { x: Math.SQRT1_2, y: Math.SQRT1_2 }, field);
      tackler.update(dt, steer(tackler, intercept ? defense.pursuitTarget(tackler, runner, field) : runner, true), field);
      if (distance(tackler, runner) < 30) return time;
    }
    return 4;
  }
  assert.ok(timeToContact(true) < timeToContact(false) - 1);
});

test('outside defenders contain an edge runner while nearby contact and stopped runners stay reachable', () => {
  const runner = new Player({ x: 500, y: 100 }), outside = defender(85), inside = defender(85), defense = new Defense();
  Object.assign(outside, { x: 650, y: 50 }); Object.assign(inside, { x: 650, y: 200 });
  runner.vx = runner.speed; runner.vy = 0;
  const contain = defense.pursuitTarget(outside, runner, field), chase = defense.pursuitTarget(inside, runner, field);
  assert.ok(contain.y < runner.y); assert.equal(chase.y, runner.y);
  outside.x = runner.x + 30;
  assert.equal(defense.pursuitTarget(outside, runner, field).y, runner.y, 'close defenders finish contact');
  runner.vx = runner.vy = 0; runner.y = 500;
  assert.deepEqual(defense.pursuitTarget(inside, runner, field), { x: runner.x, y: runner.y });
});

test('defense reset discards old observations before a new formation is covered', () => {
  const wr = receiver(), db = defender(10), defense = new Defense(), play = coveragePlay(wr, [db]);
  wr.vx = 150;
  for (let i = 0; i < 30; i++) { wr.x += wr.vx * dt; play.elapsed += dt; defense.update(play, dt); }
  defense.reset(); Object.assign(wr, { x: 900, y: 700, vx: 0, vy: 0 });
  play.elapsed = 0; defense.update(play, dt);
  const target = defense.coverageTarget(db, wr, field);
  assert.ok(target.x > 900); assert.ok(target.y > 670 && target.y < 700);
});
