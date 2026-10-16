import test from 'node:test';
import assert from 'node:assert/strict';
import { createLeague } from '../src/data/League.js';
import { FranchiseMode, SALARY_CAP } from '../src/data/FranchiseMode.js';
import { saveFranchise, loadFranchise } from '../src/data/Franchise.js';
import { availableRoster } from '../src/data/PlayerLifecycle.js';

const create = (id = 'cgl-08') => new FranchiseMode(createLeague(), id);
const memory = () => ({ value: null, getItem() { return this.value; }, setItem(key, value) { this.value = value; } });
const finishSeason = mode => { while (mode.phase !== 'offseason') mode.simulateWeek(); };

test('a season schedules 12 different opponents per club and records the entire league once', () => {
  const mode = create();
  assert.equal(mode.schedule.length, 144);
  assert.equal(mode.nextGame.awayId, 'cgl-09');
  for (let week = 1; week <= 12; week++) {
    const games = mode.schedule.filter(g => g.week === week);
    assert.equal(games.length, 12);
    assert.equal(new Set(games.flatMap(g => [g.homeId, g.awayId])).size, 24);
  }
  for (const team of mode.league) {
    const games = mode.schedule.filter(g => g.homeId === team.id || g.awayId === team.id);
    assert.equal(new Set(games.map(g => g.homeId === team.id ? g.awayId : g.homeId)).size, 12);
  }
  const opening = mode.nextGame, result = mode.recordGame(35, 7, opening.id);
  assert.equal(result.homeScore, 35);
  assert.equal(mode.week, 2);
  assert.equal(mode.schedule.filter(g => g.homeScore !== null).length, 12);
  const own = mode.standings.find(r => r.teamId === mode.teamId);
  assert.deepEqual([own.wins, own.losses, own.pf, own.pa], [1, 0, 35, 7]);
  const snapshot = mode.toJSON();
  assert.throws(() => mode.recordGame(35, 7, opening.id), /already recorded/);
  assert.deepEqual(mode.toJSON(), snapshot);
  assert.throws(() => mode.recordGame(-1, 7), /whole numbers/);
});

test('user scores map to scheduled away clubs and ties count in both standings', () => {
  const mode = create();
  mode.recordGame(10, 10, mode.nextGame.id);
  while (mode.nextGame.homeId === mode.teamId) mode.simulateWeek();
  const awayGame = mode.nextGame;
  mode.recordGame(28, 3, awayGame.id);
  assert.equal(awayGame.awayScore, 28);
  assert.equal(awayGame.homeScore, 3);
  const own = mode.standings.find(r => r.teamId === mode.teamId);
  assert.equal(own.ties, 1);
  assert.equal(own.wins + own.losses + own.ties, mode.week - 1);
});

test('eight teams reach a seeded elimination bracket and a champion is preserved in history', () => {
  const mode = create();
  for (let i = 0; i < 12; i++) mode.recordGame(70, 0, mode.nextGame.id);
  assert.equal(mode.phase, 'playoffs');
  assert.equal(mode.week, 13);
  assert.equal(mode.playoffSeeds.length, 8);
  assert.equal(mode.playoffSeeds[0], mode.teamId);
  assert.equal(mode.schedule.filter(g => g.stage === 'quarterfinal').length, 4);
  const quarter = mode.nextGame;
  assert.equal(quarter.awayId, mode.playoffSeeds[7]);
  const overtime = mode.recordGame(21, 21, quarter.id);
  assert.equal(overtime.overtime, true);
  assert.ok(overtime.winnerId);
  assert.equal(Math.abs(overtime.homeScore - overtime.awayScore), 3);
  while (mode.phase !== 'offseason') {
    if (mode.nextGame) mode.recordGame(70, 0, mode.nextGame.id); else mode.simulateWeek();
  }
  assert.equal(mode.schedule.length, 151);
  assert.equal(mode.schedule.filter(g => g.stage === 'semifinal').length, 2);
  assert.equal(mode.schedule.filter(g => g.stage === 'championship').length, 1);
  const final = mode.schedule.find(g => g.stage === 'championship');
  assert.equal(mode.championId, final.winnerId);
  assert.equal(mode.history.length, 1);
  assert.equal(mode.history[0].championId, final.winnerId);
  assert.deepEqual(mode.history[0].record, { wins: 12, losses: 0, ties: 0 });
  assert.throws(() => mode.simulateWeek(), /offseason/);
});

