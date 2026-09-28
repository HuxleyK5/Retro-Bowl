import { distance } from '../football/Routes.js';
import { PLAYBOOK } from '../football/Playbook.js';

// A small coach using the same movement, passing, catching and defense simulation.
export class Opponent {
  constructor(random = Math.random) { this.random = random; this.reset(); }
  reset() { this.decision = null; this.lastJuke = -2; }
  selectPlay(rules) {
    const run = rules.yardsToGo <= 3 ? this.random() < .7 : this.random() < .3;
    const choices = PLAYBOOK.filter(call => call.type === (run ? 'run' : 'pass'));
    return choices[Math.min(choices.length - 1, Math.floor(this.random() * choices.length))].id;
  }
  call(rules) {
    if (rules.down < 4) return 'snap';
    if (rules.fieldGoalDistance <= 53) return 'fieldGoal';
    if (rules.quarter === 4 && rules.clock < 35 && rules.score.away < rules.score.home) return 'snap';
    return 'punt';
  }
  movement(play) {
    if (play.phase === 'passing' && play.canThrow && !this.decision && play.elapsed > 1.25 - play.qb.ratings.awareness * .006) {
      this.decision = !play.call && this.random() < .2 ? 'run' : 'pass';
      if (this.decision === 'run') play.handoff();
      else {
        const reads = Math.max(1, Math.ceil(play.qb.ratings.awareness / 20));
        const targets = play.receivers.slice(0, reads).map(p => ({ p, space: Math.min(...play.defenders.map(d => distance(d, p))) })).sort((a, b) => b.space - a.space);
        play.throw(targets[0].p);
      }
    }
    if (play.phase !== 'running' && this.decision !== 'run') return { x: 0, y: 0 };
    const p = play.carrier;
    if (!p) return { x: 0, y: 0 };
    const nearby = play.defenders.filter(d => d.x > p.x - 20 && distance(d, p) < 65 + p.ratings.awareness).sort((a, b) => distance(a, p) - distance(b, p))[0];
    let y = nearby ? (nearby.y > p.y ? -.65 : .65) : 0;
    if (p.y < 100) y = .65;
    if (p.y > play.field.height - 100) y = -.65;
    const movement = { x: 1 / Math.hypot(1, y), y: y / Math.hypot(1, y), sprint: true };
    if (nearby && distance(nearby, p) < 65 && play.elapsed - this.lastJuke > 1.7) { play.juke(movement); this.lastJuke = play.elapsed; }
    return movement;
  }
}
