import { PlayerData } from './PlayerData.js';

const offense = [
  ['01', 'QB', 'Eli Mercer', { throwPower: 80, accuracy: 88, speed: 55, awareness: 84 }],
  ['22', 'RB', 'Miles Reed', { speed: 80, acceleration: 86, strength: 78, elusiveness: 88, awareness: 82 }],
  ['08', 'WR', 'Jalen Brooks', { speed: 85, acceleration: 84, catching: 94, routeRunning: 90, awareness: 86 }],
  ['81', 'WR', 'Theo Grant', { speed: 83, acceleration: 80, catching: 86, routeRunning: 83, awareness: 78 }],
  ['11', 'WR', 'Noah Hayes', { speed: 84, acceleration: 82, catching: 90, routeRunning: 86, awareness: 81 }],
  ['19', 'WR', 'Leo Ward', { speed: 87, acceleration: 86, catching: 82, routeRunning: 78, awareness: 74 }],
  ...['Owen Pike', 'Finn Ellis', 'Cole Avery', 'Max Foster', 'Sam Rhodes'].map((name, i) => [String(60 + i), 'OL', name, { strength: 80 + i, blocking: 78 + i, awareness: 76 + i }]),
];
const defense = ['Drew Carter', 'Rory Blake', 'Kai Mason', 'Jude Wells', 'Alex Shaw', 'Ben Stone', 'Luke Hart', 'Tate Logan'].map((name, i) => [
  String(24 + i), 'DEF', name,
  { speed: i === 5 || i === 6 ? 30 : 40, strength: i === 5 || i === 6 ? 84 : 72, tackling: 70 + i,
    coverage: i === 5 || i === 6 ? 42 : 68 + i, passRush: i === 5 || i === 6 ? 83 : 55, awareness: 70 + i },
]);

export function createRosters() {
  return Object.fromEntries(['home', 'away'].map(teamId => [teamId, [...offense, ...defense].map(([number, position, name, ratings], index) => new PlayerData({
    id: `${teamId}-${position.toLowerCase()}-${number}`, teamId, number, position,
    name: teamId === 'home' ? name : ['Arlo', 'Nico', 'Beau', 'Dean', 'Ezra', 'Joel', 'Ryan', 'Seth', 'Troy', 'Will', 'Zane', 'Ari', 'Cal', 'Dax', 'Ian', 'Jon', 'Kit', 'Ray', 'Vic'][index] + ' ' + name.split(' ')[1],
    ratings: teamId === 'home' ? ratings : { ...ratings, awareness: Math.max(1, (ratings.awareness || 75) - 4), ...(position === 'QB' ? { accuracy: 80, throwPower: 84 } : {}) },
  }))]));
}

export function serializeRosters(rosters) {
  return JSON.stringify({ schemaVersion: 1, teams: Object.fromEntries(Object.entries(rosters).map(([id, players]) => [id, players.map(p => p.toJSON())])) });
}
export function deserializeRosters(json) {
  const value = typeof json === 'string' ? JSON.parse(json) : json;
  if (value?.schemaVersion !== 1 || !value.teams || typeof value.teams !== 'object') throw new TypeError('Invalid roster schema.');
  const ids = new Set();
  return Object.fromEntries(Object.entries(value.teams).map(([teamId, records]) => {
    if (!Array.isArray(records)) throw new TypeError('A team roster must be an array.');
    return [teamId, records.map(record => {
      const player = PlayerData.fromJSON(record);
      if (player.teamId !== teamId || ids.has(player.id)) throw new TypeError('Duplicate player ID or mismatched team.');
      ids.add(player.id); return player;
    })];
  }));
}