test('eliminated clubs can advance the playoffs while their injured roster recovers', () => {
  const mode = create();
  for (let week = 1; week <= 12; week++) mode.recordGame(0, 35, mode.nextGame.id);
  assert.equal(mode.phase, 'playoffs');
  assert.equal(mode.nextGame, null);
  const kicker = mode.team.roster.find(p => p.position === 'K');
  kicker.injury = { name: 'Ankle sprain', weeksRemaining: 2 };
  mode.simulateWeek();
  assert.equal(mode.week, 14);
  assert.equal(kicker.injury.weeksRemaining, 1);
});

test('training, recovery and injury weeks affect the actual persistent players', () => {
  const mode = create(), player = mode.team.roster.find(p => p.position === 'QB');
  const overall = player.overall, fatigue = player.fatigue;
  mode.train(player.id);
  assert.ok(player.overall >= overall);
  assert.equal(player.fatigue, fatigue + 16);
  assert.throws(() => mode.train(player.id), /already trained/);
  mode.rest();
  assert.equal(player.fatigue, 0);
  assert.throws(() => mode.rest(), /already used/);
  player.injury = { name: 'Ankle sprain', weeksRemaining: 2 };
  const games = player.careerStats.games;
  mode.simulateWeek();
  assert.equal(player.injury.weeksRemaining, 1);
  assert.equal(player.careerStats.games, games, 'injured-at-kickoff players do not receive a game');
  mode.simulateWeek();
  assert.equal(player.injury, null);
  assert.equal(player.careerStats.games, games);
  assert.equal(mode.trained.length, 0);
  const injuredKicker = mode.team.roster.find(p => p.position === 'K');
  injuredKicker.injury = { name: 'Ankle sprain', weeksRemaining: 2 };
  assert.throws(() => mode.assertReady(), /healthy K/);
});

test('fatigue-selected backups receive experience for the game they actually started', () => {
  const mode = create(), starter = mode.team.roster.find(p => p.position === 'QB');
  let backup = null;
  for (let fatigue = 15; fatigue <= 100; fatigue++) {
    starter.fatigue = fatigue;
    const before = availableRoster(mode.team).find(p => p.position === 'QB');
    starter.fatigue = Math.max(0, fatigue - 14);
    const afterRest = availableRoster(mode.team).find(p => p.position === 'QB');
    starter.fatigue = fatigue;
    if (before !== starter && afterRest === starter) { backup = before; break; }
  }
  assert.ok(backup, 'fixture reaches the fatigue threshold for a substitution');
  mode.simulateWeek();
  assert.equal(backup.careerStats.starts, 1);
  assert.equal(starter.careerStats.starts, 0, 'postgame recovery cannot retroactively award a start');
});

