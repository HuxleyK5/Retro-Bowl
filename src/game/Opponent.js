import { distance } from '../football/Routes.js';

// A small coach using the same movement, passing, catching and defense simulation.
export class Opponent {
  constructor(random = Math.random) { this.random = random; this.reset(); }
  reset() { this.decision = null; this.lastJuke = -2; }
  call(rules) {
    if (rules.down < 4) return 'snap';
    if (rules.fieldGoalDistance <= 53) return 'fieldGoal';
    if (rules.quarter === 4 && rules.clock < 35 && rules.score.away < rules.score.home) return 'snap';
    return 'punt';
  }
  movement(play) {
    if (play.phase === 'passing' && !this.decision && play.elapsed > .9) {
      this.decision = this.random() < .2 ? 'run' : 'pass';
      if (this.decision === 'run') play.handoff();
      else {
        const targets = play.receivers.map(p => ({ p, space: Math.min(...play.defenders.map(d => distance(d, p))) })).sort((a, b) => b.space - a.space);
        const target = this.random() < .25 ? targets[Math.floor(this.random() * targets.length)].p : targets[0].p;
        play.throw(target);
      }
    }
    if (play.phase !== 'running' && this.decision !== 'run') return { x: 0, y: 0 };
    const p = play.carrier;
    if (!p) return { x: 0, y: 0 };
    const nearby = play.defenders.filter(d => d.x > p.x - 20 && distance(d, p) < 145).sort((a, b) => distance(a, p) - distance(b, p))[0];
    let y = nearby ? (nearby.y > p.y ? -.65 : .65) : 0;
    if (p.y < 100) y = .65;
    if (p.y > play.field.height - 100) y = -.65;
    const movement = { x: 1 / Math.hypot(1, y), y: y / Math.hypot(1, y), sprint: true };
    if (nearby && distance(nearby, p) < 65 && play.elapsed - this.lastJuke > 1.7) { play.juke(movement); this.lastJuke = play.elapsed; }
    return movement;
  }
}
