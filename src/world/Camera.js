export class Camera {
  constructor(field) { this.field = field; this.x = field.width / 2; this.y = field.height / 2; this.zoom = 1; this.width = 1; this.height = 1; }
  resize(width, height) {
    this.width = width; this.height = height;
    this.zoom = Math.max(0.22, Math.min(width / 1420, height / 900));
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
  screenToWorld(point) { return { x: (point.x - this.width / 2) / this.zoom + this.x, y: (point.y - this.height / 2) / this.zoom + this.y }; }
  worldToScreen(point) { return { x: (point.x - this.x) * this.zoom + this.width / 2, y: (point.y - this.y) * this.zoom + this.height / 2 }; }
  apply(ctx) { ctx.translate(this.width / 2, this.height / 2); ctx.scale(this.zoom, this.zoom); ctx.translate(-this.x, -this.y); }
}
