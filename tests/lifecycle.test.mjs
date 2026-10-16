import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerData } from '../src/data/PlayerData.js';
import { createLeague } from '../src/data/League.js';
import { createRosters } from '../src/data/Rosters.js';
import { effectiveRatings, availableRoster, applyGameWorkload, recoverTeam, developPlayer, agePlayer } from '../src/data/PlayerLifecycle.js';
import { MatchRules } from '../src/game/MatchRules.js';

const player = (patch = {}) => new PlayerData({ id: 'test-qb', name: 'Avery Quinn', number: '12', teamId: 'test', position: 'QB', ...patch });

test('every generated player has a unique permanent rating profile and position strengths', () => {
  const players = createLeague().flatMap(team => team.roster);
  assert.equal(new Set(players.map(record => JSON.stringify(record.ratings))).size, players.length);
  assert.ok(players.every(record => record.strengths.length === 2 && record.strengths.every(value => typeof value === 'string')));
});

test('health, experience, training, statistics and expired contracts survive JSON; corrupt values are rejected', () => {
  const original = player({ fatigue: 67, injury: { name: 'Ankle sprain', weeksRemaining: 3 }, xp: 42, training: { focus: 'accuracy', sessions: 4 }, seasonStats: { games: 3, starts: 2, passingYards: 640 }, careerStats: { games: 20, starts: 15, touchdowns: 18 }, contract: { yearsRemaining: 0, annualSalary: 0, guaranteed: 0 } });
  assert.deepEqual(PlayerData.fromJSON(JSON.stringify(original)), original);
  assert.equal(original.available, false);
  const oldSave = original.toJSON();
  for (const key of ['fatigue', 'injury', 'xp', 'training', 'seasonStats', 'careerStats']) delete oldSave[key];
  assert.equal(PlayerData.fromJSON(oldSave).fatigue, 0);
  for (const patch of [{ fatigue: -1 }, { fatigue: 101 }, { fatigue: 1.5 }, { xp: NaN }, { injury: { name: 'Strain', weeksRemaining: 0 } }, { injury: { name: '', weeksRemaining: 2 } }, { training: { focus: 'bad', sessions: 1 } }, { seasonStats: { games: 0, starts: 1 } }, { careerStats: { games: -2 } }, { contract: { yearsRemaining: -1, annualSalary: 1, guaranteed: 0 } }, { contract: { yearsRemaining: 0, annualSalary: 1, guaranteed: 1 } }]) {
    assert.throws(() => PlayerData.fromJSON({ ...original.toJSON(), ...patch }), TypeError);
  }
});

test('fatigue reduces live abilities without changing permanent ratings and caches repeated reads', () => {
  const record = player(), base = record.ratings;
  assert.equal(effectiveRatings(record), base);
  record.fatigue = 80;
  const tired = effectiveRatings(record);
  assert.ok(tired.speed < base.speed && tired.accuracy < base.accuracy);
  assert.equal(effectiveRatings(record), tired);
  assert.ok(Object.isFrozen(tired));
  assert.equal(record.ratings, base);
  record.setRatings({ accuracy: 99 });
  assert.notEqual(effectiveRatings(record), tired);
  record.fatigue = 0;
  assert.equal(effectiveRatings(record).accuracy, 99);
});

test('fatigue affects specialist kick execution as well as field movement', () => {
  const league = createLeague(), kicker = league[0].roster.find(p => p.position === 'K'), punter = league[0].roster.find(p => p.position === 'P');
  const rules = new MatchRules(() => .5);
  rules.specialists = { home: { kicker, punter } };
  rules.start(); rules.spot = 55;
  const chance = rules.fieldGoalChance;
  rules.beginKick('punt', { power: 1, accuracy: 0 });
  const freshLanding = rules.kick.landing;
  kicker.fatigue = punter.fatigue = 100;
  rules.start(); rules.spot = 55;
  assert.ok(rules.fieldGoalChance < chance);
  rules.beginKick('punt', { power: 1, accuracy: 0 });
  assert.ok(rules.kick.landing < freshLanding);
});

