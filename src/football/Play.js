import { Player } from '../entities/Player.js';
import { Football } from '../entities/Football.js';
import { Routes, distance, steer } from './Routes.js';
import { Defense } from './Defense.js';
import { getPlay } from './Playbook.js';
import { PlayExecution } from './PlayExecution.js';
import { createRosters } from '../data/Rosters.js';
import { availableRoster } from '../data/PlayerLifecycle.js';
import { configureDefense, targetForDepth } from './Tactics.js';
import { Blocking } from './Blocking.js';
import { throwRange, throwVelocity, throwSpread, catchMargin, tackleResult, releaseReaction, reactionTime, fumbleChance, SPRINT_MULTIPLIER } from './RatingEffects.js';

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
      p.baseAssignment = p.assignment;
      if (p.route) p.baseRoute = p.route.map(point => ({ ...point }));
    }
    this.routes = new Routes(this.receivers); this.defense = new Defense(); this.ball = new Football();
    this.execution = new PlayExecution(this);
    this.blocking = new Blocking();
    this.reset();
  }
  bindRoster(possession) {
    const slots = {};
    const lineups = Object.fromEntries(Object.entries(this.rosters).map(([side, roster]) => [side, availableRoster({ roster })]));
    for (const player of this.players) {
      const teamId = player.team === 'home' ? possession : possession === 'home' ? 'away' : 'home';
      const position = { QUARTERBACK: 'QB', 'RUNNING BACK': 'RB', RECEIVER: 'WR', LINEMAN: 'OL', DEFENDER: 'DEF' }[player.role], key = `${teamId}-${position}`;
      const index = slots[key] || 0; slots[key] = index + 1;
      const record = lineups[teamId]?.filter(data => data.position === position)[index];
      if (!record) throw new Error(`Missing roster slot ${key} ${index}`);
      player.bindData(record);
    }
  }
  configure(spot, possession = 'home', firstDown = Math.min(100, spot + 10), playId = null, options = {}) {
    this.bindRoster(possession);
    this.lineOfScrimmage = this.field.endZone + spot * this.field.yard;
    this.firstDownX = this.field.endZone + firstDown * this.field.yard;
    const offset = this.lineOfScrimmage - 900;
    for (const p of this.players) {
      p.spawn = { x: clamp(p.baseSpawn.x + offset, 20, this.field.width - 20), y: p.baseSpawn.y };
      p.uniform = possession === 'home' ? p.team : p.team === 'home' ? 'away' : 'home';
      if (p.baseAssignment !== undefined) p.assignment = p.baseAssignment;
      if (p.baseRoute) p.route = p.baseRoute.map(point => ({ x: clamp(point.x + offset, 25, this.field.width - 30), y: point.y }));
    }
    this.call = null; this.coverage = null; this.defensiveAdjustment = 'balanced'; this.formation = null;
    this.receivers.forEach(p => { p.releaseDelay = 0; });
    if (playId) {
      const call = getPlay(playId);
      if (!call) throw new Error(`Unknown play: ${playId}`);
      this.execution.apply(call, options.formation === 'play' ? null : options.formation);
    }
    if (options.coverage) configureDefense(this, options.coverage, options.adjustment || 'balanced');
    this.reset();
    this.execution.startMotion(options.motion || 'none');
  }
  get outcome() {
    return { type: this.result, spot: ((this.carrier?.x ?? this.ball.x) - this.field.endZone) / this.field.yard,
      recoveredBy: this.recoveredBy, fumbleSpot: this.fumbleSpot };
  }
  reset() {
    this.players.forEach(p => p.reset()); this.routes.reset(); this.ball.reset();
    this.defense.reset?.();
    this.events = []; this.eventSerial ??= 0; this.generation = (this.generation || 0) + 1;
    this.fumbleSpot = undefined; this.recoveredBy = undefined; this.fumbleCount = 0;
    this.execution.reset(); this.isKickoff = false;
    this.blocking.reset(); this.catchJitter = 0; this.autoRunAfterCatch = false; this.catchSteeringReady = false;
    this.carrier = this.qb; this.controlled = this.qb; this.phase = 'presnap'; this.elapsed = 0;
    this.result = ''; this.notice = 'SPACE TO SNAP · Attack the right end zone →'; this.hasThrown = false; this.passDistance = 0; this.catchProtection = 0;
    this.ball.attach(this.qb);
  }
  get live() { return ['passing', 'flight', 'running', 'loose'].includes(this.phase); }
  get canThrow() { return this.phase === 'passing' && this.carrier === this.qb && !this.hasThrown && this.qb.x < this.lineOfScrimmage && this.execution.canPass; }
  snap() {
    if (this.phase !== 'presnap') return false;
    this.execution.finishMotion();
    this.phase = 'passing'; this.notice = 'Hold mouse, pull back, release to pass · H to hand off';
    this.emit('snap', this.qb); return true;
  }
  handoff() {
    if (!this.canThrow || this.elapsed > 1.8 || distance(this.qb, this.rb) > 220) return false;
    return this.giveToBack();
  }
  giveToBack() {
    this.carrier = this.rb; this.controlled = this.rb; this.phase = 'running'; this.ball.attach(this.rb);
    this.notice = 'HANDOFF · Run right! SHIFT sprint · J juke'; return true;
  }
  emit(type, player = this.carrier, label = '') {
    const point = player || this.ball;
    this.events.push({ id: ++this.eventSerial, type, x: point.x, y: point.y,
      number: player?.number, team: player?.team, uniform: player?.uniform || player?.team, label });
    if (this.events.length > 48) this.events.shift();
  }
  juke(direction) {
    if (!this.live || this.execution.locked || this.ball.mode !== 'held' || !this.carrier.juke(direction)) return false;
    this.emit('juke'); return true;
  }
  aim(point, depth = 'auto') {
    point = targetForDepth(this, point, depth);
    let receiver = null; let nearest = 100;
    for (const p of point.manual ? [] : this.receivers) { const d = distance(p, point); if (d < nearest) { receiver = p; nearest = d; } }
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
    const read = this.passRead(target, duration);
    return { target, duration, receiver, ...read };
  }
  passRead(target, duration) {
    let separation = Infinity;
    for (const defender of this.defenders) {
      const lead = Math.min(.3, duration);
      const projected = { x: defender.x + defender.vx * lead, y: defender.y + defender.vy * lead };
      separation = Math.min(separation, distance(projected, target));
    }
    return { separation, risk: separation < 45 ? 'danger' : separation < 90 ? 'contested' : 'open' };
  }
  throw(point, depth = 'auto') {
    if (!this.canThrow || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    const plan = this.aim(point, depth);
    this.passDistance = distance(this.qb, plan.target);
    const pressure = this.defenders.some(d => distance(d, this.qb) < 150) ? 1 : 0;
    const moving = Math.hypot(this.qb.vx, this.qb.vy) > 30;
    const spread = throwSpread(this.qb.ratings, this.passDistance, moving, pressure);
    const angle = this.random() * Math.PI * 2;
    const error = (.85 + .15 * this.random()) * spread;
    this.catchJitter = (this.random() - .5) * .04;
    const target = { x: plan.target.x + Math.cos(angle) * error, y: plan.target.y + Math.sin(angle) * error };
    this.ball.throw(this.qb, target, plan.duration);
    this.emit('pass', this.qb);
    this.hasThrown = true; this.carrier = null; this.phase = 'flight';
    this.notice = 'BALL IN THE AIR · Control transfers automatically on a catch'; return true;
  }
  catchMargin(player, separation) {
    const contested = player.team === 'home' && this.defenders.some(d => distance(d, player) < 65);
    const leverage = player.team === 'home' ? this.defenders.reduce((pressure, d) => {
      const gap = distance(d, player);
      return Math.max(pressure, gap < 42 && distance(d, this.ball) < separation + 18 ? (42 - gap) / 42 : 0);
    }, 0) : 0;
    return catchMargin(player.ratings, separation, contested, this.passDistance, player.team === 'away') - leverage * .16;
  }
  resolveCatch(eligible = [...this.receivers, ...this.defenders]) {
    if (this.ball.x < 0 || this.ball.x > this.field.width || this.ball.y < 0 || this.ball.y > this.field.height) return false;
    const candidates = eligible
      .map(player => ({ player, separation: distance(player, this.ball) }))
      .filter(({ player, separation }) => separation <= 45 && !this.ball.attempted.has(player) && player.y > player.radius && player.y < this.field.height - player.radius)
      .sort((a, b) => a.separation - b.separation);
    for (const { player, separation } of candidates) {
      this.ball.attempted.add(player);
      if (this.catchMargin(player, separation) + this.catchJitter < 0) continue;
      const catchHeight = this.ball.height;
      this.carrier = player; this.controlled = player; this.ball.attach(player);
      if (player.team === 'away') this.finish('INTERCEPTION', 'Defense takes possession.');
      else {
        this.phase = 'running'; this.autoRunAfterCatch = true; this.catchSteeringReady = false; this.catchProtection = .25;
        // Commit to the end zone at the catch, rather than braking out of the receiver's route first.
        player.vx = player.speed; player.vy = 0; player.facing = 1; player.moving = true;
        const contested = this.defenders.some(d => distance(d, player) < 65);
        this.emit('catch', player, catchHeight > 20 ? 'LEAPING CATCH' : separation > 25 ? 'REACHING CATCH' : contested ? 'CONTESTED CATCH' : 'CATCH');
        this.notice = `CAUGHT BY #${player.number} / AUTO RUN / Release movement keys, then steer / SHIFT sprint / J juke`;
      }
      return true;
    }
    return false;
  }
  trackPassReceiver(player, dt) {
    if (this.ball.mode !== 'flight' || this.ball.elapsed < this.ball.duration * .68 ||
        distance(player, this.ball.target) > 95 + player.ratings.awareness * .55) return false;
    player.update(dt, { ...steer(player, this.ball.target), route: true }, this.field);
    return true;
  }
  forceFumble(defender) {
    if (this.ball.mode !== 'held' || !this.carrier || this.fumbleCount >= 2) return false;
    const runner = this.carrier, gap = Math.max(1, distance(runner, defender));
    this.fumbleSpot = (runner.x - this.field.endZone) / this.field.yard;
    this.fumbleCount++; this.recoveredBy = undefined;
    this.execution.exchanged = true; this.execution.guided = false;
    this.ball.loosen(runner, { x: runner.vx * .4 + (runner.x - defender.x) / gap * 115,
      y: runner.vy * .4 + (runner.y - defender.y) / gap * 115 });
    runner.stunned = .55; defender.stunned = .2;
    this.emit('fumble', runner, 'BALL LOOSE!');
    this.carrier = null; this.phase = 'loose'; this.autoRunAfterCatch = false;
    this.notice = 'FUMBLE / Chase the loose ball / WASD steer'; return true;
  }
  updateLooseBall(dt, movement) {
    const b = this.ball;
    if (b.y <= 0 || b.y >= this.field.height || b.x <= 0 || b.x >= this.field.width) {
      this.finish('FUMBLE_OUT_OF_BOUNDS', 'Loose ball out of bounds.'); return;
    }
    this.ball.update(dt);
    if (b.y <= 0 || b.y >= this.field.height || b.x <= 0 || b.x >= this.field.width) {
      this.finish('FUMBLE_OUT_OF_BOUNDS', 'Loose ball out of bounds.'); return;
    }
    for (const player of this.players) {
      const input = player === this.controlled && (movement.x || movement.y) ? movement : steer(player, b, true);
      player.update(dt, input, this.field);
    }
    if (b.elapsed >= .22) {
      const recoverer = [...this.players].filter(p => p.stunned <= 0 && distance(p, b) < 20 + p.ratings.awareness * .1)
        .sort((a, c) => distance(a, b) - distance(c, b))[0];
      if (recoverer) {
        this.carrier = this.controlled = recoverer; this.ball.attach(recoverer);
        this.recoveredBy = recoverer.team === 'away' ? 'defense' : 'offense';
        this.emit('recovery', recoverer, this.recoveredBy === 'defense' ? 'TURNOVER / DEFENSE RECOVERS' : 'OFFENSE RECOVERS');
        if (this.recoveredBy === 'defense') this.finish('FUMBLE', 'Defense recovers the loose ball.');
        else {
          this.phase = 'running'; this.autoRunAfterCatch = true; this.catchSteeringReady = false; this.catchProtection = .4;
          recoverer.vx = recoverer.speed; recoverer.vy = 0; this.notice = 'RECOVERED / Keep running!';
        }
        return;
      }
    }
    if (this.elapsed >= 35 && this.live) this.finish('FUMBLE_OUT_OF_BOUNDS', 'Loose ball whistled dead.');
  }
  finish(result, detail = '') {
    if (this.phase === 'dead') return;
    this.phase = 'dead'; this.autoRunAfterCatch = false; this.catchSteeringReady = false; this.result = result;
    const event = { TOUCHDOWN: 'touchdown', INTERCEPTION: 'interception', TACKLED: 'tackle', SACK: 'tackle', SAFETY: 'tackle', INCOMPLETE: 'incomplete' }[result];
    if (event) this.emit(event, this.carrier, result === 'TACKLED' ? 'TACKLE' : result);
    if (['INTERCEPTION', 'FUMBLE'].includes(result) && this.carrier?.team === 'away' && this.carrier.x <= this.field.endZone) {
      this.emit('touchdown', this.carrier, 'DEFENSIVE TOUCHDOWN');
    }
    const yards = this.carrier ? Math.round((this.carrier.x - this.lineOfScrimmage) / this.field.yard) : 0;
    this.notice = `${detail || `${yards >= 0 ? '+' : ''}${yards} yards on the play.`} SPACE / R for a new play`;
    this.players.forEach(p => { p.moving = false; p.vx = 0; p.vy = 0; });
  }
  update(dt, movement = still, computerControlled = false) {
    if (this.phase === 'presnap') this.execution.updatePresnap(dt);
    if (!this.live) return;
    this.elapsed += dt;
    this.catchProtection = Math.max(0, this.catchProtection - dt);
    if (this.phase === 'loose') { this.updateLooseBall(dt, movement); return; }
    movement = this.execution.movement(dt, movement);
    if (this.autoRunAfterCatch && this.phase === 'running') {
      const neutral = !movement.x && !movement.y;
      if (neutral || computerControlled) this.catchSteeringReady = true;
      // Keys held before the catch must not carry over from controlling the QB.
      if (neutral || !this.catchSteeringReady) movement = { ...movement, x: 1, y: 0 };
    }
    if (this.ball.mode === 'held') this.controlled.update(dt, movement, this.field);
    else this.qb.update(dt, still, this.field);
    for (const p of this.receivers) if (p !== this.carrier && !this.execution.receiverMovement(p, dt) && !this.trackPassReceiver(p, dt)) this.routes.update(p, dt, this.field);
    this.execution.updateBlockers(dt);
    this.defense.update(this, dt);
    if (this.ball.mode === 'flight') {
      this.ball.update(dt);
      const progress = this.ball.elapsed / this.ball.duration;
      if (this.ball.height < 50 && progress > .75) {
        const ready = this.defenders.filter(d => this.ball.elapsed >= reactionTime(d.ratings) &&
          distance(d, this.ball) < 18 + d.ratings.coverage * .18 && this.ball.height < 15 + d.ratings.coverage * .35);
        const receivers = progress > .88 ? this.receivers.filter(p => this.ball.height < 15 + p.ratings.catching * .35) : [];
        if (ready.length || receivers.length) this.resolveCatch([...receivers, ...ready]);
      }
      if (this.ball.mode === 'flight' && this.ball.elapsed / this.ball.duration > .97 && this.ball.height < 16) this.resolveCatch();
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
          const momentum = Math.min(1, Math.hypot(p.vx, p.vy) / (p.speed * SPRINT_MULTIPLIER));
          const pace = Math.hypot(p.vx, p.vy);
          const approach = pace > 1 && d > 0 ? ((defender.x - p.x) * p.vx + (defender.y - p.y) * p.vy) / (d * pace) : 1;
          const contact = tackleResult(defender.ratings, p.ratings, {
            momentum, brokenTackles: p.brokenTackles,
            glancing: 1 - Math.abs(approach), fromBehind: approach < -.3,
          });
          if (contact === 'broken') {
            p.brokenTackles++; defender.stunned = .85;
            // Carry momentum through the contact and let the missed tackler fall behind.
            p.vx *= .88; p.vy *= .88;
            defender.vx *= .15; defender.vy *= .15;
            this.catchProtection = .16;
            this.emit('brokenTackle', p, 'BROKEN TACKLE');
            this.notice = 'BROKEN TACKLE · Keep moving!'; continue;
          }
          const collisionSpeed = Math.hypot(p.vx - defender.vx, p.vy - defender.vy);
          if (defender.ratings.tackling >= 78 && collisionSpeed >= p.speed * .72) this.emit('bigHit', p, 'BIG HIT!');
          const sideHit = Math.abs((defender.x - p.x) * p.vy - (defender.y - p.y) * p.vx) > d * p.speed * .5;
          if (this.random() < fumbleChance(defender.ratings, p.ratings, { momentum, sideHit }) && this.forceFumble(defender)) return;
          this.finish(p.x < this.field.endZone ? 'SAFETY' : p === this.qb && p.x < this.lineOfScrimmage ? 'SACK' : 'TACKLED'); return;
        }
      }
    }
    if (this.elapsed >= 35) this.finish('PLAY OVER', 'Practice play time limit reached.');
  }
}
