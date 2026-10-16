import test from 'node:test';
import assert from 'node:assert/strict';
import { Play } from '../src/football/Play.js';
import { Field } from '../src/world/Field.js';
import { getPlay, PLAYBOOK, FORMATIONS } from '../src/football/Playbook.js';
import { distance } from '../src/football/Routes.js';
import { configureDefense, targetForDepth, chooseCpuCoverage } from '../src/football/Tactics.js';
import { throwRange } from '../src/football/RatingEffects.js';

const dt = 1 / 60;
function make(id = 'slants', coverage = 'man', adjustment = 'balanced', formation = null, spot = 35) {
  const play = new Play(new Field(), () => .4);
  play.configure(spot, 'home', Math.min(100, spot + 10), id);
  play.execution.apply(getPlay(id), formation);
  configureDefense(play, coverage, adjustment);
  play.reset();
  return play;
}
function advance(play, seconds) { for (let i = 0; i < Math.round(seconds / dt); i++) play.update(dt); }
const gap = (play, player) => Math.min(...play.defenders.map(defender => distance(defender, player)));

test('blitz creates earlier real pocket pressure and sacrifices coverage on the back outlet', () => {
  const man = make(), blitz = make('slants', 'blitz');
  for (const play of [man, blitz]) { play.snap(); advance(play, 2); }
  assert.ok(gap(blitz, blitz.rb) > gap(man, man.rb) + 45, 'the extra rush leaves the back physically open');
  for (const play of [man, blitz]) for (let frame = 0; frame < 400 && play.live; frame++) play.update(dt);
  assert.equal(man.result, 'SACK'); assert.equal(blitz.result, 'SACK');
  assert.ok(blitz.elapsed < man.elapsed - 1, 'an edge rusher reaches the quarterback sooner without a success multiplier');
});

test('Cover 3 protects deep outside routes while underneath zones leave different short windows', () => {
  const play = make('go', 'cover3'), defense = play.defense;
  const outside = play.defenders[0], flat = play.defenders[1], receiver = play.receivers[0];
  receiver.x = play.lineOfScrimmage + 21 * play.field.yard;
  receiver.y = play.field.height * .18; receiver.vx = receiver.speed; receiver.vy = 0;
  const deep = defense.zoneTarget(play, outside), underneath = defense.zoneTarget(play, flat);
  assert.ok(deep.x >= receiver.x + play.field.yard * 3.9, 'the outside deep third stays over the top');
  assert.ok(underneath.x < receiver.x - play.field.yard * 6, 'the flat does not chase a receiver out of its depth');
  receiver.x = play.lineOfScrimmage + 5 * play.field.yard;
  const flatRead = defense.zoneTarget(play, flat);
  assert.ok(distance(flatRead, receiver) < play.field.yard * 2, 'an underneath defender reacts when a short route enters the zone');
});

test('zone responsibilities pass crossers between lanes instead of following the receiver across the field', () => {
  const play = make('crosses', 'cover2'), receiver = play.receivers[0];
  const upperFlat = play.defenders[0], original = { ...upperFlat.coverageRole.anchor };
  receiver.x = play.lineOfScrimmage + 4 * play.field.yard; receiver.y = play.field.height * .12;
  assert.ok(play.defense.zoneTarget(play, upperFlat).y < play.field.height * .2);
  for (const player of play.receivers) { player.x = play.lineOfScrimmage + 4 * play.field.yard; player.y = play.field.height * .85; }
  assert.deepEqual(play.defense.zoneTarget(play, upperFlat), original, 'the defender returns to its vacated zone');
});

test('tactical defenses react to observed movement without reading future routes', () => {
  for (const coverage of ['man', 'cover2', 'cover3', 'blitz']) {
    const play = make('posts', coverage);
    for (const player of play.receivers) Object.defineProperty(player, 'route', { get() { throw new Error('Future route read'); } });
    play.phase = 'passing';
    for (let frame = 0; frame < 30; frame++) { play.elapsed += dt; play.defense.update(play, dt); }
    assert.ok(play.defenders.every(player => Number.isFinite(player.x) && Number.isFinite(player.y)));
  }
});

test('press contact slows a nearby release and cushion leaves extra room for the underneath throw', () => {
  const balanced = make('go'), press = make('go', 'man', 'press'), cushion = make('go', 'man', 'cushion');
  for (const play of [balanced, press, cushion]) { play.snap(); advance(play, .5); }
  assert.ok(press.receivers[0].x < balanced.receivers[0].x - 1, 'the receiver loses actual release momentum to contact');
  assert.ok(cushion.defenders[0].x > balanced.defenders[0].x + 50, 'deeper leverage leaves a short window');
  assert.ok(press.receivers[0].x > press.defenders[0].x + 30, 'a vertical release can get behind press coverage');
});

