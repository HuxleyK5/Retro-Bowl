const triangle = t => 1 - Math.abs((t % 2) - 1);

export class KickMeter {
  constructor(kind, previousPhase) {
    this.kind = kind; this.previousPhase = previousPhase;
    this.stage = 'power'; this.elapsed = 0; this.power = 0;
  }
  get value() { return triangle(this.elapsed * (this.stage === 'power' ? .85 : 1.15)); }
  update(dt) {
    this.elapsed += dt;
    // An unattended kick cannot freeze a game indefinitely.
    if (this.elapsed >= 5) return this.lock(true);
    return null;
  }
  lock(expired = false) {
    if (this.stage === 'power') {
      this.power = expired ? .15 : this.value;
      this.stage = 'accuracy'; this.elapsed = 0; return null;
    }
    return { power: this.power, accuracy: expired ? 1 : this.value * 2 - 1 };
  }
}

export function kickExecution(kind, ratings, distance, input) {
  const power = Math.max(0, Math.min(1, input.power));
  const accuracy = Math.max(-1, Math.min(1, input.accuracy));
  const strength = ratings?.kickPower ?? 80, skill = ratings?.kickAccuracy ?? 80;
  const range = (35 + strength * .35) * (.35 + .65 * power);
  const tolerance = Math.max(.08, .44 - distance * .003 + (skill - 70) * .002);
  return {
    good: distance <= range && Math.abs(accuracy) <= tolerance,
    yards: Math.round(20 + power * (20 + strength * .25) - Math.abs(accuracy) * 8),
    kickoffYards: 45 + power * (15 + strength * .2),
    power, accuracy, range, tolerance,
  };
}
