import { distance, steer } from './Routes.js';
import { reactionTime, pursuitLead } from './RatingEffects.js';

export class Defense {
  update(play, dt) {
    const { defenders, receivers, carrier, ball, field } = play;
    for (const defender of defenders) {
      let target;
      let sprint = false;
      if (ball.mode === 'flight') {
        // Only nearby defenders break on the pass; everyone else keeps coverage.
        const readingPass = ball.elapsed < reactionTime(defender.ratings);
        const receiver = receivers[Math.max(0, defender.assignment)];
        target = !readingPass && distance(defender, ball.target) < 190 + defender.ratings.awareness * 2 ? ball.target : defender.assignment < 0 ? play.qb : this.coverageTarget(defender, receiver, field);
      } else if ((play.phase === 'running' && !(play.call?.type === 'run' && play.elapsed < play.call.exchangeTime + .6)) || play.elapsed > 6) {
        const lead = pursuitLead(defender.ratings);
        target = { x: carrier.x + carrier.vx * lead, y: carrier.y + carrier.vy * lead };
        sprint = true;
      } else if (defender.assignment < 0) {
        target = play.call?.fakeDuration && play.elapsed < play.call.fakeDuration + (99 - defender.ratings.awareness) * .012 ? play.rb : carrier;
      } else {
        const receiver = receivers[defender.assignment];
        target = this.coverageTarget(defender, receiver, field);
      }
      if (play.blocking.blocks(play, defender)) target = defender;
      defender.update(dt, steer(defender, target, sprint), field);
    }
  }
  coverageTarget(defender, receiver, field) {
    const r = defender.ratings;
    return { x: receiver.x - (85 - .6 * r.coverage), y: receiver.y + (receiver.y < field.height / 2 ? 1 : -1) * (68 - .4 * r.coverage) };
  }
}
