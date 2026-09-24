import { Player } from '../entities/Player.js';
import { Football } from '../entities/Football.js';
import { Routes, distance } from './Routes.js';
import { Defense } from './Defense.js';

const still = { x: 0, y: 0, sprint: false };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class Play {
  constructor(field, random = Math.random) {
    this.field = field; this.random = random; this.lineOfScrimmage = 900;
    this.qb = new Player({ number: '01', role: 'QUARTERBACK', x: 790, y: 533, speed: 145, accuracy: .88 });
    this.rb = new Player({ number: '22', role: 'RUNNING BACK', x: 700, y: 635, speed: 170, catching: .8 });
    const specs = [
      ['08', 185, .94, [{ x: 1150, y: 185 }, { x: 2100, y: 300 }]],
      ['81', 360, .86, [{ x: 1080, y: 360 }, { x: 1550, y: 680 }, { x: 2100, y: 680 }]],
      ['11', 790, .9, [{ x: 1200, y: 790 }, { x: 1500, y: 555 }, { x: 2100, y: 555 }]],
      ['19', 920, .82, [{ x: 1100, y: 920 }, { x: 1850, y: 920 }]],
    ];
    this.receivers = specs.map(([number, y, catching, route]) => {
      const p = new Player({ number, role: 'RECEIVER', x: 885, y, speed: 175, catching }); p.route = route; return p;
    });
    this.rb.route = [{ x: 825, y: 750 }, { x: 1100, y: 850 }, { x: 1750, y: 850 }];
    this.receivers.push(this.rb);
    this.linemen = [435, 484, 533, 582, 631].map((y, i) => new Player({ number: String(60 + i), role: 'LINEMAN', x: 900, y }));
    this.defenders = [
      ...specs.map(([, y], i) => ({ x: 1040 + i * 18, y: y - 48, assignment: i })),
      { x: 1070, y: 720, assignment: 4 },
      { x: 980, y: 465, assignment: -1 },
      { x: 980, y: 600, assignment: -1 },
      { x: 1450, y: 540, assignment: 1 },
    ].map((spec, i) => {
      const p = new Player({ number: String(24 + i), role: 'DEFENDER', ...spec, team: 'away', speed: spec.assignment < 0 ? 115 : 125, catching: .78 });
      p.assignment = spec.assignment; return p;
    });
    this.players = [this.qb, ...this.receivers, ...this.linemen, ...this.defenders];
    for (const p of this.players) {
      p.baseSpawn = { ...p.spawn };
      if (p.route) p.baseRoute = p.route.map(point => ({ ...point }));
    }
    this.routes = new Routes(this.receivers); this.defense = new Defense(); this.ball = new Football();
    this.reset();
  }
  configure(spot, possession = 'home', firstDown = Math.min(100, spot + 10)) {
    this.lineOfScrimmage = this.field.endZone + spot * this.field.yard;
    this.firstDownX = this.field.endZone + firstDown * this.field.yard;
    const offset = this.lineOfScrimmage - 900;
    for (const p of this.players) {
      p.spawn = { x: clamp(p.baseSpawn.x + offset, 20, this.field.width - 20), y: p.baseSpawn.y };
      p.uniform = possession === 'home' ? p.team : p.team === 'home' ? 'away' : 'home';
      if (p.baseRoute) p.route = p.baseRoute.map(point => ({ x: clamp(point.x + offset, 25, this.field.width - 30), y: point.y }));
    }
    this.qb.accuracy = possession === 'home' ? .88 : .78;
    this.reset();
  }
  get outcome() {
    return { type: this.result, spot: ((this.carrier?.x ?? this.ball.x) - this.field.endZone) / this.field.yard };
  }
  reset() {
    this.players.forEach(p => p.reset()); this.routes.reset(); this.ball.reset();
    this.carrier = this.qb; this.controlled = this.qb; this.phase = 'presnap'; this.elapsed = 0;
    this.result = ''; this.notice = 'SPACE TO SNAP · Attack the right end zone →'; this.hasThrown = false; this.passDistance = 0; this.catchProtection = 0;
    this.ball.attach(this.qb);
  }
  get live() { return ['passing', 'flight', 'running'].includes(this.phase); }
  get canThrow() { return this.phase === 'passing' && this.carrier === this.qb && !this.hasThrown && this.qb.x < this.lineOfScrimmage; }
  snap() {
    if (this.phase !== 'presnap') return false;
    this.phase = 'passing'; this.notice = 'Aim at a receiver + click to lead them · H to hand off'; return true;
  }
  handoff() {
    if (!this.canThrow || this.elapsed > 1.8 || distance(this.qb, this.rb) > 220) return false;
    this.carrier = this.rb; this.controlled = this.rb; this.phase = 'running'; this.ball.attach(this.rb);
    this.notice = 'HANDOFF · Run right! SHIFT sprint · J juke'; return true;
  }
  juke(direction) { return this.live && this.ball.mode === 'held' && this.carrier.juke(direction); }
  aim(point) {
    let receiver = null; let nearest = 100;
    for (const p of this.receivers) { const d = distance(p, point); if (d < nearest) { receiver = p; nearest = d; } }
    let target = { ...point };
    let duration = .6;
    for (let i = 0; i < 3; i++) {
      if (receiver) target = this.routes.predict(receiver, duration);
      duration = clamp(distance(this.qb, target) / 600, .35, 1.6);
    }
    const length = distance(this.qb, target);
    if (length > 1050) { target = { x: this.qb.x + (target.x - this.qb.x) / length * 1050, y: this.qb.y + (target.y - this.qb.y) / length * 1050 }; duration = 1.6; receiver = null; }
    return { target, duration, receiver };
  }
  throw(point) {
    if (!this.canThrow || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    const plan = this.aim(point);
    this.passDistance = distance(this.qb, plan.target);
    const pressure = this.defenders.some(d => distance(d, this.qb) < 150) ? 15 : 0;
    const moving = Math.hypot(this.qb.vx, this.qb.vy) > 30 ? 10 : 0;
    const spread = (1 - clamp(this.qb.accuracy, 0, 1)) * (20 + this.passDistance * .16) + pressure + moving;
    const angle = this.random() * Math.PI * 2;
    const error = Math.sqrt(this.random()) * spread;
    const target = { x: plan.target.x + Math.cos(angle) * error, y: plan.target.y + Math.sin(angle) * error };
    this.ball.throw(this.qb, target, plan.duration);
    this.hasThrown = true; this.carrier = null; this.phase = 'flight';
    this.notice = 'BALL IN THE AIR · Control transfers automatically on a catch'; return true;
  }
  catchChance(player, separation) {
    const contested = player.team === 'home' && this.defenders.some(d => distance(d, player) < 65);
    const difficulty = Math.max(0, separation - 12) / 50 + (contested ? .65 : 0) + Math.max(0, this.passDistance - 650) / 1500;
    return clamp(.995 - difficulty * (1.05 - clamp(player.catching, 0, 1)), .12, .995);
  }
  resolveCatch() {
    if (this.ball.x < 0 || this.ball.x > this.field.width || this.ball.y < 0 || this.ball.y > this.field.height) return false;
    const candidates = [...this.receivers, ...this.defenders]
      .map(player => ({ player, separation: distance(player, this.ball) }))
      .filter(({ player, separation }) => separation <= 45 && !this.ball.attempted.has(player) && player.y > player.radius && player.y < this.field.height - player.radius)
      .sort((a, b) => a.separation - b.separation);
    for (const { player, separation } of candidates) {
      this.ball.attempted.add(player);
      if (this.random() > this.catchChance(player, separation)) continue;
      this.carrier = player; this.controlled = player; this.ball.attach(player);
      if (player.team === 'away') this.finish('INTERCEPTION', 'Defense takes possession.');
      else { this.phase = 'running'; this.catchProtection = .25; this.notice = `CAUGHT BY #${player.number} · Run right! SHIFT sprint · J juke`; }
      return true;
    }
    return false;
  }
  finish(result, detail = '') {
    if (this.phase === 'dead') return;
    this.phase = 'dead'; this.result = result;
    const yards = this.carrier ? Math.round((this.carrier.x - this.lineOfScrimmage) / this.field.yard) : 0;
    this.notice = `${detail || `${yards >= 0 ? '+' : ''}${yards} yards on the play.`} SPACE / R for a new play`;
    this.players.forEach(p => { p.moving = false; p.vx = 0; p.vy = 0; });
  }
  update(dt, movement = still) {
    if (!this.live) return;
    this.elapsed += dt;
    this.catchProtection = Math.max(0, this.catchProtection - dt);
    if (this.ball.mode === 'held') this.controlled.update(dt, movement, this.field);
    else this.qb.update(dt, still, this.field);
    for (const p of this.receivers) if (p !== this.carrier) this.routes.update(p, dt, this.field);
    this.defense.update(this, dt);
    if (this.ball.mode === 'flight') {
      this.ball.update(dt);
      if (this.ball.elapsed / this.ball.duration > .85 && this.ball.height < 42) this.resolveCatch();
      if (this.ball.landed) { this.ball.mode = 'ground'; this.finish('INCOMPLETE', 'The pass falls incomplete.'); }
    }
    if (this.phase === 'dead') return;
    if (this.carrier) {
      const p = this.carrier;
      this.ball.attach(p);
      if (p.y <= p.radius || p.y >= this.field.height - p.radius) { this.finish('OUT OF BOUNDS'); return; }
      if (p.x >= this.field.width - this.field.endZone) { this.finish('TOUCHDOWN', 'Six points. All the way home!'); return; }
      if (p.x <= p.radius) { this.finish('SAFETY', 'Down in your own end zone.'); return; }
      if (p === this.qb && p.x >= this.lineOfScrimmage) { this.phase = 'running'; this.notice = 'QB SCRAMBLE · Forward pass no longer available'; }
      for (const defender of this.defenders) {
        const d = distance(defender, p);
        if (p.jukeTime > 0 && d < 70) { defender.stunned = .65; continue; }
        if (d < 28 && defender.stunned <= 0 && this.catchProtection <= 0) {
          this.finish(p.x < this.field.endZone ? 'SAFETY' : p === this.qb && p.x < this.lineOfScrimmage ? 'SACK' : 'TACKLED'); return;
        }
      }
    }
    if (this.elapsed >= 35) this.finish('PLAY OVER', 'Practice play time limit reached.');
  }
}
