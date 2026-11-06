// Critically damped motion preserves camera velocity when the target changes.
const ease = (value, target, velocity, rate, dt) => {
  const offset = value - target;
  const impulse = velocity + rate * offset;
  const decay = Math.exp(-rate * dt);
  return [target + (offset + impulse * dt) * decay, (velocity - rate * impulse * dt) * decay];
};

export class Camera {
  constructor(field) { this.field = field; this.x = field.width / 2; this.y = field.height / 2; this.zoom = 1; this.width = 1; this.height = 1; }
  get view() { return this.renderPose || this; }
  setRenderAlpha(alpha = null) {
    if (alpha === null || !this.previousPose) { this.renderPose = null; return; }
    const t = Math.max(0, Math.min(1, alpha)), previous = this.previousPose;
    const mix = key => previous[key] + (this[key] - previous[key]) * t;
    this.renderPose = { x: mix('x'), y: mix('y'), zoom: mix('zoom'), zoomX: mix('zoomX') };
    this.renderPose.horizontalZoom = this.renderPose.zoomX;
  }
  get horizontalZoom() { return this.zoomX ?? this.zoom; }
  resize(width, height) {
    if (width !== this.width || height !== this.height) this.playGeneration = null;
    this.width = width; this.height = height;
    if (this.playFramed) return;
    this.zoom = Math.max(0.22, width / (this.field.width + this.field.margin * 2), height / (this.field.height + this.field.margin * 2),
      Math.min(width / 1420, height / (this.field.height + 300)));
    this.zoomX = this.zoom;
  }
  follow(target, dt, immediate = false) {
    this.zoomX = this.zoom;
    const halfW = this.width / this.zoom / 2;
    const halfH = this.height / this.zoom / 2;
    const bound = (value, half, size) => half * 2 >= size + this.field.margin * 2 ? size / 2 : Math.max(half - this.field.margin, Math.min(size + this.field.margin - half, value));
    const x = bound(target.x + 130, halfW, this.field.width);
    const y = bound(target.y, halfH, this.field.height);
    const blend = immediate ? 1 : 1 - Math.exp(-7 * dt);
    this.x += (x - this.x) * blend; this.y += (y - this.y) * blend;
  }
  followPlay(play, dt, immediate = false) {
    if (dt > 0) this.previousPose = { x: this.x, y: this.y, zoom: this.zoom, zoomX: this.horizontalZoom };
    const fresh = this.playGeneration !== play.generation;
    this.playGeneration = play.generation;
    const ballLive = ['flight', 'loose'].includes(play.ball.mode);
    const focus = ballLive ? play.ball : play.carrier || play.controlled || play.qb;
    const closeWidth = this.width < 600 ? 480 : 680;
    const sidelineZoom = this.height / (this.field.height + 120);
    const closeZoom = this.width / closeWidth;
    // Frame the line of scrimmage with both sidelines visible. Widen for deep routes.
    if (fresh) this.playZoom = closeZoom;
    let x = play.lineOfScrimmage + 70;
    let y = this.field.height / 2;
    let desiredZoom = closeZoom;
    if (play.phase !== 'presnap') {
      const passing = ['passing', 'flight'].includes(play.phase) && !play.isKickoff;
      const points = passing ? [play.qb, ...play.receivers, focus] : [focus];
      const minX = Math.min(...points.map(p => p.x));
      const maxX = Math.max(...points.map(p => p.x));
      const depth = Math.max(0, maxX - play.lineOfScrimmage);
      const viewWidth = Math.max(closeWidth + Math.min(depth, 600) * .65, maxX - minX + 240);
      desiredZoom = Math.min(closeZoom, this.width / viewWidth);
      if (passing) x = Math.max(play.lineOfScrimmage + 70, (minX + maxX) / 2 + 50);
      else {
        // Keep the current shot through catches and handoffs. Pan only when
        // the runner reaches the edges of a comfortable tracking area.
        const half = this.width / this.horizontalZoom / 2;
        const left = this.x - half * .5, right = this.x + half * .4;
        x = focus.x < left ? focus.x + half * .5 : focus.x > right ? focus.x - half * .4 : this.x;
        if (play.phase === 'dead' && !ballLive) x = this.x;
      }
    }
    if (play.isKickoff && play.phase === 'kickoff' && play.ball.mode === 'flight') x = play.ball.target.x + 100;
    const scoringKick = ['fieldGoal', 'extraPoint'].includes(play.kickKind);
    if (scoringKick) {
      // Keep the uprights large and completely framed throughout the kick.
      x = this.field.width - 5 - (this.width < 600 ? 80 : 180);
      desiredZoom = Math.min(this.width / (this.width < 600 ? 600 : 780), this.height / (this.height < 380 ? 620 : 460));
      // Reserve the lower screen for the timing meter, even on short phones.
      const goalTop = this.field.height / 2 - 274;
      y = goalTop + this.height * .42 / desiredZoom;
    }
    const fitWidth = this.width / (this.field.width + this.field.margin * 2);
    const fitHeight = this.height / (this.field.height + this.field.margin * 2);
    const floor = scoringKick ? Math.max(fitWidth, fitHeight) : fitWidth;
    // Hold the widest view through the whistle so a catch cannot cause a zoom jump.
    this.playZoom = scoringKick ? Math.max(floor, desiredZoom) : Math.min(this.playZoom ?? closeZoom, Math.max(floor, desiredZoom));
    // New downs change the destination, never the current position or zoom.
    const snap = immediate || !this.playFramed;
    const targetZoomX = Math.max(floor, this.playZoom);
    // One scale for both axes keeps the field and yard numbers in proportion.
    const targetZoom = scoringKick ? targetZoomX : Math.min(targetZoomX, sidelineZoom);
    if (snap) {
      this.zoom = targetZoom; this.zoomX = targetZoom; this.zoomVelocity = 0;
    } else {
      [this.zoom, this.zoomVelocity] = ease(this.zoom, targetZoom, this.zoomVelocity || 0, 4.5, dt);
      this.zoomX = this.zoom;
    }
    const bound = (value, half, size) => half * 2 >= size + this.field.margin * 2 ? size / 2
      : Math.max(half - this.field.margin, Math.min(size + this.field.margin - half, value));
    x = bound(x, this.width / this.horizontalZoom / 2, this.field.width);
    y = bound(y, this.height / this.zoom / 2, this.field.height);
    if (snap) {
      this.x = x; this.y = y; this.xVelocity = this.yVelocity = 0;
      this.previousPose = { x: this.x, y: this.y, zoom: this.zoom, zoomX: this.horizontalZoom };
    } else {
      const [nextX, nextVelocity] = ease(this.x, x, this.xVelocity || 0, 5, dt);
      const trackingSpeed = Math.abs(focus.vx || 0) * 1.15;
      const maxPan = Math.max(this.width * (scoringKick ? .95 : .4) / this.horizontalZoom, trackingSpeed);
      const travel = Math.max(-maxPan * dt, Math.min(maxPan * dt, nextX - this.x));
      this.xVelocity = Math.abs(nextX - this.x) > maxPan * dt ? Math.sign(travel) * maxPan : nextVelocity;
      this.x += travel;
      [this.y, this.yVelocity] = ease(this.y, y, this.yVelocity || 0, 5, dt);
    }
    this.playFramed = true;
  }
  screenToWorld(point) { const v = this.view; return { x: (point.x - this.width / 2) / v.horizontalZoom + v.x, y: (point.y - this.height / 2) / v.zoom + v.y }; }
  worldToScreen(point) { const v = this.view; return { x: (point.x - v.x) * v.horizontalZoom + this.width / 2, y: (point.y - v.y) * v.zoom + this.height / 2 }; }
  apply(ctx) { const v = this.view; ctx.translate(this.width / 2, this.height / 2); ctx.scale(v.horizontalZoom, v.zoom); ctx.translate(-v.x, -v.y); }
}
