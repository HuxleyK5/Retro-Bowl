import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchController } from '../src/game/MatchController.js';
import { Play } from '../src/football/Play.js';
import { Field } from '../src/world/Field.js';

const still = { x: 0, y: 0 };
const make = () => { const c = new MatchController(new Play(new Field(), () => .5), () => .5); c.start(120, false); return c; };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} should equal ${expected}`);
const series = r => ({ score: { ...r.score }, down: r.down, spot: r.spot, line: r.firstDownLine,
  possession: r.possession, clock: r.clock, playClock: r.playClock, running: r.clockRunning });
const cpuBall = c => { c.rules.possession = 'away'; c.prepare(); };

test('formation changes and audibles alter the real alignment and routes without resetting the series or clocks', () => {
  const c = make(), r = c.rules; r.down = 3; r.clock = 87; r.playClock = 17; r.clockRunning = true;
  const before = series(r), receiver = c.play.receivers.find(p => p.slot === '81'), original = { ...receiver.spawn };
  assert.equal(c.tactic('formation', 'bunch'), true); assert.equal(c.play.formation, 'bunch');
  assert.notDeepEqual(receiver.spawn, original); assert.deepEqual(series(r), before);
  const routes = receiver.route.map(point => ({ ...point })), call = c.selectedPlayId;
  assert.equal(c.audible(1), true); assert.notEqual(c.selectedPlayId, call);
  assert.equal(c.play.formation, 'bunch'); assert.notDeepEqual(receiver.route, routes); assert.deepEqual(series(r), before);
  assert.equal(c.tactic('throwDepth', 'deep'), true); assert.equal(c.tactic('motion', 'right'), true);
  assert.deepEqual(series(r), before);
  c.update(.25, still); assert.ok(receiver.y > receiver.spawn.y, 'selected receiver actually travels before the snap');
  close(r.clock, 86.75); close(r.playClock, 16.75); assert.equal(r.down, 3);
  const release = { x: receiver.x, y: receiver.y };
  c.snap(); assert.deepEqual(receiver.spawn, release, 'snapping preserves the receiver motion release point');
});

test('human defensive calls change CPU coverage responsibilities and alignment while retaining field state', () => {
  const c = make(); cpuBall(c); const r = c.rules, before = series(r);
  assert.equal(c.tactic('coverage', 'cover2'), true);
  assert.equal(c.play.coverage, 'cover2'); assert.equal(c.play.defenders.filter(p => p.coverageRole.deep).length, 2);
  const deepest = Math.max(...c.play.defenders.map(p => p.x));
  assert.equal(c.tactic('adjustment', 'press'), true); assert.ok(Math.max(...c.play.defenders.map(p => p.x)) < deepest);
  assert.deepEqual(series(r), before);
  assert.equal(c.tactic('formation', 'bunch'), false); assert.equal(c.tactic('motion', 'right'), false);
  assert.equal(c.tactic('throwDepth', 'short'), false); assert.equal(c.tactic('tempo', 'hurry'), false);
  c.snap(); assert.equal(c.tactic('coverage', 'blitz'), false); assert.equal(c.tactic('adjustment', 'box'), false);
  assert.equal(c.play.coverage, 'cover2'); assert.equal(c.play.defensiveAdjustment, 'press');
});

test('short, medium and deep selections produce increasing real throw targets and flight times', () => {
  const throws = [];
  for (const depth of ['short', 'medium', 'deep']) {
    const c = make(); c.snap(); assert.equal(c.tactic('throwDepth', depth), true);
    c.action('throw', still, { x: c.play.qb.x + 500, y: c.play.qb.y, manual: true });
    assert.equal(c.play.ball.mode, 'flight'); assert.equal(c.play.phase, 'flight');
    throws.push({ x: c.play.ball.target.x, duration: c.play.ball.duration });
    assert.equal(c.tactic('throwDepth', 'auto'), false, 'a released pass cannot be changed');
  }
  assert.ok(throws[0].x < throws[1].x && throws[1].x < throws[2].x);
  assert.ok(throws[0].duration < throws[1].duration && throws[1].duration < throws[2].duration);
});

test('invalid and live-only tactical changes cannot substitute a formation, audible, motion or clock play', () => {
  const c = make(), initial = series(c.rules);
  for (const [name, value] of [['formation', 'invalid'], ['motion', 'up'], ['throwDepth', 'far'], ['tempo', 'fast'], ['coverage', 'cover3']])
    assert.equal(c.tactic(name, value), false);
  assert.deepEqual(series(c.rules), initial);
  c.snap(); const live = series(c.rules), selected = c.selectedPlayId;
  assert.equal(c.audible(1), false); assert.equal(c.selectedPlayId, selected);
  for (const [name, value] of [['formation', 'bunch'], ['motion', 'right'], ['tempo', 'chew'], ['kneel'], ['spike'], ['timeout']])
    assert.equal(c.tactic(name, value), false, name);
  assert.deepEqual(series(c.rules), live);
});

test('hurry advances an ordinary result promptly and leaves the next snap under human control', () => {
  const normal = make(); normal.tactic('kneel'); normal.update(1, still); assert.equal(normal.rules.phase, 'result');
  const c = make(); c.tactic('tempo', 'hurry'); c.tactic('kneel');
  c.update(.34, still); assert.equal(c.rules.phase, 'result');
  c.update(.02, still); assert.equal(c.rules.phase, 'ready'); assert.equal(c.play.phase, 'presnap'); assert.equal(c.rules.down, 2);
  const touchdown = make(); touchdown.tactic('tempo', 'hurry'); touchdown.snap();
  touchdown.play.finish('TOUCHDOWN'); touchdown.rules.completePlay({ type: 'TOUCHDOWN', spot: 100 });
  touchdown.update(1, still); assert.equal(touchdown.rules.phase, 'result'); assert.equal(touchdown.rules.next, 'extraPoint');
});

test('chew advances both running clocks together, stops acceleration at five seconds, and leaves live physics at normal speed', () => {
  const c = make(); c.tactic('kneel'); c.tactic('tempo', 'chew');
  const before = series(c.rules); c.update(1, still);
  close(c.rules.clock, before.clock - 6); close(c.rules.playClock, before.playClock - 6);
  c.advance(); c.rules.playClock = 7; const clock = c.rules.clock;
  c.update(1, still); close(c.rules.playClock, 5); close(c.rules.clock, clock - 2);
  c.update(1, still); close(c.rules.playClock, 4); close(c.rules.clock, clock - 3);
  c.snap(); const liveClock = c.rules.clock; c.update(.1, still);
  close(c.rules.clock, liveClock - .1); close(c.play.elapsed, .1);
  const stopped = make(); stopped.tactic('tempo', 'chew'); stopped.update(1, still);
  close(stopped.rules.clock, 120); close(stopped.rules.playClock, 39);
});

test('human timeouts work on offense and defense, preserve the result state and charge the human team', () => {
  for (const defense of [false, true]) {
    const c = make(); if (defense) cpuBall(c);
    c.clockPlay('kneel'); const before = series(c.rules);
    assert.equal(c.tactic('timeout'), true); assert.deepEqual(c.rules.timeouts, { home: 2, away: 3 });
    assert.equal(c.rules.phase, 'result'); assert.equal(c.rules.clockRunning, false); assert.equal(c.rules.playClock, 25);
    assert.equal(c.rules.down, before.down); assert.equal(c.rules.spot, before.spot); assert.deepEqual(c.rules.score, before.score);
    c.advance(); c.update(.1, still); close(c.rules.clock, before.clock);
  }
});

test('CPU charges a real timeout to stop a late deficit from running out and cannot repeat while the clock is stopped', () => {
  const c = make(), r = c.rules; r.quarter = 4; r.clock = 25; r.score.home = 7;
  c.tactic('kneel'); const frozen = r.clock; c.update(.1, still);
  assert.deepEqual(r.timeouts, { home: 3, away: 2 }); assert.equal(r.clockRunning, false);
  c.update(.1, still); assert.equal(r.timeouts.away, 2); close(r.clock, frozen - .1);
});

test('CPU preserves an urgent offensive drive with a charged timeout before the next snap', () => {
  const c = make(); cpuBall(c); const r = c.rules;
  r.quarter = 2; r.clock = 15; r.score.home = 7; c.clockPlay('kneel');
  const before = series(r); c.update(.1, still);
  assert.equal(r.timeouts.away, 2); assert.equal(r.clockRunning, false); assert.equal(r.playClock, 25);
  assert.equal(r.phase, 'result'); assert.equal(r.down, before.down); assert.equal(r.spot, before.spot);
  c.advance(); c.update(.4, still); assert.equal(r.phase, 'ready'); close(r.clock, before.clock - .1);
  c.update(.5, still); assert.equal(r.phase, 'live'); assert.equal(r.clockRunning, true);
});

test('kneel and spike actions finish a real snap, consume a down, and apply their different clock effects', () => {
  const kneel = make(); assert.equal(kneel.tactic('kneel'), true);
  assert.equal(kneel.play.phase, 'dead'); assert.equal(kneel.rules.result, 'QB KNEEL');
  assert.equal(kneel.rules.playNumber, 1); assert.equal(kneel.rules.down, 2); assert.equal(kneel.rules.spot, 24);
  assert.equal(kneel.rules.clock, 119); assert.equal(kneel.rules.clockRunning, true);
  close(kneel.play.outcome.spot, 24);
  const spike = make(); assert.equal(spike.tactic('spike'), true);
  assert.equal(spike.play.phase, 'dead'); assert.equal(spike.rules.result, 'SPIKE');
  assert.equal(spike.rules.playNumber, 1); assert.equal(spike.rules.down, 2); assert.equal(spike.rules.spot, 25);
  assert.equal(spike.rules.clock, 118); assert.equal(spike.rules.clockRunning, false);
  spike.update(1, still); assert.equal(spike.rules.clock, 118);
  const fourth = make(); fourth.rules.down = 4; fourth.tactic('spike');
  assert.equal(fourth.rules.result, 'TURNOVER ON DOWNS'); assert.equal(fourth.rules.possession, 'away'); assert.equal(fourth.rules.spot, 75);
  const safety = make(); safety.rules.newSeries(.5); safety.configurePlay(); safety.tactic('kneel');
  assert.equal(safety.rules.score.away, 2); assert.equal(safety.rules.kickoffPending, true);
});

test('a CPU protecting its fourth-quarter lead runs down the play clock and kneels when enough downs remain', () => {
  const c = make(); cpuBall(c); const r = c.rules;
  r.quarter = 4; r.score.away = 7; r.timeouts.home = 0; r.clock = 20; r.clockRunning = true; r.playClock = 5.5;
  c.update(.25, still); assert.equal(r.phase, 'ready'); assert.equal(r.playNumber, 0);
  c.update(.3, still); assert.equal(r.phase, 'result'); assert.equal(r.result, 'QB KNEEL');
  assert.equal(r.down, 2); assert.equal(r.spot, 24); assert.equal(r.clockRunning, true);
});
