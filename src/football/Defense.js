import { distance, steer } from './Routes.js';

export class Defense {
  update(play, dt) {
    const { defenders, receivers, carrier, ball, field } = play;
    for (const defender of defenders) {
      let target;
      let sprint = false;
      if (ball.mode === 'flight') {
        // Only nearby defenders break on the pass; everyone else keeps coverage.
        const readingPass = ball.elapsed < .3;
        const receiver = receivers[Math.max(0, defender.assignment)];
        target = !readingPass && distance(defender, ball.target) < 330 ? ball.target : defender.assignment < 0 ? play.qb : { x: receiver.x - 45, y: receiver.y + 40 };
      } else if (play.phase === 'running' || play.elapsed > 6) {
        target = { x: carrier.x + carrier.vx * .18, y: carrier.y + carrier.vy * .18 };
        sprint = true;
      } else if (defender.assignment < 0) {
        target = carrier;
      } else {
        const receiver = receivers[defender.assignment];
        target = { x: receiver.x - 45, y: receiver.y + (receiver.y < field.height / 2 ? 40 : -40) };
      }
      // The offensive line buys a short pocket, then releases the rush.
      const blocked = defender.assignment < 0 && play.elapsed < 2.2 && play.linemen.some(p => distance(p, defender) < 115);
      if (blocked) target = defender;
      defender.update(dt, steer(defender, target, sprint), field);
    }
  }
}
