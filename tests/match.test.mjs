import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchRules } from '../src/game/MatchRules.js';
import { MatchController } from '../src/game/MatchController.js';
import { Opponent } from '../src/game/Opponent.js';
import { Play } from '../src/football/Play.js';
import { Field } from '../src/world/Field.js';
import { formatClock } from '../src/ui/GameHUD.js';

const rules = (random = () => .4) => { const r = new MatchRules(random); r.start(60); return r; };
const complete = (r, type, spot = r.spot) => { assert.equal(r.beginPlay(), true); assert.equal(r.completePlay({ type, spot }), true); };

test('new game: opening touchback, score, possession, first down and clocks', () => {
  const r = rules(); assert.equal(r.possession, 'home'); assert.equal(r.spot, 25); assert.equal(r.down, 1);
  assert.equal(r.yardsToGo, 10); assert.equal(r.downLabel, '1ST & 10'); assert.equal(r.clock, 60);
  r.tick(1); assert.equal(r.clock, 60); assert.equal(r.playClock, 39);
  r.beginPlay(); r.tick(2); assert.equal(r.clock, 58); assert.equal(r.playClock, 39);
});

test('gain, loss, incompletion and exact first down track the original line to gain', () => {
  const r = rules(); complete(r, 'TACKLED', 33);
  assert.equal(r.result, 'Gain of 8 yards'); assert.equal(r.down, 2); assert.equal(r.yardsToGo, 2);
  r.continue(); complete(r, 'SACK', 29); assert.equal(r.yardsToGo, 6); assert.equal(r.down, 3); assert.equal(r.result, 'SACK');
  r.continue(); complete(r, 'INCOMPLETE', 89); assert.equal(r.spot, 29); assert.equal(r.down, 4);
  r.continue(); complete(r, 'TACKLED', 35); assert.equal(r.down, 1); assert.equal(r.yardsToGo, 10); assert.equal(r.possession, 'home');
  assert.match(r.result, /FIRST DOWN/);
});

test('four failed downs change possession, flip field position, and reset the series', () => {
  const r = rules();
  for (let i = 0; i < 4; i++) { complete(r, 'INCOMPLETE'); if (i < 3) r.continue(); }
  assert.equal(r.result, 'TURNOVER ON DOWNS'); assert.equal(r.possession, 'away'); assert.equal(r.spot, 75);
  assert.equal(r.down, 1); assert.equal(r.firstDownLine, 85); assert.equal(r.clockRunning, false);
});

test('interceptions flip field position, with end-zone touchback and defensive TD', () => {
  for (const [spot, expectedSpot] of [[68, 32], [100, 20], [104, 20]]) {
    const r = rules(); complete(r, 'INTERCEPTION', spot); assert.equal(r.possession, 'away'); assert.equal(r.spot, expectedSpot); assert.equal(r.score.away, 0);
  }
  const r = rules(); complete(r, 'INTERCEPTION', -2); assert.equal(r.score.away, 6); assert.equal(r.next, 'extraPoint'); assert.equal(r.possession, 'away');
});

test('touchdown is exactly six, extra point is untimed, then kickoff changes possession', () => {
  const r = rules(); complete(r, 'TOUCHDOWN', 100); assert.equal(r.score.home, 6);
  assert.equal(r.completePlay({ type: 'TOUCHDOWN', spot: 100 }), false); assert.equal(r.score.home, 6);
  r.continue(); assert.equal(r.phase, 'extraPoint'); const clock = r.clock;
  r.tick(3); r.beginKick('extraPoint'); r.tick(3); assert.equal(r.clock, clock);
  r.completeKick(); assert.equal(r.score.home, 7); assert.equal(r.possession, 'away'); assert.equal(r.spot, 25);
  assert.equal(r.completeKick(), false); assert.equal(r.byQuarter.home[0], 7);
});

test('missed extra point leaves six and still kicks off', () => {
  const r = rules(() => .99); complete(r, 'TOUCHDOWN', 100); r.continue(); r.beginKick('extraPoint'); r.completeKick();
  assert.equal(r.score.home, 6); assert.equal(r.result, 'EXTRA POINT MISSED'); assert.equal(r.possession, 'away');
});

