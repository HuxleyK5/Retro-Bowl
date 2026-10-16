import { POSITION_RATINGS, RATING_LABELS, TRAINING_FOCUSES } from './PlayerData.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const effectiveCache = new WeakMap();
const rosterOf = team => Array.isArray(team) ? team : team.roster;
const roll = random => clamp(Number(random()) || 0, 0, .999999);
const physical = new Set(['speed', 'acceleration', 'strength', 'elusiveness', 'throwPower', 'kickPower', 'passRush']);

// Only derived abilities change in a game. The saved ratings remain the player's permanent skills.
export function effectiveRatings(player) {
  const fatigue = clamp(player.fatigue || 0, 0, 100), injured = !!player.injury?.weeksRemaining;
  if (fatigue <= 15 && !injured) return player.ratings;
  const saved = effectiveCache.get(player);
  if (saved?.base === player.ratings && saved.fatigue === fatigue && saved.injured === injured) return saved.ratings;
  const load = Math.max(0, fatigue - 15) / 85;
  const ratings = Object.freeze(Object.fromEntries(Object.entries(player.ratings).map(([key, value]) => [key,
    Math.max(1, Math.round(value * (1 - load * (physical.has(key) ? .22 : .13) - (injured ? .25 : 0))))
  ])));
  effectiveCache.set(player, { base: player.ratings, fatigue, injured, ratings });
  return ratings;
}

function depthValue(player) {
  const ratings = effectiveRatings(player), keys = POSITION_RATINGS[player.position];
  return keys.reduce((sum, key) => sum + ratings[key], 0) / keys.length;
}

// Defense keeps the arcade slots: four coverage backs, a linebacker, two linemen and a safety/LB.
// Returned values are the actual persistent records, so experience and edits follow the same player.
export function availableRoster(team) {
  const healthy = rosterOf(team).filter(player => player.available !== false && !player.injury?.weeksRemaining);
  if (rosterOf(team).every(player => player.specialty === player.position)) return healthy;
  const order = new Map(healthy.map((player, index) => [player, index]));
  const best = players => players.sort((a, b) => depthValue(b) - depthValue(a) || order.get(a) - order.get(b));
  const groups = new Map();
  for (const player of healthy) {
    const key = player.specialty || player.position;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(player);
  }
  for (const group of groups.values()) best(group);
  const defenders = healthy.filter(player => player.position === 'DEF');
  const selected = [];
  const take = specialty => {
    const player = groups.get(specialty)?.find(candidate => !selected.includes(candidate)) || best(defenders.filter(candidate => !selected.includes(candidate)))[0];
    if (player) selected.push(player);
  };
  for (const specialty of ['DB', 'DB', 'DB', 'DB', 'LB', 'DL', 'DL', 'LB']) take(specialty);
  const offense = [...groups.values()].flatMap(group => group.filter(player => player.position !== 'DEF'));
  return [...offense, ...selected, ...best(defenders.filter(player => !selected.includes(player)))];
}

function addStat(player, key, amount = 1) {
  player.seasonStats[key] += amount;
  player.careerStats[key] += amount;
}

function improve(player, focus = 'balanced') {
  if (player.overall >= player.potential) return [];
  const keys = POSITION_RATINGS[player.position];
  const target = focus === 'balanced'
    ? [...keys].sort((a, b) => player.ratings[a] - player.ratings[b])[0]
    : focus;
  if (!keys.includes(target) || player.ratings[target] >= Math.min(99, player.potential + 10)) return [];
  const from = player.ratings[target];
  player.setRatings({ [target]: from + 1 });
  addStat(player, 'trainingGains');
  return [{ rating: target, label: RATING_LABELS[target], from, to: from + 1 }];
}