test('healthy backups replace injured or exhausted starters using real saved records and defensive slots stay distinct', () => {
  const team = createLeague()[0], starter = team.roster.find(record => record.position === 'QB');
  assert.equal(availableRoster(team).find(record => record.position === 'QB'), starter);
  starter.fatigue = 100;
  assert.notEqual(availableRoster(team).find(record => record.position === 'QB'), starter);
  starter.injury = { name: 'Strain', weeksRemaining: 2 };
  const available = availableRoster(team);
  assert.ok(!available.includes(starter));
  assert.ok(available.every(record => team.roster.includes(record)));
  assert.deepEqual(available.filter(record => record.position === 'DEF').slice(0, 8).map(record => record.specialty), ['DB', 'DB', 'DB', 'DB', 'LB', 'DL', 'DL', 'LB']);
  const arcade = createRosters().home;
  assert.deepEqual(availableRoster(arcade), arcade);
});

test('training improves a chosen skill, costs fatigue, respects position and potential, and survives reload', () => {
  const record = player({ potential: 95 });
  const before = record.ratings.accuracy;
  const result = developPlayer(record, 'accuracy');
  assert.equal(result.ok, true);
  assert.equal(record.ratings.accuracy, before + 1);
  assert.equal(record.fatigue, 16);
  assert.equal(record.training.sessions, 1);
  assert.equal(record.seasonStats.trainingGains, 1);
  assert.equal(developPlayer(record, 'blocking').ok, false);
  record.fatigue = 90;
  assert.equal(developPlayer(record).ok, false);
  record.fatigue = 0;
  record.injury = { name: 'Strain', weeksRemaining: 1 };
  assert.equal(developPlayer(record).ok, false);
  record.injury = null;
  record.potential = record.overall;
  assert.equal(developPlayer(record).ok, false);
  assert.deepEqual(PlayerData.fromJSON(record.toJSON()), record);
});

test('game workload gives starters experience, fatigue and real injuries; weekly recovery heals over time', () => {
  const record = player(), bench = player({ id: 'backup', number: '13', ratings: { accuracy: 20 } });
  bench.fatigue = 30;
  const team = { roster: [record, bench] }, reports = applyGameWorkload(team, () => 0);
  assert.equal(record.seasonStats.games, 1);
  assert.equal(bench.seasonStats.games, 0);
  assert.ok(record.xp > 0 && record.fatigue > 0);
  assert.equal(bench.fatigue, 22);
  assert.equal(reports[0].type, 'injury');
  assert.equal(record.available, false);
  const weeks = record.injury.weeksRemaining;
  recoverTeam(team, true);
  assert.equal(record.injury.weeksRemaining, weeks);
  recoverTeam(team);
  assert.equal(record.injury, null);
  assert.equal(record.available, true);
  assert.deepEqual(PlayerData.fromJSON(record.toJSON()), record);
});

test('game experience develops players and aging changes skills, clears seasonal health and preserves career history', () => {
  const young = player({ age: 21, potential: 95 });
  const initial = { ...young.ratings }, team = { roster: [young] };
  for (let week = 0; week < 4; week++) { recoverTeam(team); applyGameWorkload(team, () => .999); }
  assert.ok(Object.keys(initial).some(key => young.ratings[key] > initial[key]));
  assert.equal(young.careerStats.games, 4);
  const contract = young.contract;
  assert.equal(agePlayer(young, () => .999), false);
  assert.equal(young.age, 22);
  assert.equal(young.fatigue, 0);
  assert.equal(young.seasonStats.games, 0);
  assert.equal(young.careerStats.games, 4);
  assert.equal(young.contract, contract);
  const veteran = player({ age: 36 });
  const speed = veteran.ratings.speed;
  agePlayer(veteran, () => .999);
  assert.ok(veteran.ratings.speed < speed);
  assert.equal(agePlayer(player({ age: 44 }), () => .999), true);
});