test('contracts, cap space, releases and trades enforce roster and club constraints', () => {
  const mode = create(), store = memory();
  assert.equal(mode.cap.limit, SALARY_CAP);
  const free = mode.freeAgents.find(p => p.position === 'QB' && p.overall < p.potential), salary = mode.quoteSalary(free);
  const space = mode.cap.space;
  mode.sign(free.id, 3);
  assert.equal(free.teamId, mode.teamId);
  assert.equal(free.contract.yearsRemaining, 3);
  assert.equal(mode.cap.space, space - salary);
  assert.equal(mode.freeAgents.includes(free), false);
  assert.throws(() => mode.sign(free.id), /no longer available/);
  mode.train(free.id);
  mode.renew(free.id, 4);
  const guarantee = Math.min(free.contract.guaranteed, free.contract.annualSalary);
  mode.release(free.id);
  assert.equal(mode.cap.deadMoney, guarantee);
  assert.equal(mode.trained.includes(free.id), false);
  assert.ok(mode.freeAgents.includes(free));
  assert.throws(() => mode.release(mode.team.roster.find(p => p.position === 'K').id), /at least 1 K/);
  assert.throws(() => mode.renew(mode.team.roster[0].id, 0), /one and five years/);
  const rival = mode.league[8], offered = mode.team.roster.find(p => p.position === 'QB'), target = rival.roster.find(p => p.position === 'QB');
  offered.setRatings({ throwPower: 99, accuracy: 99, speed: 99, awareness: 99 });
  mode.trade(offered.id, rival.id, target.id);
  assert.equal(offered.teamId, rival.id);
  assert.equal(target.teamId, mode.teamId);
  assert.ok(mode.team.roster.includes(target));
  assert.ok(rival.roster.includes(offered));
  saveFranchise(store, mode);
  assert.ok(loadFranchise(store), 'a trained then released player must not invalidate the save');
  const next = mode.freeAgents[0], before = mode.team.roster.length;
  mode.deadMoney[mode.teamId] = mode.cap.limit;
  assert.throws(() => mode.sign(next.id), /salary cap/);
  assert.equal(mode.team.roster.length, before);
});

test('offseason ages players, expires deals, drafts two rounds and resets only the new season', () => {
  const mode = create(), young = mode.team.roster.find(p => p.age === 21 && p.contract.yearsRemaining > 1);
  const expiring = mode.team.roster.find(p => p.contract.yearsRemaining === 1), age = young.age;
  finishSeason(mode);
  assert.equal(young.age, age + 1);
  assert.ok(mode.freeAgents.some(p => p.id === expiring.id));
  assert.equal(mode.team.roster.includes(expiring), false);
  assert.equal(mode.draftPicksRemaining, 2);
  const rookie = mode.prospects[0];
  mode.draft(rookie.id);
  assert.equal(rookie.teamId, mode.teamId);
  assert.equal(rookie.contract.yearsRemaining, 3);
  assert.equal(rookie.contract.annualSalary, mode.quoteSalary(rookie, true));
  assert.equal(mode.draftPicksRemaining, 1);
  assert.equal(mode.league.flatMap(t => t.roster).filter(p => p.id.startsWith('pool-y1-') && p.contract.yearsRemaining === 3).length, mode.draftCursor);
  mode.advanceOffseason();
  assert.equal(mode.year, 2);
  assert.equal(mode.week, 1);
  assert.equal(mode.phase, 'regular');
  assert.equal(mode.championId, null);
  assert.equal(mode.history.length, 1);
  assert.equal(mode.cap.limit, SALARY_CAP + 5000000);
  assert.ok(mode.standings.every(r => r.wins + r.losses + r.ties === 0));
  assert.equal(mode.schedule.length, 144);
  assert.equal(mode.assertReady(), true);
  assert.throws(() => mode.draft(rookie.id), /offseason/);
});

test('failed offseason advancement rolls back auto picks and other roster changes', () => {
  const mode = create();
  finishSeason(mode);
  mode.deadMoney[mode.teamId] = mode.cap.limit;
  const before = mode.toJSON(), rosters = mode.league.map(t => t.roster.map(p => p.toJSON()));
  assert.throws(() => mode.advanceOffseason(), /salary-cap space/);
  assert.deepEqual(mode.toJSON(), before);
  assert.deepEqual(mode.league.map(t => t.roster.map(p => p.toJSON())), rosters);
});

test('the open market ages and CPU clubs retain useful veterans between seasons', () => {
  const mode = create(), marketPlayer = mode.freeAgents[0], age = marketPlayer.age;
  marketPlayer.fatigue = 65; marketPlayer.injury = { name: 'Muscle strain', weeksRemaining: 2 };
  const cpu = mode.league[0], veteran = cpu.roster.find(p => p.position === 'QB' && p.contract.yearsRemaining === 1);
  finishSeason(mode);
  assert.equal(marketPlayer.age, age + 1);
  assert.equal(marketPlayer.fatigue, 0);
  assert.equal(marketPlayer.injury, null);
  assert.ok(cpu.roster.includes(veteran));
  assert.equal(veteran.contract.yearsRemaining, 2);
  assert.ok(veteran.contract.annualSalary > 0);
});