test('loading the box moves a safety into run support and vacates a deep zone', () => {
  const balanced = make('inside', 'cover3'), box = make('inside', 'cover3', 'box');
  assert.ok(box.defenders[7].x < balanced.defenders[7].x - box.field.yard * 15);
  for (const play of [balanced, box]) { play.snap(); advance(play, .45); }
  assert.ok(distance(box.defenders[7], box.rb) < distance(balanced.defenders[7], balanced.rb) - box.field.yard * 10);
});

test('motion travels behind scrimmage, reveals man tracking, and preserves the actual release on the snap', () => {
  const man = make(), zone = make('slants', 'cover3');
  const start = man.receivers[1].y, zoneStart = { x: zone.defenders[1].x, y: zone.defenders[1].y };
  for (const play of [man, zone]) { play.execution.startMotion('right'); advance(play, .9); }
  assert.ok(man.receivers[1].y > start + 90);
  assert.ok(man.receivers[1].x < man.lineOfScrimmage);
  assert.ok(man.defenders[1].y > start + 50, 'man coverage travels with the receiver');
  assert.deepEqual({ x: zone.defenders[1].x, y: zone.defenders[1].y }, zoneStart, 'zone defenders hold their landmarks');
  const player = man.receivers[1], release = { x: player.x, y: player.y }, oldRoute = player.route.map(point => ({ ...point }));
  man.snap();
  assert.deepEqual({ x: player.x, y: player.y }, release);
  assert.deepEqual(player.spawn, release);
  assert.ok(player.route[0].y > oldRoute[0].y + 90);
  assert.ok(player.vy > 0, 'a snap in motion keeps lateral momentum');
  assert.equal(man.execution.startMotion('left'), false);
});

test('stopping motion plants the receiver without losing the shifted route', () => {
  const play = make(); play.execution.startMotion('right'); advance(play, .5);
  const player = play.receivers[1], before = player.y;
  assert.equal(play.execution.startMotion('none'), true);
  advance(play, .5);
  assert.equal(player.y, before); assert.equal(player.vx, 0); assert.equal(player.vy, 0); assert.equal(player.moving, false);
  play.snap(); assert.equal(player.spawn.y, before);
});

test('formation overrides execute every run with continuous exchanges and bounded routes near either goal line', () => {
  const catalog = JSON.stringify(PLAYBOOK);
  for (const spot of [1, 99]) for (const formation of Object.keys(FORMATIONS)) for (const id of ['inside', 'outside', 'sweep', 'draw']) {
    const play = make(id, 'cover3', 'balanced', formation, spot);
    play.defenders = []; play.snap();
    for (let frame = 0; frame < 90; frame++) {
      const qb = { x: play.qb.x, y: play.qb.y }, rb = { x: play.rb.x, y: play.rb.y };
      play.update(dt);
      assert.ok(distance(play.qb, qb) < 30, `${id}/${formation}: quarterback moves continuously`);
      assert.ok(distance(play.rb, rb) < 30, `${id}/${formation}: no handoff teleport`);
    }
    assert.equal(play.carrier, play.rb);
    for (const player of play.receivers) for (const point of player.route) {
      assert.ok(point.x >= 20 && point.x <= play.field.width - 25);
      assert.ok(point.y >= 30 && point.y <= play.field.height - 30);
    }
  }
  assert.equal(JSON.stringify(PLAYBOOK), catalog);
});

test('selected throw depth changes the real flight distance and time while manual aim remains exact', () => {
  const play = make(), point = { x: play.lineOfScrimmage + 200, y: 410, manual: true };
  assert.equal(targetForDepth(play, point, 'auto'), point);
  const plans = ['short', 'medium', 'deep'].map(depth => play.aim(targetForDepth(play, point, depth)));
  for (const [index, yards] of [5, 14, 28].entries()) {
    assert.equal(plans[index].target.x, play.lineOfScrimmage + yards * play.field.yard);
    assert.equal(plans[index].target.y, point.y);
  }
  assert.ok(plans[0].duration < plans[1].duration && plans[1].duration < plans[2].duration);
  assert.deepEqual(play.aim(point).target, { ...point });
  play.qb.setRatings({ throwPower: 0 });
  const limited = play.aim(targetForDepth(play, { ...point, y: 30 }, 'deep'));
  assert.ok(distance(play.qb, limited.target) <= throwRange(play.qb.ratings) + .0001, 'arm strength still limits selected depth');
});

test('CPU coverage is situational and cannot inspect the selected offensive play', () => {
  const normal = { down: 1, yardsToGo: 10, spot: 35 };
  Object.defineProperty(normal, 'selectedPlay', { get() { throw new Error('CPU read the selected play'); } });
  assert.equal(chooseCpuCoverage(normal, () => .2), 'man');
  assert.equal(chooseCpuCoverage({ ...normal, down: 3, yardsToGo: 15 }, () => .2), 'cover2');
  assert.equal(chooseCpuCoverage({ ...normal, down: 3, yardsToGo: 1 }, () => .7), 'blitz');
  assert.equal(chooseCpuCoverage({ ...normal, quarter: 4, clock: 20, possession: 'home', score: { home: 7, away: 14 } }, () => .6), 'cover3');
});
