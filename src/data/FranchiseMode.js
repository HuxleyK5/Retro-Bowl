import { PlayerData, POSITION_RATINGS, RATING_LABELS } from './PlayerData.js';
import { availableRoster, effectiveRatings, applyGameWorkload, recoverTeam, developPlayer, agePlayer } from './PlayerLifecycle.js';
import { createLeague, TEAMS } from './League.js';

export const SEASON_WEEKS = 12;
export const SALARY_CAP = 260000000;
export const ROSTER_LIMIT = 75;
const MIN_DEPTH = { QB: 1, RB: 1, WR: 4, OL: 5, DEF: 8, K: 1, P: 1 };
const CPU_DEPTH = { QB: 3, RB: 3, WR: 7, OL: 8, DEF: 20, K: 1, P: 1 };
const ROLES = [['QB', 'QB'], ['RB', 'RB'], ['WR', 'WR'], ['WR', 'TE'], ['OL', 'OL'], ['DEF', 'DB'], ['DEF', 'LB'], ['DEF', 'DL'], ['K', 'K'], ['P', 'P']];
const FIRST = ['Andre', 'Blake', 'Cole', 'Devin', 'Evan', 'Finn', 'Grant', 'Hayden', 'Isaac', 'Jalen', 'Kai', 'Luca', 'Miles', 'Nico', 'Owen', 'Parker', 'Reid', 'Sage', 'Theo', 'Wayne', 'Zion', 'Ari', 'Cameron', 'Drew'];
const LAST = ['Adams', 'Brooks', 'Carter', 'Dawson', 'Edwards', 'Fletcher', 'Griffin', 'Hayes', 'Irwin', 'Jensen', 'Knight', 'Lawson', 'Morrison', 'Nash', 'Owens', 'Porter', 'Quinn', 'Reed', 'Stone', 'Turner', 'Ward', 'Young', 'Zimmer', 'Wells'];
const clone = value => JSON.parse(JSON.stringify(value));
const unsigned = n => Number.isSafeInteger(n) && n >= 0;
const contract = (yearsRemaining, annualSalary) => Object.freeze({ yearsRemaining, annualSalary, guaranteed: Math.round(annualSalary * yearsRemaining * .4) });

// A seeded source makes a saved week reproducible without using wall-clock time.
function randomFor(text) {
  let seed = 2166136261;
  for (const c of text) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619) >>> 0;
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

export class FranchiseMode {
  constructor(league, teamId, snapshot = null) {
    if (!Array.isArray(league) || ![24, TEAMS.length].includes(league.length) || new Set(league.map(t => t.id)).size !== league.length || !league.every(t => TEAMS.some(club => club.id === t.id)) || !league.some(t => t.id === teamId)) throw new Error('Choose a valid franchise.');
    this.league = league;
    this.teamId = teamId;
    this.year = 1;
    this.week = 1;
    this.phase = 'draft';
    this.championId = null;
    this.history = [];
    this.log = [];
    this.deadMoney = Object.fromEntries(league.map(t => [t.id, 0]));
    this.schedule = [];
    this.freeAgents = [];
    this.prospects = [];
    this.playoffSeeds = [];
    this.trained = [];
    this.rested = false;
    this.draftOrder = [];
    this.draftCursor = 0;
    this.draftPicksRemaining = 0;
    this.serial = 0;
    if (snapshot) this._restore(snapshot);
    else {
      this._buildSchedule();
      this.freeAgents = this._generatePlayers(36, false);
      this._openDraft([this.teamId, ...league.filter(t => t.id !== this.teamId).map(t => t.id)]);
      this._log('A new franchise begins with two draft rounds. Choose your rookies before the twelve-game season.');
    }
  }

