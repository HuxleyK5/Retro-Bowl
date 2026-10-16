import { PlayerData } from '../data/PlayerData.js';
import { effectiveRatings } from '../data/PlayerLifecycle.js';
import { topSpeed, acceleration, routeAcceleration, jukeDuration, jukeCooldown, SPRINT_MULTIPLIER, JUKE_MULTIPLIER } from '../football/RatingEffects.js';

export class Player {
  constructor({ number = '00', role = 'RECEIVER', x, y, team = 'home', data, ratings = {} }) {
    Object.assign(this, { number, role, x, y, team });
    this.slot = number;
    this.spawn = { x, y };
    this.radius = 13;
    const position = { QUARTERBACK: 'QB', 'RUNNING BACK': 'RB', RECEIVER: 'WR', LINEMAN: 'OL', DEFENDER: 'DEF' }[role] || 'WR';
    this.bindData(data || new PlayerData({ id: `${team}-${position}-${number}`, name: `Player ${number}`, teamId: team, number, position,
      ratings: { speed: 65, ...ratings } }));
    this.vx = 0;
    this.vy = 0;
    this.jukeTime = 0;
    this.jukeCooldown = 0;
    this.stunned = 0;
    this.stride = 0;
    this.moving = false;
    this.facing = 1;
    this.brokenTackles = 0;
  }
  bindData(data) { if (!(data instanceof PlayerData)) throw new TypeError('Player needs PlayerData.'); this.data = data; this.number = data.number; }
  get ratings() { return effectiveRatings(this.data); }
  setRatings(patch) { this.data.setRatings(patch); }
  get speed() { return topSpeed(this.ratings); }
  get acceleration() { return acceleration(this.ratings); }
  update(dt, movement, field) {
    this.jukeTime = Math.max(0, this.jukeTime - dt);
    this.jukeCooldown = Math.max(0, this.jukeCooldown - dt);
    this.stunned = Math.max(0, this.stunned - dt);
    const boost = Math.max(movement.sprint ? SPRINT_MULTIPLIER : 1, this.jukeTime > 0 ? JUKE_MULTIPLIER : 1);
    const speed = this.speed * boost * (this.stunned > 0 ? .15 : 1);
    const dx = movement.x * speed - this.vx;
    const dy = movement.y * speed - this.vy;
    const distance = Math.hypot(dx, dy);
    const turnRate = movement.route ? routeAcceleration(this.ratings) : 1;
    const blend = distance ? Math.min(1, this.acceleration * turnRate * dt / distance) : 1;
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
    this.jukeTime = jukeDuration(this.ratings);
    this.jukeCooldown = jukeCooldown(this.ratings);
    const length = Math.hypot(direction.x, direction.y);
    this.vx = (length ? direction.x / length : 0) * this.speed * JUKE_MULTIPLIER;
    this.vy = (length ? direction.y / length : -1) * this.speed * JUKE_MULTIPLIER;
    return true;
  }
  reset() {
    Object.assign(this, this.spawn);
    this.stride = 0; this.moving = false; this.facing = 1;
    this.vx = 0; this.vy = 0; this.jukeTime = 0; this.jukeCooldown = 0; this.stunned = 0; this.brokenTackles = 0;
  }
}
