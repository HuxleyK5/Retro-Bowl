export class GameLoop {
  constructor(update, render) {
    this.update = update;
    this.render = render;
    this.step = 1 / 60;
    this.accumulator = 0;
    this.lastTime = null;
    this.running = false;
    this.frame = this.frame.bind(this);
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = null;
    this.frameId = requestAnimationFrame(this.frame);
  }
  stop() { this.running = false; cancelAnimationFrame(this.frameId); }
  frame(time) {
    if (!this.running) return;
    const delta = this.lastTime === null ? 0 : Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;
    this.accumulator += delta;
    while (this.accumulator >= this.step) {
      this.update(this.step);
      this.accumulator -= this.step;
    }
    this.render();
    this.frameId = requestAnimationFrame(this.frame);
  }
}