  get team() { return this.league.find(t => t.id === this.teamId); }
  get nextGame() { return this.schedule.find(g => g.week === this.week && g.homeScore === null && (g.homeId === this.teamId || g.awayId === this.teamId)) ?? null; }
  get cap() { return this._capFor(this.teamId); }
  get standings() {
    const records = this.league.map(team => ({ teamId: team.id, wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 }));
    const byId = new Map(records.map(r => [r.teamId, r]));
    for (const game of this.schedule) {
      if (game.stage !== 'regular' || game.homeScore === null) continue;
      const home = byId.get(game.homeId), away = byId.get(game.awayId);
      home.pf += game.homeScore; home.pa += game.awayScore;
      away.pf += game.awayScore; away.pa += game.homeScore;
      if (game.homeScore === game.awayScore) { home.ties++; away.ties++; }
      else { const win = game.homeScore > game.awayScore ? home : away, lose = win === home ? away : home; win.wins++; lose.losses++; }
    }
    // Winning percentage, head-to-head, point difference, points scored, then club ID.
    records.sort((a, b) => {
      const result = (b.wins + b.ties * .5) - (a.wins + a.ties * .5);
      if (result) return result;
      let head = 0;
      for (const g of this.schedule) if (g.stage === 'regular' && g.homeScore !== null && [g.homeId, g.awayId].includes(a.teamId) && [g.homeId, g.awayId].includes(b.teamId)) head += (g.homeScore - g.awayScore) * (g.homeId === a.teamId ? -1 : 1);
      return head || ((b.pf - b.pa) - (a.pf - a.pa)) || b.pf - a.pf || a.teamId.localeCompare(b.teamId);
    });
    return records.map((record, i) => ({ ...record, seed: i + 1 }));
  }

  _capFor(teamId) {
    const payroll = this.league.find(t => t.id === teamId).roster.reduce((sum, player) => sum + player.contract.annualSalary, 0);
    const deadMoney = this.deadMoney[teamId] || 0;
    const limit = SALARY_CAP + (this.year - 1) * 5000000;
    return { limit, payroll, deadMoney, space: limit - payroll - deadMoney };
  }
  _log(message) { this.log.unshift(`Year ${this.year}, ${this.phase === 'draft' ? 'draft' : this.phase === 'offseason' ? 'offseason' : `week ${this.week}`}: ${message}`); this.log = this.log.slice(0, 100); }
  _buildSchedule() {
    // Place the selected club opposite its next neighboring club in round one.
    const selected = this.league.findIndex(t => t.id === this.teamId), ids = this.league.map(t => t.id);
    const first = ids[selected], last = ids[(selected + 1) % ids.length];
    let rotation = [first, ...ids.filter(id => id !== first && id !== last), last];
    this.schedule = [];
    for (let week = 1; week <= SEASON_WEEKS; week++) {
      for (let i = 0; i < rotation.length / 2; i++) {
        const pair = [rotation[i], rotation[rotation.length - 1 - i]];
        if ((week + i) % 2 === 0) pair.reverse();
        this.schedule.push(this._fixture(week, 'regular', pair[0], pair[1], i));
      }
      rotation = [rotation[0], rotation.at(-1), ...rotation.slice(1, -1)];
    }
  }
  _fixture(week, stage, homeId, awayId, index = 0) { return { id: `y${this.year}-w${week}-${stage}-${index}`, year: this.year, week, stage, homeId, awayId, homeScore: null, awayScore: null, winnerId: null }; }

