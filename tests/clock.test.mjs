import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchRules } from '../src/game/MatchRules.js';
import { clockDecision } from '../src/game/ClockStrategy.js';

const rules = () => { const r = new MatchRules(() => .4); r.start(120); return r; };
const complete = (r, type, spot = r.spot) => { assert.equal(r.beginPlay(), true); assert.equal(r.completePlay({ type, spot }), true); };

test('timeouts charge the requesting team, preserve the series and freeze until the next snap', () => {
  const r = rules(); complete(r, 'TACKLED', 29); r.tick(4);
  const state = { spot: r.spot, line: r.firstDownLine, down: r.down, possession: r.possession, score: { ...r.score } };
  assert.equal(r.timeout('home'), true); assert.deepEqual(r.timeouts, { home: 2, away: 3 });
  assert.equal(r.playClock, 25); assert.equal(r.clockRunning, false);
  const time = r.clock; r.tick(3); assert.equal(r.clock, time); assert.equal(r.playClock, 22);
  r.continue(); r.tick(2); assert.equal(r.clock, time); assert.equal(r.playClock, 20);
  assert.deepEqual({ spot: r.spot, line: r.firstDownLine, down: r.down, possession: r.possession, score: r.score }, state);
  r.beginPlay(); r.tick(2); assert.equal(r.clock, time - 2);
  assert.equal(r.timeouts.home, 2);
});

test('both teams have three timeouts; exhausted and unknown team calls have no effect', () => {
  const r = rules();
  for (const team of ['home', 'away']) {
    for (let i = 0; i < 3; i++) assert.equal(r.timeout(team), true);
    const frozen = JSON.stringify(r); assert.equal(r.timeout(team), false); assert.equal(JSON.stringify(r), frozen);
  }
  assert.equal(r.timeout('visitors'), false); assert.deepEqual(r.timeouts, { home: 0, away: 0 });
  r.start(60); assert.deepEqual(r.timeouts, { home: 3, away: 3 });
});

test('timeouts are available between scrimmage plays and forbidden during plays, scoring and breaks', () => {
  for (const phase of ['pregame', 'live', 'kick', 'kickMeter', 'kickoff', 'return', 'extraPoint', 'halftime', 'quarterBreak', 'final']) {
    const r = rules(); r.phase = phase;
    assert.equal(r.canTimeout('home'), false, phase); assert.equal(r.timeout('home'), false, phase);
    assert.equal(r.timeouts.home, 3);
  }
  for (const setup of [r => { r.clock = 0; }, r => { r.next = 'extraPoint'; }, r => { r.kickoffPending = true; }]) {
    const r = rules(); setup(r); assert.equal(r.timeout('home'), false);
  }
  const r = rules(); assert.equal(r.timeout('away'), true); complete(r, 'INCOMPLETE'); assert.equal(r.timeout('home'), true);
});

test('timeout gives a fair 25 seconds but the play clock still enforces delay of game', () => {
  const r = rules(); r.playClock = 1; r.timeout(); r.tick(24);
  assert.equal(r.phase, 'ready'); assert.equal(r.playClock, 1); assert.equal(r.clock, 120);
  r.tick(1); assert.equal(r.result, 'DELAY OF GAME'); assert.equal(r.spot, 20); assert.equal(r.down, 1);
});

test('timeouts carry between first/second and third/fourth quarters and replenish once at halftime', () => {
  const r = rules(); r.timeout('home'); r.timeout('away');
  r.clock = 0; r.advanceQuarter(); assert.equal(r.quarter, 2); assert.deepEqual(r.timeouts, { home: 2, away: 2 }); r.continue();
  r.timeout('home'); r.clock = 0; r.advanceQuarter(); assert.equal(r.phase, 'halftime');
  assert.deepEqual(r.timeouts, { home: 3, away: 3 });
  r.timeouts.home = 2; r.advanceQuarter(); assert.equal(r.timeouts.home, 2, 'repeated halftime transition cannot replenish twice');
  r.continue(); assert.equal(r.quarter, 3); assert.equal(r.timeouts.home, 2);
  r.kickoffPending = false; r.timeout('away'); r.clock = 0; r.advanceQuarter(); r.continue();
  assert.equal(r.quarter, 4); assert.deepEqual(r.timeouts, { home: 2, away: 2 });
});

test('spiking sacrifices a down without moving the ball and stops the game clock', () => {
  const r = rules(); assert.equal(r.completePlay({ type: 'SPIKE', spot: 100 }), false);
  r.beginPlay(); r.tick(.4); r.completePlay({ type: 'SPIKE', spot: 100 });
  assert.equal(r.result, 'SPIKE'); assert.equal(r.down, 2); assert.equal(r.spot, 25); assert.equal(r.yardsToGo, 10);
  assert.equal(r.clockRunning, false); const clock = r.clock; r.tick(5); r.continue(); r.tick(2); assert.equal(r.clock, clock);
  r.down = 4; complete(r, 'SPIKE', 100); assert.equal(r.result, 'TURNOVER ON DOWNS'); assert.equal(r.possession, 'away'); assert.equal(r.spot, 75);
});

test('kneeling loses one yard and a down, runs clock, and can yield a safety or turnover', () => {
  const r = rules(); complete(r, 'KNEEL', 100);
  assert.equal(r.result, 'QB KNEEL'); assert.equal(r.spot, 24); assert.equal(r.down, 2); assert.equal(r.yardsToGo, 11);
  assert.equal(r.clockRunning, true); r.tick(4); assert.equal(r.clock, 116);
  r.continue(); r.down = 4; complete(r, 'KNEEL'); assert.equal(r.result, 'TURNOVER ON DOWNS'); assert.equal(r.spot, 77);
  const safety = rules(); safety.newSeries(.5); complete(safety, 'KNEEL'); assert.equal(safety.score.away, 2); assert.equal(safety.kickoffPending, true);
});

test('CPU preserves a late-half drive or stops a trailing defense, and protects a fourth-quarter lead', () => {
  const r = rules(); r.quarter = 4; r.clock = 15; r.score.home = 7; complete(r, 'TACKLED', 29);
  assert.equal(clockDecision(r).timeout, true); r.timeout('away'); assert.equal(clockDecision(r).timeout, false);
  r.possession = 'away'; r.clockRunning = true;
  assert.equal(clockDecision(r).tempo, 'hurry'); assert.equal(clockDecision(r).timeout, true);
  r.score.away = 10; assert.equal(clockDecision(r).tempo, 'chew'); assert.equal(clockDecision(r).timeout, false);
  r.quarter = 3; r.score.away = 0; assert.equal(clockDecision(r).tempo, 'normal'); assert.equal(clockDecision(r).timeout, false);
  r.quarter = 2; assert.equal(clockDecision(r).tempo, 'hurry');
  r.phase = 'live'; assert.equal(clockDecision(r).timeout, false);
});
