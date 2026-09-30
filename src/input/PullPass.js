import { throwRange } from '../football/RatingEffects.js';

// Screen-space pull gives the same power at every camera zoom.
export function pullTarget(qb, start, pointer) {
  if (!start) return null;
  const dx = start.x - pointer.x, dy = start.y - pointer.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 4) return null;
  const distance = Math.min(length / 180, 1) * throwRange(qb.ratings);
  return { x: qb.x + dx / length * distance, y: qb.y + dy / length * distance, manual: true };
}