  assertReady() {
    if (this.phase === 'draft') throw new Error('Complete your draft and start the season before playing.');
    if (this.phase === 'offseason') throw new Error('Complete your offseason to start the next year.');
    return this._assertRosterReady();
  }
  _assertRosterReady() {
    if (this.cap.space < 0) throw new Error('Your payroll exceeds the salary cap. Release or trade a player before playing.');
    for (const [position, count] of Object.entries(MIN_DEPTH)) if (this.team.roster.filter(p => p.position === position && !p.injury).length < count) throw new Error(`Your club needs at least ${count} healthy ${position} players. Sign a reserve before playing.`);
    return true;
  }
  recordGame(userScore, opponentScore, gameId = this.nextGame?.id) {
    const game = this.nextGame;
    if (!game || game.id !== gameId) throw new Error('This game was already recorded or is no longer scheduled.');
    if (![userScore, opponentScore].every(score => unsigned(score) && score <= 999)) throw new Error('Game scores must be whole numbers between 0 and 999.');
    this.assertReady();
    if (game.stage !== 'regular' && userScore === opponentScore) {
      const opponentId = game.homeId === this.teamId ? game.awayId : game.homeId;
      const opponent = this.league.find(t => t.id === opponentId);
      const chance = .5 + (this._teamStrength(this.team) - this._teamStrength(opponent)) / 100;
      if (randomFor(game.id + '-overtime')() < chance) userScore += 3; else opponentScore += 3;
      game.overtime = true;
    }
    this._completeWeek({ game, homeScore: game.homeId === this.teamId ? userScore : opponentScore, awayScore: game.homeId === this.teamId ? opponentScore : userScore });
    return game;
  }
  simulateWeek() {
    if (this.phase === 'draft') throw new Error('Complete your draft and start the season before simulating games.');
    if (this.phase === 'offseason') throw new Error('Complete your offseason to start the next year.');
    if (this.nextGame) this.assertReady();
    const week = this.week;
    this._completeWeek();
    return `Week ${week} completed across the league.`;
  }
  _teamStrength(team) {
    const players = availableRoster(team);
    let sum = 0, count = 0;
    for (const [position, depth] of Object.entries(MIN_DEPTH)) {
      const group = players.filter(p => p.position === position).slice(0, depth);
      for (const p of group) { const ratings = effectiveRatings(p); sum += POSITION_RATINGS[position].reduce((s, key) => s + ratings[key], 0) / POSITION_RATINGS[position].length; count++; }
      sum += Math.max(0, depth - group.length) * 35; count += Math.max(0, depth - group.length);
    }
    return count ? sum / count : 35;
  }
  _simulate(game) {
    const random = randomFor(game.id + '-score'), home = this.league.find(t => t.id === game.homeId), away = this.league.find(t => t.id === game.awayId);
    const advantage = (this._teamStrength(home) - this._teamStrength(away)) * .45 + 1.5;
    const homeScore = Math.max(0, Math.round(20 + advantage + (random() + random() - 1) * 23));
    let awayScore = Math.max(0, Math.round(20 - advantage + (random() + random() - 1) * 23));
    if (game.stage !== 'regular' && homeScore === awayScore) awayScore += 3;
    return { homeScore, awayScore };
  }
  _completeWeek(userResult = null) {
    const games = this.schedule.filter(g => g.week === this.week && g.homeScore === null);
    if (!games.length) throw new Error('There are no games to complete this week.');
    const existingInjuries = new Map();
    for (const team of this.league) {
      for (const player of team.roster) if (player.injury) existingInjuries.set(player, { ...player.injury });
    }
    // Use kickoff condition for both simulation and participation. Recovery comes after the game.
    for (const game of games) {
      const score = userResult?.game === game ? userResult : this._simulate(game);
      game.homeScore = score.homeScore; game.awayScore = score.awayScore;
      game.winnerId = score.homeScore === score.awayScore ? null : score.homeScore > score.awayScore ? game.homeId : game.awayId;
      for (const id of [game.homeId, game.awayId]) {
        const team = this.league.find(t => t.id === id), injuries = applyGameWorkload(team, randomFor(game.id + id));
        if (id === this.teamId) for (const report of injuries) this._log(report.type === 'development' ? `${report.name} improved through game experience.` : `${report.name} suffered ${report.injury?.name || 'an injury'} (${report.injury?.weeksRemaining || 1} weeks).`);
      }
    }
    for (const team of this.league) for (const player of team.roster) player.fatigue = Math.max(0, player.fatigue - 14);
    for (const [player, injury] of existingInjuries) player.injury = injury.weeksRemaining > 1 ? { ...injury, weeksRemaining: injury.weeksRemaining - 1 } : null;
    for (const team of this.league) this._ensureDepth(team, true);
    this.trained = []; this.rested = false;
    if (this.phase === 'regular' && this.week === SEASON_WEEKS) {
      this.playoffSeeds = this.standings.slice(0, 8).map(r => r.teamId);
      this.phase = 'playoffs'; this.week++;
      this._createPlayoffRound(this.playoffSeeds, 'quarterfinal');
      this._log(this.playoffSeeds.includes(this.teamId) ? 'Your club qualified for the eight-team playoffs.' : 'Your club missed the playoffs. Simulate the bracket to reach the offseason.');
    } else if (this.phase === 'playoffs') {
      const winners = games.map(g => g.winnerId).sort((a, b) => this.playoffSeeds.indexOf(a) - this.playoffSeeds.indexOf(b));
      if (winners.length === 1) {
        this.championId = winners[0];
        const final = games[0], runnerUpId = final.homeId === this.championId ? final.awayId : final.homeId;
        const standing = this.standings.find(r => r.teamId === this.teamId);
        this.history.unshift({ year: this.year, championId: this.championId, runnerUpId, record: { wins: standing.wins, losses: standing.losses, ties: standing.ties } });
        this._log(`${this.league.find(t => t.id === this.championId).name} won the championship.`);
        this._enterOffseason();
      } else { this.week++; this._createPlayoffRound(winners, winners.length === 4 ? 'semifinal' : 'championship'); }
    } else this.week++;
  }
  _createPlayoffRound(ids, stage) {
    for (let i = 0; i < ids.length / 2; i++) this.schedule.push(this._fixture(this.week, stage, ids[i], ids[ids.length - 1 - i], i));
  }

