import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchRules } from '../src/game/MatchRules.js';
import { MatchController } from '../src/game/MatchController.js';
import { KickoffReturn } from '../src/game/KickoffReturn.js';

const other = team => team === 'home' ? 'away' : 'home';
function makeRules(team = 'home') {
  const rules = new MatchRules(() => .4);
  rules.start(30); rules.possession = team; rules.newSeries(45);
  return rules;
}
function complete(rules, outcome) {
  assert.equal(rules.beginPlay(), true);
  rules.tick(.5);
  assert.equal(rules.completePlay(outcome), true);
}
function returning(outcome, team = 'home') {
  // Drive the real controller's return completion using the live-play outcome contract.
  const play = { outcome, phase: 'running', update() { this.phase = 'dead'; } };
  const controller = new MatchController(play, () => .4);
  controller.rules.start(30); controller.rules.possession = team;
  controller.rules.newSeries(5); controller.rules.phase = 'return';
  controller.rules.clockRunning = true; controller.returns.landing = 5;
  controller.opponent.movement = () => ({ x: 0, y: 0 });
  return controller;
}

test('defensive fumble recovery reverses the field and starts a stopped-clock series for either team', () => {
  for (const team of ['home', 'away']) {
    const rules = makeRules(team); rules.down = 4;
    complete(rules, { type: 'FUMBLE', spot: 63.26, fumbleSpot: 61, recoveredBy: 'defense' });
    assert.equal(rules.possession, other(team)); assert.equal(rules.spot, 36.7);
    assert.equal(rules.down, 1); assert.equal(rules.firstDownLine, 46.7);
    assert.equal(rules.result, 'FUMBLE / DEFENSE RECOVERS');
    assert.equal(rules.clockRunning, false); assert.equal(rules.playClock, 40);
    rules.tick(3); assert.equal(rules.clock, 29.5);
    assert.deepEqual(rules.score, { home: 0, away: 0 });
  }
});

test('defense recovers a fumble in the original offense end zone for six exactly once', () => {
  for (const team of ['home', 'away']) {
    for (const spot of [-3, 0]) {
      const rules = makeRules(team);
      const outcome = { type: 'FUMBLE', spot, recoveredBy: 'defense' };
      complete(rules, outcome);
      assert.equal(rules.possession, other(team)); assert.equal(rules.score[other(team)], 6);
      assert.equal(rules.score[team], 0); assert.equal(rules.next, 'extraPoint');
      assert.equal(rules.clockRunning, false); assert.equal(rules.kickoffPending, false);
      assert.equal(rules.byQuarter[other(team)][0], 6);
      assert.equal(rules.completePlay(outcome), false);
      assert.equal(rules.score[other(team)], 6);
    }
  }
});

test('defense recovers a fumble in its own end zone for a touchback with no score', () => {
  for (const team of ['home', 'away']) {
    for (const spot of [100, 104]) {
      const rules = makeRules(team);
      complete(rules, { type: 'FUMBLE', spot, recoveredBy: 'defense' });
      assert.equal(rules.possession, other(team)); assert.equal(rules.spot, 20);
      assert.equal(rules.down, 1); assert.equal(rules.firstDownLine, 30);
      assert.equal(rules.result, 'FUMBLE / TOUCHBACK'); assert.equal(rules.next, null);
      assert.deepEqual(rules.score, { home: 0, away: 0 });
    }
  }
});

test('offensive recovery finishes under ordinary tackle, first-down, touchdown and safety rules', () => {
  for (const team of ['home', 'away']) {
    const tackle = makeRules(team);
    complete(tackle, { type: 'TACKLED', spot: 49, fumbleSpot: 47, recoveredBy: 'offense' });
    assert.equal(tackle.possession, team); assert.equal(tackle.down, 2);
    assert.equal(tackle.spot, 49); assert.equal(tackle.clockRunning, true);
    const first = makeRules(team);
    complete(first, { type: 'TACKLED', spot: 56, recoveredBy: 'offense' });
    assert.equal(first.possession, team); assert.equal(first.down, 1);
    const touchdown = makeRules(team);
    complete(touchdown, { type: 'TOUCHDOWN', spot: 100, recoveredBy: 'offense' });
    assert.equal(touchdown.score[team], 6); assert.equal(touchdown.next, 'extraPoint');
    const safety = makeRules(team);
    complete(safety, { type: 'SAFETY', spot: -2, recoveredBy: 'offense' });
    assert.equal(safety.score[other(team)], 2); assert.equal(safety.possession, other(team));
    assert.equal(safety.kickoffPending, true);
  }
});

