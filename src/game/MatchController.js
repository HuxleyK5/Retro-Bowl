import { MatchRules } from './MatchRules.js';
import { Opponent } from './Opponent.js';

export class MatchController {
  constructor(play, random = Math.random) {
    this.play = play; this.rules = new MatchRules(random); this.opponent = new Opponent(random);
    this.phaseAge = 0; this.lastPhase = this.rules.phase;
  }
  get humanTurn() { return this.rules.possession === 'home'; }
  start(seconds) { this.rules.start(seconds); this.prepare(); }
  prepare() {
    this.play.configure(this.rules.spot, this.rules.possession, this.rules.firstDownLine);
    this.opponent.reset(); this.phaseAge = 0;
  }
  advance() {
    const r = this.rules;
    if (r.phase === 'ready') { if (this.humanTurn) this.snap(); }
    else if (r.phase === 'extraPoint') { if (this.humanTurn) this.kick('extraPoint'); }
    else if (['result', 'halftime', 'quarterBreak'].includes(r.phase)) {
      r.continue();
      if (r.phase === 'ready') this.prepare();
      this.phaseAge = 0;
    }
  }
  snap() { if (this.rules.beginPlay()) { this.play.snap(); return true; } return false; }
  kick(kind) {
    if (!this.rules.beginKick(kind)) return false;
    const p = this.play;
    const extra = kind === 'extraPoint';
    if (extra) p.configure(85, this.rules.possession, 100);
    p.phase = 'dead'; p.carrier = null;
    const target = kind === 'punt' ? { x: Math.min(p.field.width - 50, p.lineOfScrimmage + 850), y: p.field.height / 2 } : { x: p.field.width - 20, y: p.field.height / 2 };
    p.ball.throw(p.qb, target, 3);
    this.phaseAge = 0; return true;
  }
  action(action, movement, point) {
    if (action === 'snap' || action === 'reset') { if (action === 'snap' || this.rules.phase !== 'live') this.advance(); return; }
    if (!this.humanTurn) return;
    if (action === 'fieldGoal') this.kick('fieldGoal');
    if (action === 'punt') this.kick('punt');
    if (this.rules.phase !== 'live') return;
    if (action === 'throw') this.play.throw(point);
    if (action === 'handoff') this.play.handoff();
    if (action === 'juke') this.play.juke(movement);
  }
  update(dt, movement) {
    const r = this.rules;
    if (r.phase !== this.lastPhase) { this.phaseAge = 0; this.lastPhase = r.phase; }
    this.phaseAge += dt;
    r.tick(dt);
    if (r.phase === 'live') {
      this.play.update(dt, this.humanTurn ? movement : this.opponent.movement(this.play));
      if (this.play.phase === 'dead') r.completePlay(this.play.outcome);
    } else if (r.phase === 'kick') {
      this.play.ball.update(dt);
      if (this.play.ball.landed) { this.play.ball.mode = 'ground'; r.completeKick(); }
    } else if (!this.humanTurn) {
      if (r.phase === 'ready' && this.phaseAge > 1.6) {
        const call = this.opponent.call(r); if (call === 'snap') this.snap(); else this.kick(call);
      } else if (r.phase === 'extraPoint' && this.phaseAge > 1.3) this.kick('extraPoint');
      else if (r.phase === 'result' && this.phaseAge > 2.5) this.advance();
    }
  }
}