test('field goals score three; misses use kick spot or receiving 20, with no double count', () => {
  const r = rules(); r.newSeries(75); assert.equal(r.fieldGoalDistance, 42); assert.ok(r.fieldGoalChance > .7);
  r.beginKick('fieldGoal'); r.tick(3); r.completeKick(); assert.equal(r.score.home, 3); assert.equal(r.possession, 'away'); assert.equal(r.spot, 25);
  for (const [from, expected] of [[75, 32], [95, 20]]) {
    const miss = rules(() => .999); miss.newSeries(from); miss.beginKick('fieldGoal'); miss.completeKick();
    assert.equal(miss.score.home, 0); assert.equal(miss.spot, expected); assert.equal(miss.possession, 'away');
  }
});

test('punts change possession at the landing spot or the 20 for a touchback', () => {
  const r = rules(() => 0); r.beginKick('punt'); r.completeKick(); assert.equal(r.spot, 39); assert.equal(r.possession, 'away');
  const touchback = rules(); touchback.newSeries(80); touchback.beginKick('punt'); touchback.completeKick();
  assert.equal(touchback.spot, 20); assert.equal(touchback.result, 'PUNT · TOUCHBACK');
});

test('safety scores two for defense and grants it the free-kick possession', () => {
  const r = rules(); r.newSeries(3); complete(r, 'OUT OF BOUNDS', -1);
  assert.equal(r.score.away, 2); assert.equal(r.possession, 'away'); assert.equal(r.spot, 25); assert.equal(r.down, 1);
});

test('goal-to-go retains goal line after a loss; crossing goal scores on fourth down', () => {
  const r = rules(); r.newSeries(95); assert.equal(r.downLabel, '1ST & GOAL');
  complete(r, 'TACKLED', 85); assert.equal(r.yardsToGo, 15); assert.equal(r.downLabel, '2ND & GOAL');
  r.continue(); r.down = 4; complete(r, 'TACKLED', 100); assert.equal(r.score.home, 6); assert.equal(r.next, 'extraPoint');
});

test('clock runs after in-bounds plays, stops for incompletions/OOB, and play clock spans result screen', () => {
  const r = rules(); complete(r, 'TACKLED', 27); r.tick(4); assert.equal(r.clock, 56); assert.equal(r.playClock, 36);
  r.continue(); assert.equal(r.playClock, 36); r.tick(2); assert.equal(r.clock, 54);
  complete(r, 'INCOMPLETE'); const frozen = r.clock; r.tick(3); assert.equal(r.clock, frozen);
  r.continue(); complete(r, 'OUT OF BOUNDS', 29); r.tick(3); assert.equal(r.clock, frozen);
});

test('delay of game is five yards or half the distance, retains down and line to gain', () => {
  for (const [spot, expected] of [[25, 20], [4, 2], [1, .5]]) {
    const r = rules(); r.newSeries(spot); r.down = 3; const line = r.firstDownLine;
    r.tick(40); assert.equal(r.spot, expected); assert.equal(r.down, 3); assert.equal(r.firstDownLine, line);
    assert.equal(r.result, 'DELAY OF GAME'); assert.equal(r.playClock, 25); assert.equal(r.clock, 60);
  }
});

test('live play survives 0:00; quarter break preserves down, possession and field position', () => {
  const r = rules(); r.clock = .5; r.beginPlay(); r.tick(1); assert.equal(r.clock, 0); assert.equal(r.phase, 'live');
  r.completePlay({ type: 'TACKLED', spot: 28 }); r.continue(); assert.equal(r.phase, 'quarterBreak'); assert.equal(r.quarter, 2);
  assert.equal(r.spot, 28); assert.equal(r.down, 2); assert.equal(r.yardsToGo, 7);
  r.continue(); assert.equal(r.phase, 'ready'); assert.equal(r.clock, 60);
});

test('halftime stops play, then quarter three gives the designated receiver a fresh series', () => {
  const r = rules(); r.quarter = 2; r.clock = .1; complete(r, 'TACKLED', 32); r.tick(1); r.continue();
  assert.equal(r.phase, 'halftime'); r.tick(100); assert.equal(r.quarter, 2); assert.equal(r.clock, 0);
  r.continue(); assert.equal(r.quarter, 3); assert.equal(r.possession, 'away'); assert.equal(r.spot, 25); assert.equal(r.down, 1); assert.equal(r.clock, 60);
});

