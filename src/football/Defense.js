import { distance, steer } from './Routes.js';
import { reactionTime, pursuitLead, SPRINT_MULTIPLIER } from './RatingEffects.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class Defense {
  constructor() { this.reset(); }
  reset() { this.reads = new WeakMap(); this.time = 0; this.lastElapsed = 0; }
  update(play, dt) {
    const { defenders, receivers, carrier, ball, field } = play;
    if (play.elapsed < this.lastElapsed) this.reset();
    this.lastElapsed = play.elapsed; this.time += dt;
    for (const receiver of receivers) {
      let samples = this.reads.get(receiver);
      if (!samples) { samples = []; this.reads.set(receiver, samples); }
      samples.push({ time: this.time, x: receiver.x, y: receiver.y, vx: receiver.vx, vy: receiver.vy });
      while (samples.length > 2 && samples[1].time < this.time - 1) samples.shift();
    }
    for (const defender of defenders) {
      let target;
      let sprint = false;
      const receiver = receivers[Math.max(0, defender.assignment)];
      const deepHelp = receiver && (defender.baseSpawn || defender.spawn).x - (receiver.baseSpawn || receiver.spawn).x > field.yard * 20;
      if (ball.mode === 'flight') {
        // Only nearby defenders break on the pass; everyone else keeps coverage.
        const readingPass = ball.elapsed < reactionTime(defender.ratings);
        target = !readingPass && distance(defender, ball.target) < 190 + defender.ratings.awareness * 2 ? ball.target :
          defender.assignment < 0 ? play.qb : deepHelp ? this.helpTarget(defender, receivers, field, play.lineOfScrimmage) : this.coverageTarget(defender, receiver, field);
      } else if ((play.phase === 'running' && !(play.call?.type === 'run' && play.elapsed < play.call.exchangeTime + .6)) || play.elapsed > 6) {
        target = carrier ? this.pursuitTarget(defender, carrier, field) : ball;
        sprint = true;
      } else if (defender.assignment < 0) {
        target = play.call?.fakeDuration && play.elapsed < play.call.fakeDuration + (99 - defender.ratings.awareness) * .012 ? play.rb : carrier;
      } else {
        target = deepHelp ? this.helpTarget(defender, receivers, field, play.lineOfScrimmage) : this.coverageTarget(defender, receiver, field);
      }
      if (!target || play.blocking.blocks(play, defender)) target = defender;
      defender.update(dt, steer(defender, target, sprint), field);
    }
  }
  readReceiver(defender, receiver) {
    const samples = this.reads.get(receiver);
    if (!samples?.length) return receiver;
    const delay = .05 + reactionTime(defender.ratings) * .45;
    const readTime = this.time - delay;
    let before = samples[0], after = before;
    for (const sample of samples) {
      after = sample;
      if (sample.time >= readTime) break;
      before = sample;
    }
    const blend = before.time === after.time ? 0 : clamp((readTime - before.time) / (after.time - before.time), 0, 1);
    const observed = {};
    for (const key of ['x', 'y', 'vx', 'vy']) observed[key] = before[key] + (after[key] - before[key]) * blend;
    // Extrapolate the observed motion, never a receiver's future route. A cut
    // temporarily beats this read until the defender recognizes the change.
    const age = Math.min(delay, Math.max(0, this.time - (before.time + (after.time - before.time) * blend)));
    observed.x += observed.vx * age; observed.y += observed.vy * age;
    return observed;
  }
  coverageTarget(defender, receiver, field) {
    if (!receiver) return defender;
    const r = defender.ratings;
    const read = this.readReceiver(defender, receiver);
    const lead = .06 + r.awareness * .001;
    const cushion = 18 + (99 - r.coverage) * .48;
    const inside = (read.y < field.height / 2 ? 1 : -1) * (11 + (99 - r.coverage) * .3);
    return {
      x: clamp(read.x + read.vx * lead + cushion, defender.radius, field.width - defender.radius),
      y: clamp(read.y + read.vy * lead + inside, defender.radius, field.height - defender.radius),
    };
  }
  helpTarget(defender, receivers, field, lineOfScrimmage) {
    // The extra deep defender protects the middle, then helps a receiver who
    // actually reaches their zone rather than duplicating a man assignment.
    const reads = receivers.map(receiver => this.readReceiver(defender, receiver));
    const threat = reads.filter(receiver => receiver.x > lineOfScrimmage + 100)
      .sort((a, b) => (b.x - Math.abs(b.y - defender.y) * .25) - (a.x - Math.abs(a.y - defender.y) * .25))[0];
    return threat ? {
      x: clamp(Math.max(lineOfScrimmage + 330, threat.x + 100), defender.radius, field.width - defender.radius),
      y: clamp(threat.y * .6 + field.height * .2, defender.radius, field.height - defender.radius),
    } : { x: clamp(Math.max(lineOfScrimmage + 330, defender.spawn.x), defender.radius, field.width - defender.radius), y: field.height / 2 };
  }
  pursuitTarget(defender, carrier, field) {
    const dx = carrier.x - defender.x, dy = carrier.y - defender.y;
    const speed = defender.speed * SPRINT_MULTIPLIER;
    const vx = carrier.vx, vy = carrier.vy;
    // Solve for a meeting point using the runner's current velocity. Bound
    // the horizon so a direction change can still beat the pursuit angle.
    const a = vx * vx + vy * vy - speed * speed;
    const b = 2 * (dx * vx + dy * vy), c = dx * dx + dy * dy;
    let intercept = Math.sqrt(c) / Math.max(1, speed);
    if (Math.abs(a) < .0001 && b < 0) intercept = -c / b;
    else if (Math.abs(a) >= .0001) {
      const discriminant = b * b - 4 * a * c;
      if (discriminant >= 0) {
        const roots = [(-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)].filter(t => t >= 0);
        if (roots.length) intercept = Math.min(...roots);
      }
    }
    const read = .45 + defender.ratings.awareness * .005;
    const horizon = clamp(intercept * read, pursuitLead(defender.ratings), 1.05);
    const target = { x: carrier.x + vx * horizon, y: carrier.y + vy * horizon };
    // A defender already outside an edge runner keeps that shoulder covered
    // until contact range, funneling the run toward the other defenders.
    const edge = carrier.y < field.height * .2 ? -1 : carrier.y > field.height * .8 ? 1 : 0;
    if (edge && dy * edge < 0 && Math.sqrt(c) > 80 && vy * edge >= 0) target.y += edge * (12 + defender.ratings.awareness * .12);
    target.x = clamp(target.x, defender.radius, field.width - defender.radius);
    target.y = clamp(target.y, defender.radius, field.height - defender.radius);
    return target;
  }
}
