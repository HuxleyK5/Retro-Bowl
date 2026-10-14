import { routeTolerance } from './RatingEffects.js';

export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function steer(player, target, sprint = false) {
  const dx = target.x - player.x, dy = target.y - player.y;
  const length = Math.hypot(dx, dy);
  return { x: length > 4 ? dx / length : 0, y: length > 4 ? dy / length : 0, sprint };
}

export class Routes {
  constructor(receivers) { this.receivers = receivers; this.reset(); }
  reset() {
    for (const player of this.receivers) {
      player.routeIndex = 0; player.routeTime = 0; player.routeCutTime = 0;
    }
  }
  target(player) {
    if (!player.route?.length) return player;
    player.routeIndex ??= 0;
    const tolerance = routeTolerance(player.ratings);
    while (player.routeIndex < player.route.length - 1) {
      const point = player.route[player.routeIndex];
      const start = player.routeIndex ? player.route[player.routeIndex - 1] : player.spawn;
      const sx = point.x - start.x, sy = point.y - start.y, length = Math.hypot(sx, sy);
      // A receiver who crosses the waypoint should continue the route instead
      // of circling back to a point their momentum already carried them past.
      const passed = length > 0 && ((player.x - start.x) * sx + (player.y - start.y) * sy) / length >= length &&
        Math.abs((player.x - start.x) * sy - (player.y - start.y) * sx) / length < tolerance * 1.5;
      if (distance(player, point) >= tolerance && !passed) break;
      const next = player.route[++player.routeIndex];
      const nx = next.x - point.x, ny = next.y - point.y;
      const turn = length && Math.hypot(nx, ny) ? (sx * nx + sy * ny) / (length * Math.hypot(nx, ny)) : 1;
      if (turn < .75) player.routeCutTime = .09 + (99 - player.ratings.routeRunning) * .0011;
    }
    return player.route[player.routeIndex];
  }
  update(player, dt, field) {
    const target = this.target(player), movement = steer(player, target);
    player.routeTime = (player.routeTime || 0) + dt;
    // Sell the stem with a small outside release before an inside break (and
    // vice versa). Straight go routes keep their vertical lane.
    if (player.routeIndex === 0 && player.route?.length > 1 && player.routeTime < .18 &&
        Math.abs(player.route[0].y - player.spawn.y) < 20 && player.route[0].x > player.spawn.x + 20) {
      const cut = Math.sign(player.route[1].y - player.route[0].y);
      movement.y -= cut * .3 * Math.sin(player.routeTime / .18 * Math.PI);
      const length = Math.hypot(movement.x, movement.y);
      if (length) { movement.x /= length; movement.y /= length; }
    }
    if (player.routeCutTime > 0) {
      // Plant briefly to change direction; routeRunning still controls the
      // acceleration through the cut and how quickly full pace returns.
      movement.x *= .72; movement.y *= .72;
      player.routeCutTime = Math.max(0, player.routeCutTime - dt);
    }
    if (player.routeIndex === player.route?.length - 1) {
      // Curls and outs settle at their final landmark with controlled braking.
      const remaining = distance(player, target), settleDistance = Math.max(16, player.speed * .16);
      if (remaining < settleDistance) {
        const pace = Math.min(1, remaining / settleDistance);
        movement.x *= pace; movement.y *= pace;
      }
    }
    player.update(dt, { ...movement, route: true }, field);
  }
  predict(player, seconds, field = { constrain() {} }) {
    // Predict with the same acceleration and cut behavior used by the live route.
    const predicted = Object.assign(Object.create(Object.getPrototypeOf(player)), player);
    let remaining = Math.max(0, seconds);
    while (remaining > .00001) { const dt = Math.min(1 / 60, remaining); this.update(predicted, dt, field); remaining -= dt; }
    return { x: predicted.x, y: predicted.y };
  }
}
