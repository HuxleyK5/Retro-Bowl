import test from 'node:test';
import assert from 'node:assert/strict';
import { Field } from '../src/world/Field.js';
import { Play } from '../src/football/Play.js';
import { MatchController } from '../src/game/MatchController.js';

test('CPU exhibition plays both possessions and completes all four quarters without human kicks', () => {
  const match = new MatchController(new Play(new Field(), () => .4), () => .4, { cpuOnly: true });
  match.start(10);
  const phases = new Set(), possessions = new Set();
  for (let i = 0; i < 100000 && match.rules.phase !== 'final'; i++) {
    match.update(1 / 60, { x: 0, y: 0 });
    phases.add(match.rules.phase);
    assert.equal(match.humanTurn, false);
    assert.notEqual(match.rules.phase, 'kickMeter', 'CPU kicks never wait for a human meter');
    if (match.rules.phase === 'live') possessions.add(match.rules.possession);
    if (['halftime', 'quarterBreak'].includes(match.rules.phase) && match.phaseAge > 2.5) match.advance();
  }
  assert.equal(match.rules.phase, 'final');
  assert.equal(match.rules.quarter, 4);
  assert.deepEqual([...possessions].sort(), ['away', 'home']);
  for (const phase of ['ready', 'live', 'result', 'kickoff', 'return', 'extraPoint', 'kick', 'halftime', 'quarterBreak'])
    assert.ok(phases.has(phase), `${phase} advances automatically`);
});

test('ordinary matches still give the home offense human control', () => {
  const match = new MatchController(new Play(new Field()));
  match.start(60, false);
  assert.equal(match.humanTurn, true);
  for (let i = 0; i < 300; i++) match.update(1 / 60, { x: 0, y: 0 });
  assert.equal(match.rules.phase, 'ready');
  match.kick('fieldGoal');
  assert.equal(match.rules.phase, 'kickMeter');
});
