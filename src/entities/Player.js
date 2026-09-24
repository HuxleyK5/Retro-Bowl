export class Player {
  constructor({ number, role, x, y, team = 'home', speed = 155, accuracy = 0.86, catching = 0.86 }) {
    Object.assign(this, { number, role, x, y, team });
    this.spawn = { x, y };
    this.radius = 13;
    this.speed = speed;
    this.accuracy = accuracy;
    this.catching = catching;
    this.vx = 0;
    this.vy = 0;
    this.acceleration = 720;
    this.jukeTime = 0;
    this.jukeCooldown = 0;
    this.stunned = 0;
    this.stride = 0;
    this.moving = false;
    this.facing = 1;
  }
  update(dt, movement, field) {
    this.jukeTime = Math.max(0, this.jukeTime - dt);
    this.jukeCooldown = Math.max(0, this.jukeCooldown - dt);
    this.stunned = Math.max(0, this.stunned - dt);
    const speed = this.speed * (movement.sprint ? 1.5 : 1) * (this.jukeTime > 0 ? 1.5 : 1) * (this.stunned > 0 ? .15 : 1);
    const dx = movement.x * speed - this.vx;
    const dy = movement.y * speed - this.vy;
    const distance = Math.hypot(dx, dy);
    const blend = distance ? Math.min(1, this.acceleration * dt / distance) : 1;
    this.vx += dx * blend; this.vy += dy * blend;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.moving = Math.hypot(this.vx, this.vy) > 2;
    if (movement.x) this.facing = Math.sign(movement.x);
    if (this.moving) this.stride += dt * (movement.sprint ? 19 : 12);
    field.constrain(this);
  }
  juke(direction) {
    if (this.jukeCooldown > 0) return false;
    this.jukeTime = .28;
    this.jukeCooldown = 1.5;
    const length = Math.hypot(direction.x, direction.y);
    this.vx = (length ? direction.x / length : 0) * this.speed * 2;
    this.vy = (length ? direction.y / length : -1) * this.speed * 2;
    return true;
  }
  reset() {
    Object.assign(this, this.spawn);
    this.stride = 0; this.moving = false; this.facing = 1;
    this.vx = 0; this.vy = 0; this.jukeTime = 0; this.jukeCooldown = 0; this.stunned = 0;
  }
}