test('expiration touchdown and extra point score in the old quarter before final', () => {
  const r = rules(); r.quarter = 4; r.clock = .1; r.beginPlay(); r.tick(1); r.completePlay({ type: 'TOUCHDOWN', spot: 100 });
  r.continue(); assert.equal(r.phase, 'extraPoint'); r.beginKick('extraPoint'); r.tick(5); r.completeKick();
  assert.equal(r.byQuarter.home[3], 7); r.continue(); assert.equal(r.phase, 'final');
  const frozen = JSON.stringify(r); r.tick(100); r.beginPlay(); r.beginKick('punt'); r.continue();
  assert.equal(JSON.stringify(r), frozen);
});

test('field goal at the buzzer counts; scoreless regulation can end in a tie', () => {
  const r = rules(); r.quarter = 4; r.clock = .1; r.newSeries(90); r.beginKick('fieldGoal'); r.tick(3);
  assert.equal(r.phase, 'kick'); r.completeKick(); r.continue(); assert.equal(r.phase, 'final'); assert.equal(r.score.home, 3);
  const tie = rules(); tie.quarter = 4; tie.clock = .1; tie.clockRunning = true; tie.tick(1); assert.equal(tie.phase, 'final'); assert.equal(tie.score.home, tie.score.away);
});

test('kick and play actions cannot be used in invalid phases', () => {
  const r = rules(); assert.equal(r.beginKick('extraPoint'), false); assert.equal(r.beginKick('invalid'), false);
  r.beginPlay(); assert.equal(r.beginKick('punt'), false); assert.equal(r.beginPlay(), false);
  assert.equal(r.continue(), false); assert.equal(r.completeKick(), false);
});

test('formation follows ball position without changing route templates or uniforms incorrectly', () => {
  const p = new Play(new Field());
  for (const spot of [1, 25, 50, 85, 99]) {
    p.configure(spot, 'away'); assert.equal(p.lineOfScrimmage, 200 + spot * 20); assert.equal(p.qb.uniform, 'away'); assert.equal(p.defenders[0].uniform, 'home');
    for (const player of p.players) { assert.ok(player.x >= 0 && player.x <= p.field.width); assert.ok(Number.isFinite(player.x)); }
    p.snap(); p.update(1 / 60); assert.ok(p.receivers.every(receiver => Number.isFinite(receiver.x)));
  }
  p.configure(25, 'home'); assert.equal(p.qb.x, 590); assert.equal(p.qb.uniform, 'home'); assert.equal(p.firstDownX, 900);
});

test('full four-quarter match uses real plays, AI possessions, halftime and a frozen final score', () => {
  let seed = 314159;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const controller = new MatchController(new Play(new Field(), random), random);
  const humanCoach = new Opponent(random); controller.start(10);
  const quarters = new Set(), possessions = new Set(), phases = new Set();
  for (let frame = 0; frame < 30000 && controller.rules.phase !== 'final'; frame++) {
    const r = controller.rules; quarters.add(r.quarter); possessions.add(r.possession); phases.add(r.phase);
    if (r.phase === 'ready' && controller.humanTurn) { humanCoach.reset(); controller.snap(); }
    if (r.phase === 'extraPoint' && controller.humanTurn) controller.kick('extraPoint');
    if (['result', 'quarterBreak', 'halftime'].includes(r.phase)) controller.advance();
    const movement = controller.humanTurn && r.phase === 'live' ? humanCoach.movement(controller.play) : { x: 0, y: 0 };
    controller.update(1 / 60, movement);
  }
  assert.equal(controller.rules.phase, 'final'); assert.deepEqual([...quarters], [1, 2, 3, 4]);
  assert.ok(phases.has('halftime')); assert.equal(possessions.size, 2); assert.ok(controller.rules.playNumber >= 4);
  for (const team of ['home', 'away']) assert.equal(controller.rules.score[team], controller.rules.byQuarter[team].reduce((a, b) => a + b, 0));
  const score = { ...controller.rules.score }; controller.update(5, { x: 1, y: 0 }); assert.deepEqual(controller.rules.score, score);
});

test('clock formatting handles exact minute boundaries and never displays negative time', () => {
  assert.equal(formatClock(120), '2:00'); assert.equal(formatClock(59.1), '1:00'); assert.equal(formatClock(.1), '0:01'); assert.equal(formatClock(-1), '0:00');
});
