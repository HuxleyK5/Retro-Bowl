/** Current ability on a half-star scale: 50 OVR earns one star; 90 earns five. */
export function playerStars(overall) {
  const rating = Number(overall);
  if (!Number.isFinite(rating)) return 0.5;
  return Math.max(0.5, Math.min(5, (Math.floor((rating - 50) / 5) + 2) / 2));
}