  train(playerId, focus = 'balanced') {
    const player = this._own(playerId);
    if (this.trained.includes(playerId)) throw new Error('This player has already trained this week.');
    const result = developPlayer(player, focus);
    if (!result.ok) throw new Error(result.message || 'This player cannot train right now.');
    this.trained.push(playerId); this._log(result.message || `${player.name} completed ${focus} training.`);
    return result.message || `${player.name} completed ${focus} training.`;
  }
  rest() {
    if (this.rested) throw new Error('Your team has already used its recovery session this week.');
    recoverTeam(this.team, true); this.rested = true;
    this._log('The team used a recovery session to reduce fatigue.');
    return 'Team recovery complete. Injuries heal when a week passes.';
  }
  _own(id) { const player = this.team.roster.find(p => p.id === id); if (!player) throw new Error('Choose a player on your roster.'); return player; }
  _years(years) { if (!Number.isInteger(years) || years < 1 || years > 5) throw new Error('Choose a contract between one and five years.'); return years; }
  _salary(player, rookie = false) { return Math.round((rookie ? .75 + Math.max(0, player.overall - 55) * .06 : .75 + Math.max(0, player.overall - 55) * .19) * 1000000); }
  quoteSalary(player, rookie = false) { return this._salary(player, rookie); }
  _room(team, salary, replacing = 0) {
    if (team.roster.length >= ROSTER_LIMIT && !replacing) throw new Error(`A roster can hold at most ${ROSTER_LIMIT} players.`);
    if (this._capFor(team.id).space + replacing < salary) throw new Error('This contract would exceed the salary cap.');
  }
  _assign(team, player, deal) {
    player.teamId = team.id; player.contract = deal;
    const numbers = new Set(team.roster.map(p => Number(p.number)));
    if (numbers.has(Number(player.number))) player.number = String(Array.from({ length: 100 }, (_, i) => i).find(n => !numbers.has(n))).padStart(2, '0');
    team.roster.push(player);
  }
  sign(playerId, years = 2) {
    this._years(years);
    const player = this.freeAgents.find(p => p.id === playerId);
    if (!player) throw new Error('This free agent is no longer available.');
    const salary = this._salary(player); this._room(this.team, salary);
    this.freeAgents = this.freeAgents.filter(p => p !== player); this._assign(this.team, player, contract(years, salary));
    this._log(`Signed ${player.name} for ${years} years.`); return `${player.name} signed for $${(salary / 1000000).toFixed(2)}M per year.`;
  }
  renew(playerId, years = 2) {
    this._years(years); const player = this._own(playerId), salary = this._salary(player);
    this._room(this.team, salary, player.contract.annualSalary); player.contract = contract(years, salary);
    this._log(`Renewed ${player.name} for ${years} years.`); return `${player.name} signed a ${years}-year contract.`;
  }
  _checkDepth(team, outgoing, incoming = null) {
    const count = team.roster.filter(p => p !== outgoing && p.position === outgoing.position).length + (incoming?.position === outgoing.position ? 1 : 0);
    if (count < MIN_DEPTH[outgoing.position]) throw new Error(`Keep at least ${MIN_DEPTH[outgoing.position]} ${outgoing.position} players for a complete lineup.`);
  }
  release(playerId) {
    const player = this._own(playerId); this._checkDepth(this.team, player);
    const charge = Math.min(player.contract.guaranteed, player.contract.annualSalary);
    this.deadMoney[this.teamId] += charge;
    this.team.roster = this.team.roster.filter(p => p !== player); player.teamId = 'free-agent'; player.contract = contract(1, 0);
    this.trained = this.trained.filter(id => id !== playerId);
    this.freeAgents.push(player); this._log(`Released ${player.name}; $${(charge / 1000000).toFixed(2)}M charged to the cap.`);
    return `${player.name} released. $${(charge / 1000000).toFixed(2)}M dead money this year.`;
  }
  trade(ownId, targetTeamId, targetId) {
    const own = this._own(ownId), targetTeam = this.league.find(t => t.id === targetTeamId);
    if (!targetTeam || targetTeam === this.team) throw new Error('Choose another club to trade with.');
    const target = targetTeam.roster.find(p => p.id === targetId);
    if (!target) throw new Error('Choose an available player from that club.');
    this._checkDepth(this.team, own, target); this._checkDepth(targetTeam, target, own);
    this._room(this.team, target.contract.annualSalary, own.contract.annualSalary);
    this._room(targetTeam, own.contract.annualSalary, target.contract.annualSalary);
    const value = p => p.overall + Math.max(0, p.potential - p.overall) * .35 + Math.max(0, 29 - p.age) * .6 - (p.injury ? 7 : 0) - p.contract.annualSalary / 5000000;
    if (value(own) + 3 < value(target)) throw new Error('The other club declined. Offer a player with comparable value.');
    this.team.roster = this.team.roster.filter(p => p !== own); targetTeam.roster = targetTeam.roster.filter(p => p !== target);
    this.trained = this.trained.filter(id => id !== ownId);
    this._assign(this.team, target, target.contract); this._assign(targetTeam, own, own.contract);
    this._log(`Traded ${own.name} to ${targetTeam.name} for ${target.name}.`); return `Trade accepted: ${target.name} joins your club.`;
  }

