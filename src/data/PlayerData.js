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
  const result = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(RATING_LABELS, key)) throw new TypeError(`Unknown rating: ${key}`);
    result[key] = ratingValue(value);
  }
  return result;
}

// Persistent, JSON-safe identity and abilities. No field position, velocity, timers or DOM.
export class PlayerData {
  constructor({ schemaVersion = 1, id, name, number, position, teamId, ratings = {}, age = 25, potential = 90, contract = { yearsRemaining: 1, annualSalary: 750000, guaranteed: 0 }, specialty = position }) {
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
    if (!contract || !Number.isInteger(contract.yearsRemaining) || contract.yearsRemaining < 1 || contract.yearsRemaining > 7 || !Number.isFinite(contract.annualSalary) || contract.annualSalary < 0 || !Number.isFinite(contract.guaranteed) || contract.guaranteed < 0 || contract.guaranteed > contract.annualSalary * contract.yearsRemaining) throw new TypeError('Invalid contract.');
    Object.assign(this, { age, potential, specialty, contract: Object.freeze({ ...contract }) });
    this.ratings = Object.freeze({ ...Object.fromEntries(Object.keys(RATING_LABELS).map(key => [key, 60])), ...defaults[position], ...validateRatings(ratings) });
  }
  setRatings(patch) { this.ratings = Object.freeze({ ...this.ratings, ...validateRatings(patch) }); return this; }
  get overall() {
    const keys = POSITION_RATINGS[this.position];
    return Math.round(keys.reduce((total, key) => total + this.ratings[key], 0) / keys.length);
  }
  toJSON() {
    return { schemaVersion: 1, id: this.id, name: this.name, number: this.number, position: this.position, teamId: this.teamId, ratings: { ...this.ratings }, age: this.age, potential: this.potential, specialty: this.specialty, contract: { ...this.contract } };
  }
  static fromJSON(value) { return new PlayerData(typeof value === 'string' ? JSON.parse(value) : value); }
}