test('v2 saves resume season, transactions and markets; corrupted snapshots recover safely', () => {
  const mode = create(), store = memory();
  mode.sign(mode.freeAgents[0].id);
  mode.train(mode.team.roster[0].id);
  mode.recordGame(24, 13, mode.nextGame.id);
  saveFranchise(store, mode.league, mode.teamId, mode);
  const restored = loadFranchise(store);
  assert.ok(restored.mode instanceof FranchiseMode);
  assert.deepEqual(restored.mode.toJSON(), mode.toJSON());
  assert.deepEqual(restored.league, mode.league);
  const saved = store.value;
  for (const corrupt of [
    s => { s.mode.week = 13; },
    s => { s.mode.schedule[1].id = s.mode.schedule[0].id; },
    s => { s.mode.schedule[0].homeScore = -1; },
    s => { s.mode.schedule[0].winnerId = 'missing'; },
    s => { s.mode.deadMoney[s.teamId] = -1; },
    s => { s.mode.freeAgents[0] = s.rosters[0].players[0]; },
    s => { s.rosters[0].players[0].teamId = 'missing'; },
    s => { s.rosters[0].players[1] = s.rosters[0].players[0]; },
  ]) {
    const broken = JSON.parse(saved); corrupt(broken); store.value = JSON.stringify(broken);
    assert.equal(loadFranchise(store), null);
  }
  const legacy = memory(); saveFranchise(legacy, createLeague(), 'cgl-08');
  assert.equal(JSON.parse(legacy.value).version, 1);
  assert.ok(loadFranchise(legacy));
  const unexpected = JSON.parse(saved);
  unexpected.mode.league = [];
  unexpected.mode.simulateWeek = 'invalid';
  store.value = JSON.stringify(unexpected);
  const safe = loadFranchise(store);
  assert.equal(safe.mode.league, safe.league);
  safe.mode.simulateWeek();
  assert.equal(safe.mode.week, 3, 'unexpected save properties cannot overwrite the running franchise');
});

test('an offseason with every user contract expired still saves and resumes', () => {
  const mode = create(), store = memory();
  for (const player of mode.team.roster) player.contract = Object.freeze({ ...player.contract, yearsRemaining: 1, guaranteed: Math.min(player.contract.guaranteed, player.contract.annualSalary) });
  finishSeason(mode);
  assert.equal(mode.team.roster.length, 0);
  saveFranchise(store, mode);
  const resumed = loadFranchise(store).mode;
  assert.equal(resumed.phase, 'offseason');
  assert.equal(resumed.team.roster.length, 0);
  resumed.advanceOffseason();
  assert.equal(resumed.year, 2);
  assert.equal(resumed.assertReady(), true);
});

test('saved seeded simulations produce the same result and can run multiple full years', () => {
  const mode = create(), store = memory();
  mode.simulateWeek(); saveFranchise(store, mode);
  const copy = loadFranchise(store).mode;
  mode.simulateWeek(); copy.simulateWeek();
  assert.deepEqual(mode.toJSON(), copy.toJSON());
  for (let year = 1; year <= 3; year++) {
    finishSeason(mode);
    assert.equal(mode.history.length, year);
    saveFranchise(store, mode);
    assert.ok(loadFranchise(store));
    mode.advanceOffseason();
    saveFranchise(store, mode);
    assert.ok(loadFranchise(store));
    assert.ok(mode.league.every(t => t.roster.length >= 21 && t.roster.length <= 75));
    assert.ok(mode.league.filter(t => t.id !== mode.teamId).every(t => t.roster.length >= 40), 'CPU clubs keep competitive depth');
    assert.ok(mode.cap.space >= 0);
  }
  assert.equal(mode.year, 4);
});
