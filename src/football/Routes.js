import { routeTolerance } from './RatingEffects.js';

export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function steer(player, target, sprint = false) {
  const dx = target.x - player.x, dy = target.y - player.y;
  const length = Math.hypot(dx, dy);
  return { x: length > 4 ? dx / length : 0, y: length > 4 ? dy / length : 0, sprint };
}

export class Routes {
  constructor(receivers) { this.receivers = receivers; this.reset(); }
  reset() { for (const player of this.receivers) player.routeIndex = 0; }
  target(player) {
    while (player.routeIndex < player.route.length - 1 && distance(player, player.route[player.routeIndex]) < routeTolerance(player.ratings)) player.routeIndex++;
    return player.route[player.routeIndex];
  }
  update(player, dt, field) { player.update(dt, { ...steer(player, this.target(player)), route: true }, field); }
  predict(player, seconds, field = { constrain() {} }) {
    // Predict with the same acceleration and cut behavior used by the live route.
    const predicted = Object.assign(Object.create(Object.getPrototypeOf(player)), player);
    let remaining = Math.max(0, seconds);
    while (remaining > .00001) { const dt = Math.min(1 / 60, remaining); this.update(predicted, dt, field); remaining -= dt; }
    return { x: predicted.x, y: predicted.y };
  }
}
