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
    while (player.routeIndex < player.route.length - 1 && distance(player, player.route[player.routeIndex]) < 15) player.routeIndex++;
    return player.route[player.routeIndex];
  }
  update(player, dt, field) { player.update(dt, steer(player, this.target(player)), field); }
  predict(player, seconds) {
    let point = { x: player.x, y: player.y };
    let remaining = player.speed * seconds;
    for (let i = player.routeIndex; i < player.route.length; i++) {
      const target = player.route[i]; const length = distance(point, target);
      if (length > remaining) return { x: point.x + (target.x - point.x) * remaining / length, y: point.y + (target.y - point.y) * remaining / length };
      remaining -= length; point = { ...target };
    }
    return point;
  }
}