test('sideline fumbles retain possession, cannot advance from the loss spot and stop the clock', () => {
  for (const [spot, fumbleSpot, expected] of [[58, 49, 49], [48, 49, 48], [58, 55, 55]]) {
    const rules = makeRules();
    complete(rules, { type: 'FUMBLE_OUT_OF_BOUNDS', spot, fumbleSpot });
    assert.equal(rules.possession, 'home'); assert.equal(rules.spot, expected);
    assert.equal(rules.down, expected >= 55 ? 1 : 2);
    assert.equal(rules.clockRunning, false); assert.match(rules.result, /FUMBLE OUT OF BOUNDS/);
    rules.tick(2); assert.equal(rules.clock, 29.5);
  }
});

test('fourth-down sideline fumble cannot reach the first down by rolling forward', () => {
  const rules = makeRules(); rules.down = 4;
  complete(rules, { type: 'FUMBLE_OUT_OF_BOUNDS', spot: 60, fumbleSpot: 54 });
  assert.equal(rules.result, 'TURNOVER ON DOWNS'); assert.equal(rules.possession, 'away');
  assert.equal(rules.spot, 46); assert.equal(rules.down, 1);
});

test('loose ball out through the opponent end zone is a turnover touchback, never a touchdown', () => {
  for (const team of ['home', 'away']) {
    for (const spot of [100, 105]) {
      const rules = makeRules(team);
      complete(rules, { type: 'FUMBLE_OUT_OF_BOUNDS', spot, fumbleSpot: 99 });
      assert.equal(rules.possession, other(team)); assert.equal(rules.spot, 20);
      assert.equal(rules.result, 'FUMBLE / TOUCHBACK'); assert.equal(rules.next, null);
      assert.equal(rules.clockRunning, false); assert.equal(rules.kickoffPending, false);
      assert.deepEqual(rules.score, { home: 0, away: 0 });
    }
  }
});

test('loose ball out through the original offense end zone or forward from there is a safety', () => {
  for (const team of ['home', 'away']) {
    for (const [spot, fumbleSpot] of [[-2, 2], [0, 2], [3, -1]]) {
      const rules = makeRules(team);
      complete(rules, { type: 'FUMBLE_OUT_OF_BOUNDS', spot, fumbleSpot });
      assert.equal(rules.score[other(team)], 2); assert.equal(rules.score[team], 0);
      assert.equal(rules.possession, other(team)); assert.equal(rules.spot, 25);
      assert.equal(rules.kickoffPending, true); assert.equal(rules.clockRunning, false);
    }
  }
});

test('kickoff return fumble recovery gives the kicking team the ball rather than a returner series', () => {
  for (const team of ['home', 'away']) {
    const controller = returning({ type: 'FUMBLE', spot: 28, fumbleSpot: 27, recoveredBy: 'defense' }, team);
    controller.update(.1, { x: 0, y: 0 });
    const rules = controller.rules;
    assert.equal(rules.phase, 'result'); assert.equal(rules.possession, other(team));
    assert.equal(rules.spot, 72); assert.equal(rules.down, 1);
    assert.equal(rules.result, 'FUMBLE / DEFENSE RECOVERS'); assert.equal(rules.clockRunning, false);
    assert.equal(rules.clock, 29.9); assert.equal(rules.kickoffPending, false);
  }
});