export function developPlayer(player, focus = 'balanced') {
  if (!TRAINING_FOCUSES.includes(focus)) throw new TypeError('Unknown training focus.');
  if (focus !== 'balanced' && !POSITION_RATINGS[player.position].includes(focus)) return { ok: false, message: 'Choose a skill used by this position.', improved: [], cost: 0 };
  if (!player.available) return { ok: false, message: 'An injured player needs recovery time.', improved: [], cost: 0 };
  if (player.fatigue > 72) return { ok: false, message: 'Rest this player before another training session.', improved: [], cost: 0 };
  if (player.overall >= player.potential) return { ok: false, message: 'This player has reached their development potential.', improved: [], cost: 0 };
  const improved = improve(player, focus);
  if (!improved.length) return { ok: false, message: 'This skill has reached its development ceiling.', improved: [], cost: 0 };
  player.training.focus = focus;
  player.training.sessions++;
  player.fatigue = clamp(player.fatigue + 16, 0, 100);
  player.xp = Math.min(1000000, player.xp + 8);
  return { ok: true, message: `${player.name}: ${improved[0].label} +1.`, improved, cost: 16 };
}

export function applyGameWorkload(team, random = Math.random) {
  const lineup = availableRoster(team), starters = new Set();
  for (const [position, count] of [['QB', 1], ['RB', 1], ['WR', 4], ['OL', 5], ['DEF', 8], ['K', 1], ['P', 1]]) {
    for (const player of lineup.filter(candidate => candidate.position === position).slice(0, count)) starters.add(player);
  }
  const reports = [];
  for (const player of rosterOf(team)) {
    if (!starters.has(player)) {
      player.fatigue = Math.max(0, player.fatigue - 8);
      if (player.available) player.xp = Math.min(1000000, player.xp + 3);
      continue;
    }
    addStat(player, 'games');
    addStat(player, 'starts');
    const specialist = player.position === 'K' || player.position === 'P';
    player.fatigue = clamp(player.fatigue + (specialist ? 10 : 21 + Math.floor(roll(random) * 8)), 0, 100);
    player.xp = Math.min(1000000, player.xp + (player.age <= 25 ? 15 : 10));
    if (player.xp >= 60) {
      const improved = improve(player);
      if (improved.length) { player.xp -= 60; reports.push({ playerId: player.id, name: player.name, type: 'development', improved }); }
    }
    const injuryRisk = (specialist ? .006 : .018) + Math.max(0, player.fatigue - 25) * .0014 + Math.max(0, player.age - 30) * .002;
    if (roll(random) < injuryRisk) {
      const severity = roll(random), weeksRemaining = severity < .65 ? 1 + Math.floor(severity * 4) : severity < .93 ? 3 : 5;
      const name = severity < .4 ? 'Muscle strain' : severity < .75 ? 'Ankle sprain' : 'Shoulder injury';
      player.injury = { name, weeksRemaining };
      reports.push({ playerId: player.id, name: player.name, type: 'injury', injury: { ...player.injury } });
    }
  }
  return reports;
}

export function recoverTeam(team, rest = false) {
  const reports = [];
  for (const player of rosterOf(team)) {
    player.fatigue = Math.max(0, player.fatigue - (rest ? 28 : 14));
    if (!rest && player.injury && --player.injury.weeksRemaining <= 0) {
      reports.push({ playerId: player.id, name: player.name, type: 'recovered' });
      player.injury = null;
    }
  }
  return reports;
}

export function agePlayer(player, random = Math.random) {
  player.age = Math.min(50, player.age + 1);
  const latePeak = ['QB', 'K', 'P', 'OL'].includes(player.position), peak = latePeak ? 30 : 27;
  if (player.age <= peak && player.overall < player.potential) {
    const gains = player.age < 25 ? 3 : 2;
    for (let i = 0; i < gains; i++) improve(player);
  } else if (player.age > peak + 1) {
    const loss = player.age >= peak + 6 ? 2 : 1;
    const patch = Object.fromEntries(POSITION_RATINGS[player.position].map(key => [key, Math.max(1, player.ratings[key] - (physical.has(key) ? loss : Math.max(0, loss - 1)))]));
    player.setRatings(patch);
  }
  player.fatigue = 0;
  player.injury = null;
  for (const key of Object.keys(player.seasonStats)) player.seasonStats[key] = 0;
  const retireAt = latePeak ? 38 : 35;
  return player.age >= 45 || (player.age >= retireAt && roll(random) < Math.min(.9, .15 + (player.age - retireAt) * .16));
}
