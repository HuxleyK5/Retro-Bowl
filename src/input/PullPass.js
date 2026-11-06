import { throwRange } from '../football/RatingEffects.js';

// Screen-space pull gives the same power at every camera zoom.
export function pullTarget(qb, start, pointer, camera = null) {
  if (!start) return null;
  const dx = start.x - pointer.x, dy = start.y - pointer.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 4) return null;
  const distance = Math.min(length / 180, 1) * throwRange(qb.ratings);
  const worldX = camera ? dx / camera.horizontalZoom : dx;
  const worldY = camera ? dy / camera.zoom : dy;
  const direction = Math.hypot(worldX, worldY);
  return { x: qb.x + worldX / direction * distance, y: qb.y + worldY / direction * distance, manual: true };
}