test('kickoff return fumble end-zone recovery and loose-ball exits use touchdown, touchback and safety rules', () => {
  for (const team of ['home', 'away']) {
    for (const [type, spot, points, expectedSpot] of [
      ['FUMBLE', -2, 6, 0], ['FUMBLE', 102, 0, 20],
      ['FUMBLE_OUT_OF_BOUNDS', 102, 0, 20], ['FUMBLE_OUT_OF_BOUNDS', -2, 2, 25],
    ]) {
      const controller = returning({ type, spot, fumbleSpot: 3, recoveredBy: 'defense' }, team);
      controller.update(.1, { x: 0, y: 0 });
      const rules = controller.rules;
      assert.equal(rules.possession, other(team)); assert.equal(rules.score[other(team)], points);
      if (points !== 6) assert.equal(rules.spot, expectedSpot);
      else assert.equal(rules.next, 'extraPoint');
      assert.equal(controller.returns.finish(rules), false);
      assert.equal(rules.score[other(team)], points);
    }
  }
});

test('sideline fumble and offensive recovery on a kickoff start a fresh first down for the receiving team', () => {
  for (const team of ['home', 'away']) {
    for (const outcome of [
      { type: 'FUMBLE_OUT_OF_BOUNDS', spot: 34, fumbleSpot: 29 },
      { type: 'TACKLED', spot: 29, fumbleSpot: 27, recoveredBy: 'offense' },
    ]) {
      const controller = returning(outcome, team);
      controller.update(.1, { x: 0, y: 0 });
      assert.equal(controller.rules.possession, team); assert.equal(controller.rules.spot, 29);
      assert.equal(controller.rules.down, 1); assert.equal(controller.rules.firstDownLine, 39);
      assert.equal(controller.rules.clockRunning, false); assert.match(controller.rules.result, /KICK RETURN/);
    }
  }
});

test('a fumble recovery at 0:00 completes the live play, while defensive touchdowns retain their untimed PAT', () => {
  for (const type of ['FUMBLE', 'FUMBLE_OUT_OF_BOUNDS']) {
    const rules = makeRules(); rules.quarter = 4; rules.clock = .1;
    assert.equal(rules.beginPlay(), true); rules.tick(.2);
    assert.equal(rules.phase, 'live'); assert.equal(rules.clock, 0);
    assert.equal(rules.completePlay({ type, spot: 60, fumbleSpot: 59 }), true);
    rules.continue(); assert.equal(rules.phase, 'final');
  }
  const rules = makeRules(); rules.quarter = 4; rules.clock = .1;
  assert.equal(rules.beginPlay(), true); rules.tick(.2);
  rules.completePlay({ type: 'FUMBLE', spot: -2, recoveredBy: 'defense' });
  rules.continue(); assert.equal(rules.phase, 'extraPoint');
  rules.tick(10); assert.equal(rules.clock, 0);
  rules.beginKick('extraPoint'); rules.tick(10); rules.completeKick();
  assert.equal(rules.score.away, 7); assert.equal(rules.byQuarter.away[3], 7);
  rules.continue(); assert.equal(rules.phase, 'final'); assert.equal(rules.kickoffPending, false);
});

test('expired kickoff return finishes its fumble turnover before advancing the quarter', () => {
  const controller = returning({ type: 'FUMBLE', spot: 31, recoveredBy: 'defense' });
  controller.rules.quarter = 4; controller.rules.clock = .01;
  controller.update(.02, { x: 0, y: 0 });
  assert.equal(controller.rules.clock, 0); assert.equal(controller.rules.phase, 'result');
  assert.equal(controller.rules.possession, 'away'); assert.equal(controller.rules.spot, 69);
  controller.advance(); assert.equal(controller.rules.phase, 'final');
});

test('kickoff finish is idempotent for normal and scoring outcomes', () => {
  for (const type of ['TACKLED', 'TOUCHDOWN', 'SAFETY', 'FUMBLE']) {
    const rules = makeRules(); rules.phase = 'return';
    const returnPlay = new KickoffReturn({ outcome: { type, spot: type === 'TOUCHDOWN' ? 100 : type === 'SAFETY' ? -2 : 25 } });
    returnPlay.landing = 5;
    assert.equal(returnPlay.finish(rules), true);
    const score = { ...rules.score }, possession = rules.possession, down = rules.down;
    assert.equal(returnPlay.finish(rules), false);
    assert.deepEqual(rules.score, score); assert.equal(rules.possession, possession); assert.equal(rules.down, down);
  }
});
