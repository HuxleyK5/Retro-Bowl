import { distance } from './Routes.js';
import { blockDuration } from './RatingEffects.js';

export class Blocking {
  constructor() { this.reset(); }
  reset() { this.engagements = new Map(); }
  blocks(play, defender) {
    const passProtection = defender.assignment < 0 && play.phase === 'passing';
    if (!passProtection && !play.call?.blocking) return false;
    const blocker = [...play.linemen].sort((a, b) => distance(a, defender) - distance(b, defender))[0];
    if (!blocker) return false;
    const reach = (passProtection ? 95 : 35) + blocker.ratings.awareness * .25;
    if (distance(blocker, defender) > reach) return false;
    const key = `${blocker.data.id}:${defender.data.id}`;
    if (!this.engagements.has(key)) this.engagements.set(key, play.elapsed);
    return play.elapsed - this.engagements.get(key) < blockDuration(blocker.ratings, defender.ratings);
  }
}
