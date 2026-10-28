export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const SPRINT_MULTIPLIER = 1.25;
export const JUKE_MULTIPLIER = 1.35;
// Use the full speed rating so a fast receiver can pull away from slower pursuit.
export const topSpeed = r => 90 + 1.1 * r.speed;
export const acceleration = r => 340 + 2 * r.speed + 3.2 * r.acceleration;
export const throwVelocity = r => 400 + 2.5 * r.throwPower;
export const throwRange = r => 500 + 7 * r.throwPower;
export const reactionTime = r => .65 - .0045 * r.awareness;
export const pursuitLead = r => .04 + .002 * r.awareness;
export const routeAcceleration = r => .45 + .007 * r.routeRunning;
export const routeTolerance = r => 6 + (99 - r.routeRunning) * .25;
export const releaseReaction = r => (99 - r.awareness) * .0015;
export const jukeDuration = r => .12 + .0015 * r.elusiveness + .0005 * r.awareness;
export const jukeCooldown = r => 2.2 - .006 * r.elusiveness - .003 * r.awareness;

export function fumbleChance(defender, runner, { momentum = 0, sideHit = false } = {}) {
  const security = .45 * runner.awareness + .3 * runner.strength + .25 * runner.catching;
  const hit = .6 * defender.tackling + .25 * defender.strength + .15 * defender.awareness;
  return clamp(.012 + (hit - security) * .001 + momentum * .018 + (sideHit ? .025 : 0), .005, .14);
}

export function throwSpread(r, distance, moving, pressure) {
  return (1 - r.accuracy / 100) * (12 + distance * .14) +
    ((moving ? 10 : 0) + pressure * 15) * (1 - r.awareness * .007);
}
export function catchMargin(r, separation, contested, distance, defense = false) {
  const hands = defense ? r.coverage * .75 + r.awareness * .25 : r.catching;
  const skill = .2 + .0065 * hands + .0018 * r.awareness;
  const difficulty = Math.max(0, separation - 12) / 65 + (contested ? .13 : 0) + Math.max(0, distance - 650) / 3000;
  return skill - difficulty - .28;
}
export function blockDuration(blocker, defender) {
  const protection = .55 * blocker.blocking + .3 * blocker.strength + .15 * blocker.awareness;
  const rush = .5 * defender.passRush + .3 * defender.strength + .2 * defender.awareness;
  return clamp(2.2 + (protection - rush) * .035, .35, 4.5);
}
export function tackleResult(defender, runner, { juking = false, momentum = 0, brokenTackles = 0, glancing = 0, fromBehind = false } = {}) {
  const tackle = .6 * defender.tackling + .25 * defender.strength + .15 * defender.awareness;
  const evasion = .65 * runner.elusiveness + .2 * runner.awareness + .15 * runner.strength + 20;
  if (juking && evasion > tackle) return 'evaded';
  const resistance = .45 * runner.strength + .35 * runner.elusiveness + .2 * runner.awareness +
    clamp(momentum, 0, 1) * 12 + clamp(glancing, 0, 1) * 14 + (fromBehind ? 6 : 0) - brokenTackles * 16;
  return resistance > tackle + 12 ? 'broken' : 'tackled';
}
