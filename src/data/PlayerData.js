export const RATING_LABELS = Object.freeze({
  kickPower: 'Kick Power', kickAccuracy: 'Kick Accuracy',
  throwPower: 'Throw Power', accuracy: 'Accuracy', speed: 'Speed', acceleration: 'Acceleration',
  strength: 'Strength', elusiveness: 'Elusiveness', catching: 'Catching', routeRunning: 'Route Running',
  blocking: 'Blocking', tackling: 'Tackling', coverage: 'Coverage', passRush: 'Pass Rush', awareness: 'Awareness',
});
export const POSITION_RATINGS = Object.freeze({
  K: Object.freeze(['kickPower', 'kickAccuracy', 'awareness']),
  P: Object.freeze(['kickPower', 'kickAccuracy', 'awareness']),
  QB: Object.freeze(['throwPower', 'accuracy', 'speed', 'awareness']),
  RB: Object.freeze(['speed', 'acceleration', 'strength', 'elusiveness', 'awareness']),
  WR: Object.freeze(['speed', 'acceleration', 'catching', 'routeRunning', 'awareness']),
  OL: Object.freeze(['strength', 'blocking', 'awareness']),
  DEF: Object.freeze(['speed', 'strength', 'tackling', 'coverage', 'passRush', 'awareness']),
});
const defaults = {
  QB: { speed: 55, throwPower: 80, accuracy: 86, awareness: 78, acceleration: 75 },
  RB: { speed: 80, acceleration: 85, strength: 76, elusiveness: 88, awareness: 80, catching: 80, routeRunning: 75 },
  WR: { speed: 85, acceleration: 80, catching: 88, routeRunning: 85, awareness: 78, elusiveness: 72 },
  OL: { speed: 50, strength: 82, blocking: 80, awareness: 78 },
  DEF: { speed: 45, strength: 72, tackling: 72, coverage: 72, passRush: 72, awareness: 72, acceleration: 70 },
};
export function ratingValue(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('Ratings must be finite numbers.');
  return Math.max(1, Math.min(99, Math.round(value)));
}
function validateRatings(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('Invalid ratings.');
  const result = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(RATING_LABELS, key)) throw new TypeError(`Unknown rating: ${key}`);
    result[key] = ratingValue(value);
  }
  return result;
}

export const TRAINING_FOCUSES = Object.freeze(['balanced', ...Object.keys(RATING_LABELS)]);
const emptyStats = () => ({ games: 0, starts: 0, trainingGains: 0, passingYards: 0, rushingYards: 0, receivingYards: 0, touchdowns: 0, tackles: 0, sacks: 0, interceptions: 0 });
function validateStats(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid player statistics.');
  const stats = { ...emptyStats() };
  for (const [key, count] of Object.entries(value)) {
    if (!Object.hasOwn(stats, key) || !Number.isSafeInteger(count) || count < 0) throw new TypeError('Invalid player statistics.');
    stats[key] = count;
  }
  if (stats.starts > stats.games) throw new TypeError('Starts cannot exceed games.');
  return stats;
}
function validateInjury(injury) {
  if (injury === null) return null;
  if (!injury || typeof injury !== 'object' || Array.isArray(injury) || typeof injury.name !== 'string' || !injury.name.trim() || !Number.isInteger(injury.weeksRemaining) || injury.weeksRemaining < 1 || injury.weeksRemaining > 52) throw new TypeError('Invalid player injury.');
  return { name: injury.name, weeksRemaining: injury.weeksRemaining };
}

// Persistent, JSON-safe identity and abilities. No field position, velocity, timers or DOM.
export class PlayerData {
  constructor({ schemaVersion = 1, id, name, number, position, teamId, ratings = {}, age = 25, potential = 90, contract = { yearsRemaining: 1, annualSalary: 750000, guaranteed: 0 }, specialty = position, fatigue = 0, injury = null, xp = 0, training = { focus: 'balanced', sessions: 0 }, seasonStats = {}, careerStats = {} }) {
    if (schemaVersion !== 1) throw new TypeError(`Unsupported player schema: ${schemaVersion}`);
    if (!Object.hasOwn(POSITION_RATINGS, position)) throw new TypeError(`Unknown position: ${position}`);
    for (const [key, value] of Object.entries({ id, name, teamId })) {
      if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${key} must be a nonempty string.`);
    }
    if (!/^\d{1,2}$/.test(String(number))) throw new TypeError('Jersey number must be 0–99.');
    Object.assign(this, { schemaVersion, id, name, number: String(number).padStart(2, '0'), position, teamId });
    if (!Number.isInteger(age) || age < 18 || age > 50) throw new TypeError('Invalid player age.');
    if (!Number.isInteger(potential) || potential < 1 || potential > 99) throw new TypeError('Invalid potential.');
    if (typeof specialty !== 'string' || !specialty.trim()) throw new TypeError('Invalid specialty.');
    if (!contract || !Number.isInteger(contract.yearsRemaining) || contract.yearsRemaining < 0 || contract.yearsRemaining > 7 || !Number.isFinite(contract.annualSalary) || contract.annualSalary < 0 || !Number.isFinite(contract.guaranteed) || contract.guaranteed < 0 || contract.guaranteed > contract.annualSalary * contract.yearsRemaining) throw new TypeError('Invalid contract.');
    if (!Number.isInteger(fatigue) || fatigue < 0 || fatigue > 100) throw new TypeError('Invalid player fatigue.');
    if (!Number.isSafeInteger(xp) || xp < 0 || xp > 1000000) throw new TypeError('Invalid player experience.');
    if (!training || typeof training !== 'object' || Array.isArray(training) || !TRAINING_FOCUSES.includes(training.focus) || !Number.isSafeInteger(training.sessions) || training.sessions < 0) throw new TypeError('Invalid training history.');
    Object.assign(this, { age, potential, specialty, contract: Object.freeze({ ...contract }) });
    this.ratings = Object.freeze({ ...Object.fromEntries(Object.keys(RATING_LABELS).map(key => [key, 60])), ...defaults[position], ...validateRatings(ratings) });
    Object.assign(this, { fatigue, injury: validateInjury(injury), xp, training: { focus: training.focus, sessions: training.sessions }, seasonStats: validateStats(seasonStats), careerStats: validateStats(careerStats) });
  }
  setRatings(patch) { this.ratings = Object.freeze({ ...this.ratings, ...validateRatings(patch) }); return this; }
  get overall() {
    const keys = POSITION_RATINGS[this.position];
    return Math.round(keys.reduce((total, key) => total + this.ratings[key], 0) / keys.length);
  }
  get available() { return !this.injury || this.injury.weeksRemaining <= 0; }
  get strengths() {
    return [...POSITION_RATINGS[this.position]].sort((a, b) => this.ratings[b] - this.ratings[a]).slice(0, 2).map(key => RATING_LABELS[key]);
  }
  toJSON() {
    return { schemaVersion: 1, id: this.id, name: this.name, number: this.number, position: this.position, teamId: this.teamId, ratings: { ...this.ratings }, age: this.age, potential: this.potential, specialty: this.specialty, contract: { ...this.contract }, fatigue: this.fatigue, injury: this.injury ? { ...this.injury } : null, xp: this.xp, training: { ...this.training }, seasonStats: { ...this.seasonStats }, careerStats: { ...this.careerStats } };
  }
  static fromJSON(value) { return new PlayerData(typeof value === 'string' ? JSON.parse(value) : value); }
}
