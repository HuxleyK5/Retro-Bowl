import { Player } from '../entities/Player.js';
import { Football } from '../entities/Football.js';
import { Routes, distance } from './Routes.js';
import { Defense } from './Defense.js';
import { getPlay } from './Playbook.js';
import { PlayExecution } from './PlayExecution.js';
import { createRosters } from '../data/Rosters.js';
import { Blocking } from './Blocking.js';
import { throwRange, throwVelocity, throwSpread, catchMargin, tackleResult, releaseReaction } from './RatingEffects.js';

const still = { x: 0, y: 0, sprint: false };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class Play {
  constructor(field, random = Math.random, rosters = createRosters()) {
    this.field = field; this.random = random; this.lineOfScrimmage = 900;
    this.rosters = rosters;
    this.qb = new Player({ number: '01', role: 'QUARTERBACK', x: 790, y: 533 });
    this.rb = new Player({ number: '22', role: 'RUNNING BACK', x: 700, y: 635 });
    const specs = [
      ['08', 185, [{ x: 1150, y: 185 }, { x: 2100, y: 300 }]],
      ['81', 360, [{ x: 1080, y: 360 }, { x: 1550, y: 680 }, { x: 2100, y: 680 }]],
      ['11', 790, [{ x: 1200, y: 790 }, { x: 1500, y: 555 }, { x: 2100, y: 555 }]],
      ['19', 920, [{ x: 1100, y: 920 }, { x: 1850, y: 920 }]],
    ];
    this.receivers = specs.map(([number, y, route]) => {
      const p = new Player({ number, role: 'RECEIVER', x: 885, y }); p.route = route; return p;
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
      const p = new Player({ number: String(24 + i), role: 'DEFENDER', ...spec, team: 'away' });
      p.assignment = spec.assignment; return p;
    });
    this.players = [this.qb, ...this.receivers, ...this.linemen, ...this.defenders];
    this.bindRoster('home');
    for (const p of this.players) {
      p.baseSpawn = { ...p.spawn };
      if (p.route) p.baseRoute = p.route.map(point => ({ ...point }));
    }
    this.routes = new Routes(this.receivers); this.defense = new Defense(); this.ball = new Football();
    this.execution = new PlayExecution(this);
    this.blocking = new Blocking();
    this.reset();
  }
  bindRoster(possession) {
    const slots = {};
    for (const player of this.players) {
      const teamId = player.team === 'home' ? possession : possession === 'home' ? 'away' : 'home';
      const position = player.data.position, key = `${teamId}-${position}`;
      const index = slots[key] || 0; slots[key] = index + 1;
      const record = this.rosters[teamId]?.filter(data => data.position === position)[index];
      if (!record) throw new Error(`Missing roster slot ${key} ${index}`);
      player.bindData(record);
    }
  }
  configure(spot, possession = 'home', firstDown = Math.min(100, spot + 10), playId = null) {
    this.bindRoster(possession);
    this.lineOfScrimmage = this.field.endZone + spot * this.field.yard;
    this.firstDownX = this.field.endZone + firstDown * this.field.yard;
    const offset = this.lineOfScrimmage - 900;
    for (const p of this.players) {
      p.spawn = { x: clamp(p.baseSpawn.x + offset, 20, this.field.width - 20), y: p.baseSpawn.y };
      p.uniform = possession === 'home' ? p.team : p.team === 'home' ? 'away' : 'home';
      if (p.baseRoute) p.route = p.baseRoute.map(point => ({ x: clamp(point.x + offset, 25, this.field.width - 30), y: point.y }));
    }
    this.call = null;
    this.receivers.forEach(p => { p.releaseDelay = 0; });
    if (playId) {
      const call = getPlay(playId);
      if (!call) throw new Error(`Unknown play: ${playId}`);
      this.execution.apply(call);
    }
    this.reset();
  }
  get outcome() {
    return { type: this.result, spot: ((this.carrier?.x ?? this.ball.x) - this.field.endZone) / this.field.yard };
  }
  reset() {
    this.players.forEach(p => p.reset()); this.routes.reset(); this.ball.reset();
    this.execution.reset();
    this.blocking.reset(); this.catchJitter = 0;
    this.carrier = this.qb; this.controlled = this.qb; this.phase = 'presnap'; this.elapsed = 0;
    this.result = ''; this.notice = 'SPACE TO SNAP · Attack the right end zone →'; this.hasThrown = false; this.passDistance = 0; this.catchProtection = 0;
    this.ball.attach(this.qb);
  }
  get live() { return ['passing', 'flight', 'running'].includes(this.phase); }
  get canThrow() { return this.phase === 'passing' && this.carrier === this.qb && !this.hasThrown && this.qb.x < this.lineOfScrimmage && this.execution.canPass; }
  snap() {
    if (this.phase !== 'presnap') return false;
    this.phase = 'passing'; this.notice = 'Aim at a receiver + click to lead them · H to hand off'; return true;
  }
  handoff() {
    if (!this.canThrow || this.elapsed > 1.8 || distance(this.qb, this.rb) > 220) return false;
    return this.giveToBack();
  }
  giveToBack() {
    this.carrier = this.rb; this.controlled = this.rb; this.phase = 'running'; this.ball.attach(this.rb);
    this.notice = 'HANDOFF · Run right! SHIFT sprint · J juke'; return true;
  }
  juke(direction) { return this.live && !this.execution.locked && this.ball.mode === 'held' && this.carrier.juke(direction); }
  aim(point) {
    let receiver = null; let nearest = 100;
    for (const p of this.receivers) { const d = distance(p, point); if (d < nearest) { receiver = p; nearest = d; } }
    let target = { ...point };
    let duration = .6;
    for (let i = 0; i < 3; i++) {
      if (receiver) {
        const reaction = (receiver.releaseDelay || 0) + releaseReaction(receiver.ratings);
        const lead = duration * (.86 + this.qb.ratings.awareness * .0014);
        target = this.routes.predict(receiver, Math.max(0, lead - Math.max(0, reaction - this.elapsed)), this.field);
      }
      duration = clamp(distance(this.qb, target) / throwVelocity(this.qb.ratings), .25, 3);
    }
    const length = distance(this.qb, target);
    const range = throwRange(this.qb.ratings);
    if (length > range) { target = { x: this.qb.x + (target.x - this.qb.x) / length * range, y: this.qb.y + (target.y - this.qb.y) / length * range }; duration = range / throwVelocity(this.qb.ratings); receiver = null; }
    return { target, duration, receiver };
  }
  throw(point) {
    if (!this.canThrow || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    const plan = this.aim(point);
    this.passDistance = distance(this.qb, plan.target);
    const pressure = this.defenders.some(d => distance(d, this.qb) < 150) ? 1 : 0;
    const moving = Math.hypot(this.qb.vx, this.qb.vy) > 30;
    const spread = throwSpread(this.qb.ratings, this.passDistance, moving, pressure);
    const angle = this.random() * Math.PI * 2;
    const error = (.85 + .15 * this.random()) * spread;
    this.catchJitter = (this.random() - .5) * .04;
    const target = { x: plan.target.x + Math.cos(angle) * error, y: plan.target.y + Math.sin(angle) * error };
    this.ball.throw(this.qb, target, plan.duration);
    this.hasThrown = true; this.carrier = null; this.phase = 'flight';
    this.notice = 'BALL IN THE AIR · Control transfers automatically on a catch'; return true;
  }
  catchMargin(player, separation) {
    const contested = player.team === 'home' && this.defenders.some(d => distance(d, player) < 65);
    return catchMargin(player.ratings, separation, contested, this.passDistance, player.team === 'away');
  }
  resolveCatch() {
    if (this.ball.x < 0 || this.ball.x > this.field.width || this.ball.y < 0 || this.ball.y > this.field.height) return false;
    const candidates = [...this.receivers, ...this.defenders]
      .map(player => ({ player, separation: distance(player, this.ball) }))
      .filter(({ player, separation }) => separation <= 45 && !this.ball.attempted.has(player) && player.y > player.radius && player.y < this.field.height - player.radius)
      .sort((a, b) => a.separation - b.separation);
    for (const { player, separation } of candidates) {
      this.ball.attempted.add(player);
      if (this.catchMargin(player, separation) + this.catchJitter < 0) continue;
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
    movement = this.execution.movement(dt, movement);
    if (this.ball.mode === 'held') this.controlled.update(dt, movement, this.field);
    else this.qb.update(dt, still, this.field);
    for (const p of this.receivers) if (p !== this.carrier && !this.execution.receiverMovement(p, dt)) this.routes.update(p, dt, this.field);
    this.execution.updateBlockers(dt);
    this.defense.update(this, dt);
    if (this.ball.mode === 'flight') {
      this.ball.update(dt);
      if (this.ball.elapsed / this.ball.duration > .97 && this.ball.height < 16) this.resolveCatch();
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
        if (p.jukeTime > 0 && d < 35 + p.ratings.elusiveness * .4 && defender.stunned <= 0 &&
            tackleResult(defender.ratings, p.ratings, { juking: true }) === 'evaded') {
          defender.stunned = .3 + p.ratings.elusiveness * .003; continue;
        }
        if (d < 20 + defender.ratings.tackling * .12 && defender.stunned <= 0 && this.catchProtection <= 0) {
          const contact = tackleResult(defender.ratings, p.ratings, { momentum: Math.min(1, Math.hypot(p.vx, p.vy) / (p.speed * 1.5)), brokenTackles: p.brokenTackles });
          if (contact === 'broken') {
            p.brokenTackles++; defender.stunned = .65; p.vx *= .7; p.vy *= .7;
            this.notice = 'BROKEN TACKLE · Keep moving!'; continue;
          }
          this.finish(p.x < this.field.endZone ? 'SAFETY' : p === this.qb && p.x < this.lineOfScrimmage ? 'SACK' : 'TACKLED'); return;
        }
      }
    }
    if (this.elapsed >= 35) this.finish('PLAY OVER', 'Practice play time limit reached.');
  }
}
