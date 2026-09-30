import { kickExecution } from './KickMeter.js';

export class KickoffReturn {
  constructor(play) { this.play = play; }
  launch(rules, input) {
    const p = this.play, kickingSide = rules.possession === 'home' ? 'away' : 'home';
    const rating = rules.specialists?.[kickingSide]?.kicker?.ratings;
    const kick = kickExecution('kickoff', rating, 0, input);
    this.landing = Math.round(65 - kick.kickoffYards);
    this.touchback = this.landing <= 0;
    p.configure(Math.max(1, this.landing), rules.possession);
    const x = p.field.endZone + Math.max(-5, this.landing) * p.field.yard;
    const y = p.field.height / 2 + kick.accuracy * 220;
    Object.assign(p.rb, { x, y, vx: 0, vy: 0 });
    p.controlled = p.rb; p.carrier = null; p.phase = 'kickoff';
    p.firstDownX = null; p.isKickoff = true;
    rules.newSeries(Math.max(1, this.landing));
    p.defenders.forEach((d, i) => { d.x = x + 480 + (i % 2) * 90; d.y = 90 + i * 125; });
    p.players.filter(player => player.team === 'home' && player !== p.rb).forEach((b, i) => {
      b.x = x + 160 + (i % 3) * 60; b.y = 100 + i * 85;
      if (b.route) b.route = [{ x: b.x + 700, y: b.y }];
    });
    p.ball.throw({ x: p.field.endZone + 65 * p.field.yard, y: p.field.height / 2 }, { x, y }, 2.5);
    rules.phase = 'kickoff'; rules.clockRunning = false; rules.kickoffPending = false;
    rules.kick = null; rules.detail = 'Kickoff in flight. Get ready to return.';
  }
  updateFlight(dt, rules) {
    const p = this.play;
    p.ball.update(dt);
    if (!p.ball.landed) return;
    if (this.touchback) {
      p.ball.mode = 'ground'; p.phase = 'dead';
      rules.newSeries(25); rules.phase = 'result'; rules.result = 'TOUCHBACK';
      rules.detail = 'Kickoff reaches the end zone. First down at the 25.';
      rules.next = null; rules.playClock = 40; return;
    }
    p.carrier = p.rb; p.controlled = p.rb; p.phase = 'running'; p.ball.attach(p.rb);
    p.autoRunAfterCatch = true; p.catchSteeringReady = false; p.catchProtection = .25;
    Object.assign(p.rb, { vx: p.rb.speed, vy: 0, moving: true, facing: 1 });
    rules.phase = 'return'; rules.clockRunning = true; rules.playNumber++;
    p.notice = 'KICK RETURN / Auto run / WASD steer / SHIFT sprint / J juke';
  }
  finish(rules) {
    const outcome = this.play.outcome;
    if (outcome.type === 'TOUCHDOWN' || outcome.type === 'SAFETY') {
      rules.phase = 'live'; rules.completePlay(outcome); return;
    }
    rules.newSeries(outcome.spot); rules.phase = 'result'; rules.clockRunning = false;
    rules.next = null; rules.playClock = 40;
    rules.result = `KICK RETURN / ${Math.max(0, Math.round(outcome.spot - this.landing))} YARDS`;
    rules.detail = `${outcome.type === 'OUT OF BOUNDS' ? 'Out of bounds.' : 'Returner down.'} First down at ${rules.spotLabel.toLowerCase()}.`;
  }
}
