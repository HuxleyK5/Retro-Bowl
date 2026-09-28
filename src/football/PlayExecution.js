import { FORMATIONS, worldPoint } from './Playbook.js';
import { steer } from './Routes.js';
import { releaseReaction } from './RatingEffects.js';

// Formation, exchanges and blocking assignments for one immutable playbook entry.
export class PlayExecution {
  constructor(play) { this.play = play; this.reset(); }
  point(point) { return worldPoint(point, this.play.field, this.play.lineOfScrimmage); }
  apply(call) {
    const p = this.play; p.call = call;
    for (const player of [p.qb, ...p.receivers]) {
      player.spawn = this.point(FORMATIONS[call.formation].positions[player.slot]);
      if (call.routes[player.slot]) player.route = call.routes[player.slot].map(point => this.point(point));
      player.releaseDelay = call.releaseDelay?.[player.slot] || 0;
    }
  }
  reset() { this.exchanged = false; this.guided = true; }
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
      const target = this.point(p.call.exchange);
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
      const target = this.point(call.exchange), t = this.exchangeProgress();
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
      return steer(p.qb, this.point([-5, 0]));
    }
    if (call.fakeDuration && p.phase === 'passing') p.notice = 'PLAY ACTION · Fake complete. Aim + click to pass';
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
      const target = this.point([4 + i * 1.8, scheme.lane + (i - 2) * 2]);
      lineman.update(dt, steer(lineman, target), p.field);
    });
  }
}
