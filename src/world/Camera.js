// Critically damped motion preserves camera velocity when the target changes.
const ease = (value, target, velocity, rate, dt) => {
  const offset = value - target;
  const impulse = velocity + rate * offset;
  const decay = Math.exp(-rate * dt);
  return [target + (offset + impulse * dt) * decay, (velocity - rate * impulse * dt) * decay];
};

export class Camera {
  constructor(field) { this.field = field; this.x = field.width / 2; this.y = field.height / 2; this.zoom = 1; this.width = 1; this.height = 1; }
  resize(width, height) {
    this.width = width; this.height = height;
    if (this.playFramed) return;
    this.zoom = Math.max(0.22, width / (this.field.width + this.field.margin * 2), height / (this.field.height + this.field.margin * 2),
      Math.min(width / 1420, height / (this.field.height + 300)));
  }
  follow(target, dt, immediate = false) {
    const halfW = this.width / this.zoom / 2;
    const halfH = this.height / this.zoom / 2;
    const bound = (value, half, size) => half * 2 >= size + this.field.margin * 2 ? size / 2 : Math.max(half - this.field.margin, Math.min(size + this.field.margin - half, value));
    const x = bound(target.x + 130, halfW, this.field.width);
    const y = bound(target.y, halfH, this.field.height);
    const blend = immediate ? 1 : 1 - Math.exp(-7 * dt);
    this.x += (x - this.x) * blend; this.y += (y - this.y) * blend;
  }
  followPlay(play, dt, immediate = false) {
    const fresh = this.playGeneration !== play.generation;
    this.playGeneration = play.generation;
    const ballLive = ['flight', 'loose'].includes(play.ball.mode);
    const focus = ballLive ? play.ball : play.carrier || play.controlled || play.qb;
    const closeWidth = this.width < 600 ? 480 : 680;
    const closeZoom = this.width / closeWidth;
    // A new down opens on the pocket. The camera widens only as the routes develop.
    if (fresh) this.playZoom = closeZoom;
    let x = play.lineOfScrimmage + 70;
    let y = play.qb.spawn?.y ?? this.field.height / 2;
    let desiredZoom = closeZoom;
    if (play.phase !== 'presnap') {
      const passing = ['passing', 'flight'].includes(play.phase) && !play.isKickoff;
      const points = passing ? [play.qb, ...play.receivers, focus] : [focus];
      const minX = Math.min(...points.map(p => p.x));
      const maxX = Math.max(...points.map(p => p.x));
      const depth = Math.max(0, maxX - play.lineOfScrimmage);
      const spread = Math.min(1, depth / (this.field.yard * 18));
      const minY = Math.min(...points.map(p => p.y));
      const maxY = Math.max(...points.map(p => p.y));
      const viewWidth = Math.max(closeWidth + Math.min(depth, 600) * .65, maxX - minX + 240);
      const closeHeight = this.height / closeZoom;
      const viewHeight = closeHeight + Math.max(0, maxY - minY + 180 - closeHeight) * spread;
      desiredZoom = Math.min(closeZoom, this.width / viewWidth, this.height / viewHeight);
      x = passing ? (minX + maxX) / 2 + 50 : focus.x + 110;
      y += ((minY + maxY) / 2 - y) * (passing ? spread : 1);
    }
    const floor = Math.max(this.width / (this.field.width + this.field.margin * 2),
      this.height / (this.field.height + this.field.margin * 2));
    // Hold the widest view through the whistle so a catch cannot cause a zoom jump.
    this.playZoom = Math.min(this.playZoom ?? closeZoom, Math.max(floor, desiredZoom));
    // New downs change the destination, never the current position or zoom.
    const snap = immediate || !this.playFramed;
    const targetZoom = Math.max(floor, this.playZoom);
    if (snap) { this.zoom = targetZoom; this.zoomVelocity = 0; }
    else [this.zoom, this.zoomVelocity] = ease(this.zoom, targetZoom, this.zoomVelocity || 0, 4.5, dt);
    const bound = (value, half, size) => half * 2 >= size + this.field.margin * 2 ? size / 2
      : Math.max(half - this.field.margin, Math.min(size + this.field.margin - half, value));
    x = bound(x, this.width / this.zoom / 2, this.field.width);
    y = bound(y, this.height / this.zoom / 2, this.field.height);
    if (snap) {
      this.x = x; this.y = y; this.xVelocity = this.yVelocity = 0;
    } else {
      [this.x, this.xVelocity] = ease(this.x, x, this.xVelocity || 0, 7, dt);
      [this.y, this.yVelocity] = ease(this.y, y, this.yVelocity || 0, 7, dt);
    }
    this.playFramed = true;
  }
  screenToWorld(point) { return { x: (point.x - this.width / 2) / this.zoom + this.x, y: (point.y - this.height / 2) / this.zoom + this.y }; }
  worldToScreen(point) { return { x: (point.x - this.x) * this.zoom + this.width / 2, y: (point.y - this.y) * this.zoom + this.height / 2 }; }
  apply(ctx) { ctx.translate(this.width / 2, this.height / 2); ctx.scale(this.zoom, this.zoom); ctx.translate(-this.x, -this.y); }
}