  _generatePlayers(count, rookie, forcedPosition = null) {
    const result = [];
    for (let i = 0; i < count; i++) {
      const serial = this.serial++, random = randomFor(`${this.year}-${serial}-${rookie}`), [position, specialty] = forcedPosition ? [forcedPosition, forcedPosition === 'DEF' ? 'DB' : forcedPosition] : ROLES[serial % ROLES.length];
      const base = rookie ? 58 + Math.floor(random() * 22) : 61 + Math.floor(random() * 24), ratings = {};
      for (const key of Object.keys(RATING_LABELS)) ratings[key] = Math.max(30, Math.min(95, base - 12 + Math.floor(random() * 24)));
      if (position === 'OL') ratings.speed = 42 + Math.floor(random() * 15);
      if (position === 'DEF') ratings.speed = 40 + Math.floor(random() * 20);
      const player = new PlayerData({ id: `pool-y${this.year}-${serial}`, teamId: rookie ? 'draft' : 'free-agent', name: `${FIRST[serial % FIRST.length]} ${LAST[Math.floor(serial / FIRST.length) % LAST.length]}`, number: String(serial % 100), position, specialty, age: rookie ? 21 + serial % 2 : 24 + serial % 9, potential: 99, ratings, contract: contract(1, 0) });
      player.potential = Math.min(99, player.overall + (rookie ? 8 + serial % 13 : serial % 8)); result.push(player);
    }
    return result;
  }
  _enterOffseason() {
    this.phase = 'offseason'; this.week = 16; this.trained = []; this.rested = false;
    this.deadMoney = Object.fromEntries(this.league.map(t => [t.id, 0]));
    // Players on the open market age too; newly expired players are aged below once.
    this.freeAgents = this.freeAgents.filter(player => !agePlayer(player, randomFor(`${this.year}-${player.id}-market-aging`)));
    const expiredByTeam = new Map();
    let departed = 0, retired = 0;
    for (const team of this.league) {
      const retained = [];
      for (const player of team.roster) {
        if (agePlayer(player, randomFor(`${this.year}-${player.id}-aging`))) { if (team.id === this.teamId) retired++; continue; }
        const years = player.contract.yearsRemaining - 1;
        if (years <= 0) {
          player.teamId = 'free-agent'; player.contract = contract(1, 0); this.freeAgents.push(player);
          if (!expiredByTeam.has(team.id)) expiredByTeam.set(team.id, []);
          expiredByTeam.get(team.id).push(player);
          if (team.id === this.teamId) departed++;
        }
        else { player.contract = contract(years, player.contract.annualSalary); retained.push(player); }
      }
      team.roster = retained;
    }
    // CPU clubs retain useful veterans before shopping the market for remaining needs.
    for (const team of this.league) if (team.id !== this.teamId) {
      for (const player of [...(expiredByTeam.get(team.id) || [])].sort((a, b) => b.overall - a.overall)) {
        const salary = this._salary(player), count = team.roster.filter(p => p.position === player.position).length;
        if (count < CPU_DEPTH[player.position] && player.overall >= 58 && this._capFor(team.id).space >= salary + 8000000) {
          this.freeAgents = this.freeAgents.filter(p => p !== player); this._assign(team, player, contract(2, salary));
        }
      }
    }
    // Keep the user's expired players available, then the best remaining market options.
    const userExpired = new Set((expiredByTeam.get(this.teamId) || []).map(p => p.id));
    this.freeAgents.sort((a, b) => Number(userExpired.has(b.id)) - Number(userExpired.has(a.id)) || b.overall - a.overall);
    this.freeAgents = this.freeAgents.slice(0, 400);
    this.freeAgents.push(...this._generatePlayers(this.league.length * 3, false));
    this._openDraft(this.standings.map(r => r.teamId).reverse());
    this._log(`Offseason opened: ${departed} contracts expired; ${retired} players retired. Two draft rounds are available.`);
  }
  _openDraft(order) {
    this.prospects = this._generatePlayers(this.league.length * 3, true);
    this.draftOrder = order; this.draftCursor = 0; this.draftPicksRemaining = 2;
    this._cpuDraftUntilUser();
  }
  _draftTo(team, player) {
    const salary = this._salary(player, true); this._room(team, salary);
    this.prospects = this.prospects.filter(p => p !== player); this._assign(team, player, contract(3, salary)); this.draftCursor++;
  }
  _cpuDraftUntilUser() {
    while (this.draftCursor < this.draftOrder.length * 2 && this.draftOrder[this.draftCursor % this.draftOrder.length] !== this.teamId) {
      const team = this.league.find(t => t.id === this.draftOrder[this.draftCursor % this.draftOrder.length]);
      const candidates = [...this.prospects].sort((a, b) => b.potential + b.overall - a.potential - a.overall);
      const player = candidates.find(p => this._capFor(team.id).space >= this._salary(p, true));
      if (player && team.roster.length < ROSTER_LIMIT) this._draftTo(team, player); else this.draftCursor++;
    }
  }
  draft(playerId) {
    if (!['draft', 'offseason'].includes(this.phase) || this.draftPicksRemaining <= 0 || this.draftCursor >= this.draftOrder.length * 2) throw new Error('Your draft picks are available before the season and during the offseason.');
    const player = this.prospects.find(p => p.id === playerId); if (!player) throw new Error('This prospect is no longer available.');
    this._draftTo(this.team, player); this.draftPicksRemaining--; this._cpuDraftUntilUser();
    this._log(`Drafted ${player.name}, ${player.specialty}, on a three-year rookie contract.`); return `${player.name} joins your club. ${this.draftPicksRemaining} picks remain.`;
  }
  _ensureDepth(team, healthy = false) {
    for (const [position, min] of Object.entries(MIN_DEPTH)) while (team.roster.filter(p => p.position === position && (!healthy || !p.injury)).length < min) {
      const player = this._generatePlayers(1, false, position)[0];
      player.setRatings(Object.fromEntries(POSITION_RATINGS[position].map(key => [key, Math.min(55, player.ratings[key])])));
      // Minimum-salary depth prevents expired specialist contracts from breaking games.
      if (this._capFor(team.id).space < 750000 || team.roster.length >= ROSTER_LIMIT) {
        if (healthy) return;
        throw new Error('Clear salary-cap space and roster room for replacement players before starting a season.');
      }
      this._assign(team, player, contract(1, 750000));
      if (healthy && team.id === this.teamId) this._log(`Signed minimum-salary emergency ${position} ${player.name} to keep a healthy lineup.`);
    }
  }
  _manageCpuRosters() {
    for (const team of this.league) if (team.id !== this.teamId) {
      for (const [position, target] of Object.entries(CPU_DEPTH)) {
        const candidates = this.freeAgents.filter(p => p.position === position && !p.injury).sort((a, b) => b.overall + (29 - b.age) * .35 - a.overall - (29 - a.age) * .35);
        for (const player of candidates) {
          if (team.roster.filter(p => p.position === position).length >= target || team.roster.length >= 53) break;
          const salary = this._salary(player);
          if (this._capFor(team.id).space >= salary + 2000000) {
            this.freeAgents = this.freeAgents.filter(p => p !== player); this._assign(team, player, contract(2, salary));
          }
        }
      }
    }
  }
  advanceOffseason() {
    if (!['draft', 'offseason'].includes(this.phase)) throw new Error('Finish the championship before advancing to a new year.');
    const backup = { mode: this.toJSON(), rosters: this.league.map(t => t.roster.map(p => p.toJSON())) };
    try {
      return this._advanceOffseason();
    } catch (error) {
      this.league.splice(backup.rosters.length);
      this.league.forEach((team, i) => { team.roster = backup.rosters[i].map(p => PlayerData.fromJSON(p)); });
      this._restore(backup.mode);
      throw error;
    }
  }
  _advanceOffseason() {
    const inaugural = this.phase === 'draft';
    while (this.draftPicksRemaining > 0) {
      const player = [...this.prospects].sort((a, b) => b.potential + b.overall - a.potential - a.overall).find(p => this.cap.space >= this._salary(p, true));
      if (!player) throw new Error('Clear salary-cap space for your rookie contracts.');
      this.draft(player.id);
    }
    if (!inaugural) this._manageCpuRosters();
    for (const team of this.league) this._ensureDepth(team);
    this._assertRosterReady();
    if (this.league.length < TEAMS.length) {
      const additions = createLeague().filter(team => !this.league.some(existing => existing.id === team.id));
      this.league.push(...additions);
      for (const team of additions) this.deadMoney[team.id] = 0;
      this._log('The league expanded to all 32 NFL teams.');
    }
    if (!inaugural) this.year++;
    this.week = 1; this.phase = 'regular'; this.championId = null; this.playoffSeeds = [];
    this.prospects = []; this.draftOrder = []; this.draftCursor = 0; this.trained = []; this.rested = false;
    for (const team of this.league) { recoverTeam(team, true); }
    this._buildSchedule(); this._log('A new season begins. Every club starts with a clean record.');
    return `Year ${this.year} is ready. Your opening game is scheduled.`;
  }

