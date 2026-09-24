// Ball coordinates stay on the ground plane; height only affects its drawing.
export class Football {
  constructor() { this.reset(); }
  reset() { this.mode = 'held'; this.x = 0; this.y = 0; this.height = 0; this.elapsed = 0; this.attempted = new Set(); }
  attach(player) { this.mode = 'held'; this.x = player.x + 15; this.y = player.y; this.height = 10; }
  throw(from, target, duration) {
    this.mode = 'flight'; this.origin = { x: from.x, y: from.y };
    this.target = { ...target }; this.duration = duration; this.elapsed = 0;
    this.x = from.x; this.y = from.y; this.height = 10; this.attempted.clear();
  }
  update(dt) {
    if (this.mode !== 'flight') return;
    this.elapsed = Math.min(this.duration, this.elapsed + dt);
    const t = this.elapsed / this.duration;
    this.x = this.origin.x + (this.target.x - this.origin.x) * t;
    this.y = this.origin.y + (this.target.y - this.origin.y) * t;
    this.height = 4 * 105 * t * (1 - t) + 10 * (1 - t);
  }
  get landed() { return this.mode === 'flight' && this.elapsed >= this.duration; }
}
