import { FORMATIONS, worldPoint } from './Playbook.js';
import { steer } from './Routes.js';
import { releaseReaction } from './RatingEffects.js';

// Formation, exchanges and blocking assignments for one immutable playbook entry.
export class PlayExecution {
  constructor(play) { this.play = play; this.reset(); }
  point(point) { return worldPoint(point, this.play.field, this.play.lineOfScrimmage); }
  apply(call, formationOverride = null) {
    const formation = formationOverride || call.formation;
    if (!FORMATIONS[formation]) return false;
    const p = this.play; p.call = call; p.formation = formation;
    const original = FORMATIONS[call.formation].positions, positions = FORMATIONS[formation].positions;
    const qbOffset = positions['01'].map((coordinate, axis) => coordinate - original['01'][axis]);
    this.fakePoint = this.point([-5 + qbOffset[0], qbOffset[1]]);
    this.exchangePoint = call.exchange ? this.point(call.exchange.map((coordinate, axis) => coordinate + qbOffset[axis])) : null;
    for (const player of [p.qb, ...p.receivers]) {
      player.spawn = this.point(positions[player.slot]);
      const offset = player === p.rb && call.type === 'run' ? qbOffset :
        positions[player.slot].map((coordinate, axis) => coordinate - original[player.slot][axis]);
      if (call.routes[player.slot]) player.route = call.routes[player.slot].map(point => this.point(point.map((coordinate, axis) => coordinate + offset[axis])));
      player.releaseDelay = call.releaseDelay?.[player.slot] || 0;
    }
    return true;
  }
  reset() { this.exchanged = false; this.guided = true; this.motion = null; this.play.motion = 'none'; }
  startMotion(direction = 'none') {
    const p = this.play;
    if (p.phase !== 'presnap' || !['left', 'right', 'none'].includes(direction)) return false;
    const previousPlayer = this.motion?.player;
    this.finishMotion();
    p.motion = direction;
    if (direction === 'none') {
      if (previousPlayer) { previousPlayer.vx = 0; previousPlayer.vy = 0; previousPlayer.moving = false; }
      return true;
    }
    const player = p.receivers.find(receiver => receiver.slot === '81');
    if (!player) return false;
    this.motion = { player, direction, origin: { x: player.x, y: player.y },
      target: { x: Math.min(player.x, p.lineOfScrimmage - p.field.yard * 2.5), y: p.field.height * (direction === 'left' ? .15 : .85) } };
    return true;
  }
  updatePresnap(dt) {
    const p = this.play;
    if (p.phase !== 'presnap') return;
    if (this.motion) {
      const { player, target } = this.motion;
      // Snap at any point: the route starts at the actual release spot.
      player.update(dt, steer(player, target), p.field);
      if (Math.hypot(player.x - target.x, player.y - target.y) < 5) {
        player.vx = 0; player.vy = 0; player.moving = false;
      }
    }
    p.defense.updatePresnap?.(p, dt);
    p.ball.attach(p.qb);
  }
  finishMotion() {
    if (!this.motion) return;
    const { player, origin } = this.motion, p = this.play;
    const dx = player.x - origin.x, dy = player.y - origin.y;
    if (player.route) player.route = player.route.map(point => ({
      x: Math.max(20, Math.min(p.field.width - 25, point.x + dx)),
      y: Math.max(30, Math.min(p.field.height - 30, point.y + dy)),
    }));
    player.spawn = { x: player.x, y: player.y };
    this.motion = null;
  }
  get locked() {
    const p = this.play;
    return !!p.call && ((p.call.type === 'run' && !this.exchanged) || p.elapsed < (p.call.fakeDuration || 0));
  }
  get canPass() { return this.play.call?.type !== 'run' && !this.locked; }
  exchangeProgress() {
    const p = this.play, start = p.call.exchangeStart || 0;
    return Math.max(0, Math.min(1, (p.elapsed - start) / (p.call.exchangeTime - start)));
  }
  receiverMovement(player, dt) {
    const p = this.play;
    if (p.elapsed < (player.releaseDelay || 0) + releaseReaction(player.ratings)) { player.update(dt, { x: 0, y: 0 }, p.field); return true; }
    if (player === p.rb && p.call?.type === 'run' && !this.exchanged) {
      const t = this.exchangeProgress();
      const target = this.exchangePoint || this.point(p.call.exchange);
      player.x = player.spawn.x + (target.x - player.spawn.x) * t;
      player.y = player.spawn.y + (target.y - player.spawn.y) * t;
      player.moving = t > 0; if (player.moving) player.stride += dt * 12;
      return true;
    }
    return false;
  }
  movement(dt, input) {
    const p = this.play, call = p.call;
    if (!call) return input;
    if (call.type === 'run' && !this.exchanged) {
      const target = this.exchangePoint || this.point(call.exchange), t = this.exchangeProgress();
      p.qb.x = p.qb.spawn.x + (target.x - p.qb.spawn.x) * t;
      p.qb.y = p.qb.spawn.y + (target.y - p.qb.spawn.y) * t;
      if (p.elapsed >= call.exchangeTime) {
        p.rb.x = target.x; p.rb.y = target.y; p.rb.vx = 0; p.rb.vy = 0;
        this.exchanged = true; p.giveToBack();
        p.notice = `${call.name.toUpperCase()} · Follow the lane automatically, or WASD to take over · SHIFT sprint`;
      } else return { x: 0, y: 0 };
    }
    if (call.fakeDuration && p.elapsed < call.fakeDuration) {
      p.notice = 'PLAY ACTION · Faking the handoff…';
      return steer(p.qb, this.fakePoint || this.point([-5, 0]));
    }
    if (call.fakeDuration && p.phase === 'passing') p.notice = 'PLAY ACTION · Fake complete. Pull back + release to pass';
    if (call.type === 'run' && p.carrier === p.rb && this.guided) {
      if (input.x || input.y) this.guided = false;
      else return steer(p.rb, p.routes.target(p.rb), !!input.sprint);
    }
    return input;
  }
  updateBlockers(dt) {
    const p = this.play, scheme = p.call?.blocking;
    if (!scheme || p.elapsed < scheme.release) return;
    p.linemen.forEach((lineman, i) => {
      if (lineman === p.carrier) return;
      const target = this.point([4 + i * 1.8, scheme.lane + (i - 2) * 2]);
      lineman.update(dt, steer(lineman, target), p.field);
    });
  }
}