  toJSON() {
    return { schemaVersion: 1, teamId: this.teamId, year: this.year, week: this.week, phase: this.phase, championId: this.championId, history: clone(this.history), log: [...this.log], deadMoney: { ...this.deadMoney }, schedule: clone(this.schedule), freeAgents: this.freeAgents.map(p => p.toJSON()), prospects: this.prospects.map(p => p.toJSON()), playoffSeeds: [...this.playoffSeeds], trained: [...this.trained], rested: this.rested, draftOrder: [...this.draftOrder], draftCursor: this.draftCursor, draftPicksRemaining: this.draftPicksRemaining, serial: this.serial };
  }
  _restore(snapshot) {
    const s = clone(snapshot), ids = new Set(this.league.map(t => t.id));
    const teamCount = this.league.length, regularGames = SEASON_WEEKS * teamCount / 2;
    if (s.schemaVersion !== 1 || s.teamId !== this.teamId || !Number.isInteger(s.year) || s.year < 1 || s.year > 1000 || !Number.isInteger(s.week) || s.week < 1 || s.week > 16 || !['draft', 'regular', 'playoffs', 'offseason'].includes(s.phase)) throw new Error('Invalid franchise season.');
    if ((s.phase === 'draft' && (s.year !== 1 || s.week !== 1)) || (s.phase === 'regular' && s.week > 12) || (s.phase === 'playoffs' && (s.week < 13 || s.week > 15)) || (s.phase === 'offseason' && s.week !== 16)) throw new Error('Invalid season phase.');
    if (!Array.isArray(s.schedule) || s.schedule.length < regularGames || s.schedule.length > regularGames + 7 || !Array.isArray(s.history) || !Array.isArray(s.log) || !s.log.every(v => typeof v === 'string') || !s.deadMoney || ![s.draftCursor, s.draftPicksRemaining, s.serial].every(unsigned) || s.draftCursor > teamCount * 2 || s.draftPicksRemaining > 2 || typeof s.rested !== 'boolean') throw new Error('Invalid franchise records.');
    const gameIds = new Set(), weeklyTeams = new Set();
    for (const g of s.schedule) {
      if (!g || typeof g.id !== 'string' || gameIds.has(g.id) || g.year !== s.year || !ids.has(g.homeId) || !ids.has(g.awayId) || g.homeId === g.awayId || !Number.isInteger(g.week) || g.week < 1 || g.week > 15 || !['regular', 'quarterfinal', 'semifinal', 'championship'].includes(g.stage)) throw new Error('Invalid schedule.');
      gameIds.add(g.id);
      const roundWeek = { quarterfinal: 13, semifinal: 14, championship: 15 };
      if ((g.stage === 'regular') !== (g.week <= 12) || g.stage !== 'regular' && roundWeek[g.stage] !== g.week) throw new Error('Invalid round.');
      for (const id of [g.homeId, g.awayId]) { const key = `${g.week}/${id}`; if (weeklyTeams.has(key)) throw new Error('Duplicate fixture.'); weeklyTeams.add(key); }
      if (g.homeScore === null ? g.awayScore !== null || g.winnerId !== null : ![g.homeScore, g.awayScore].every(v => unsigned(v) && v <= 999) || g.winnerId !== (g.homeScore === g.awayScore ? null : g.homeScore > g.awayScore ? g.homeId : g.awayId)) throw new Error('Invalid game result.');
      if (g.week < s.week && g.homeScore === null || g.week >= s.week && g.homeScore !== null) throw new Error('Invalid season progress.');
      if (g.stage !== 'regular' && g.homeScore !== null && g.homeScore === g.awayScore) throw new Error('Invalid playoff tie.');
    }
    for (let week = 1; week <= SEASON_WEEKS; week++) if (s.schedule.filter(g => g.week === week).length !== teamCount / 2) throw new Error('Incomplete schedule.');
    const beforePlayoffs = ['draft', 'regular'].includes(s.phase), drafting = ['draft', 'offseason'].includes(s.phase);
    const expectedLength = regularGames + (beforePlayoffs ? 0 : s.week === 13 ? 4 : s.week === 14 ? 6 : 7);
    if (s.schedule.length !== expectedLength) throw new Error('Incomplete playoff bracket.');
    if (!Array.isArray(s.playoffSeeds) || new Set(s.playoffSeeds).size !== s.playoffSeeds.length || !s.playoffSeeds.every(id => ids.has(id)) || (!beforePlayoffs && s.playoffSeeds.length !== 8) || !Array.isArray(s.trained) || !s.trained.every(id => this.team.roster.some(p => p.id === id)) || !Array.isArray(s.draftOrder) || !s.draftOrder.every(id => ids.has(id))) throw new Error('Invalid franchise state.');
    if (s.championId !== null && !ids.has(s.championId) || s.phase === 'offseason' && !ids.has(s.championId)) throw new Error('Invalid champion.');
    if (s.phase !== 'offseason' && s.championId !== null || !drafting && (s.draftOrder.length || s.draftCursor || s.draftPicksRemaining || s.prospects.length)) throw new Error('Invalid offseason progress.');
    if (beforePlayoffs && s.playoffSeeds.length) throw new Error('Invalid playoff seeds.');
    if (drafting) {
      if (s.draftOrder.length !== teamCount || new Set(s.draftOrder).size !== teamCount) throw new Error('Invalid draft order.');
      const userIndex = s.draftOrder.indexOf(this.teamId);
      const remaining = [userIndex, userIndex + teamCount].filter(pick => pick >= s.draftCursor).length;
      if (remaining !== s.draftPicksRemaining || s.draftCursor < teamCount * 2 && s.draftOrder[s.draftCursor % teamCount] !== this.teamId) throw new Error('Invalid draft progress.');
      if (s.phase === 'draft' && (userIndex !== 0 || s.history.length)) throw new Error('Invalid opening draft.');
    }
    let eligible = s.playoffSeeds;
    for (const stage of ['quarterfinal', 'semifinal', 'championship']) {
      const games = s.schedule.filter(g => g.stage === stage);
      if (!games.length) break;
      if (games.length !== eligible.length / 2) throw new Error('Invalid playoff bracket.');
      for (let i = 0; i < eligible.length / 2; i++) if (!games.some(g => g.homeId === eligible[i] && g.awayId === eligible[eligible.length - 1 - i])) throw new Error('Invalid playoff matchup.');
      eligible = games.filter(g => g.winnerId).map(g => g.winnerId).sort((a, b) => s.playoffSeeds.indexOf(a) - s.playoffSeeds.indexOf(b));
    }
    if (s.phase === 'offseason' && eligible[0] !== s.championId) throw new Error('Invalid championship result.');
    if (!s.history.every(h => unsigned(h.year) && h.year > 0 && ids.has(h.championId) && ids.has(h.runnerUpId) && h.championId !== h.runnerUpId && h.record && [h.record.wins, h.record.losses, h.record.ties].every(unsigned))) throw new Error('Invalid championship history.');
    for (const id of ids) if (!unsigned(s.deadMoney[id])) throw new Error('Invalid salary cap.');
    const pool = new Set(this.league.flatMap(t => t.roster.map(p => p.id)));
    const restorePool = (records, owner) => {
      if (!Array.isArray(records) || records.length > 1000) throw new Error('Invalid player market.');
      return records.map(record => { const player = PlayerData.fromJSON(record); if (pool.has(player.id) || player.teamId !== owner) throw new Error('Duplicate market player.'); pool.add(player.id); return player; });
    };
    s.freeAgents = restorePool(s.freeAgents, 'free-agent'); s.prospects = restorePool(s.prospects, 'draft');
    for (const key of ['teamId', 'year', 'week', 'phase', 'championId', 'history', 'log', 'deadMoney', 'schedule', 'freeAgents', 'prospects', 'playoffSeeds', 'trained', 'rested', 'draftOrder', 'draftCursor', 'draftPicksRemaining', 'serial']) this[key] = s[key];
    if (!beforePlayoffs && this.playoffSeeds.some((id, index) => id !== this.standings[index].teamId)) throw new Error('Invalid playoff qualification.');
  }
}
