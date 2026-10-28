import { distance, steer } from './Routes.js';
import { reactionTime, pursuitLead, SPRINT_MULTIPLIER } from './RatingEffects.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class Defense {
  constructor() { this.reset(); }
  reset() { this.reads = new WeakMap(); this.edgeRush = new WeakSet(); this.time = 0; this.lastElapsed = 0; }
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
      if (play.coverage && defender.coverageRole) {
        const decision = this.tacticalTarget(play, defender);
        target = decision.target; sprint = decision.sprint;
      } else if (ball.mode === 'flight') {
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
  updatePresnap(play, dt) {
    if (!play.coverage) return;
    // Man defenders travel with motion. Zone defenders hold their landmarks;
    // this gives motion a visible coverage read without revealing the playbook.
    for (const defender of play.defenders) {
      const role = defender.coverageRole;
      if (role?.type !== 'man') continue;
      const receiver = play.receivers[role.receiverIndex];
      if (!receiver) continue;
      const cushion = play.defensiveAdjustment === 'press' ? 1.2 : play.defensiveAdjustment === 'cushion' ? 9 : 5;
      const target = { x: Math.max(play.lineOfScrimmage + play.field.yard * .4, receiver.x + cushion * play.field.yard),
        y: receiver.y + Math.sign(play.field.height / 2 - receiver.y) * play.field.yard * .6 };
      defender.update(dt, steer(defender, target), play.field);
    }
  }
  tacticalTarget(play, defender) {
    const { field, carrier, ball } = play, role = defender.coverageRole;
    const adjustment = play.defensiveAdjustment || 'balanced';
    const receiver = role.type === 'man' ? play.receivers[role.receiverIndex] : null;
    const coverage = () => role.type === 'man' ? this.coverageTarget(defender, receiver, field, adjustment) :
      role.type === 'zone' ? this.zoneTarget(play, defender) : this.rushTarget(play, defender);
    const delay = reactionTime(defender.ratings);
    if (ball.mode === 'flight') {
      const canBreak = ball.elapsed >= delay && distance(defender, ball.target) < field.yard * (role.deep ? 13 : 9) + defender.ratings.awareness;
      return { target: canBreak ? ball.target : coverage(), sprint: canBreak };
    }
    const handoffRead = adjustment === 'box' ? .1 : .35 + delay * .4;
    const runRecognized = play.phase === 'running' && carrier &&
      (carrier !== play.rb || play.elapsed >= (play.call?.exchangeTime || 0) + handoffRead);
    if (runRecognized || play.elapsed > 6) return { target: carrier ? this.pursuitTarget(defender, carrier, field) : ball, sprint: true };
    if (role.type === 'rush') return { target: this.rushTarget(play, defender), sprint: play.coverage === 'blitz' };
    if (adjustment === 'press' && receiver && play.elapsed < .65 && receiver.x < play.lineOfScrimmage + field.yard * 4 && distance(defender, receiver) < 45) {
      // Contact affects the receiver's actual release and momentum. Faster,
      // stronger releases escape sooner; no catch/success roll is modified.
      const leverage = clamp((defender.ratings.strength + defender.ratings.coverage - receiver.ratings.strength - receiver.ratings.routeRunning + 50) / 140, .1, .65);
      receiver.vx *= 1 - leverage * .1; receiver.vy *= 1 - leverage * .1;
    }
    return { target: coverage(), sprint: false };
  }
  rushTarget(play, defender) {
    const role = defender.coverageRole;
    const fake = play.call?.fakeDuration;
    const fooled = fake && play.elapsed < fake + (99 - defender.ratings.awareness) * .012;
    const target = fooled ? play.rb : play.carrier || play.qb;
    // Edge pressure first clears the tackles; central rushers attack the
    // pocket directly. Extra rushers therefore open real outlet lanes.
    if (Math.abs(role.lane) > 5 && defender.x > play.lineOfScrimmage - play.field.yard * 6.5)
      return { x: play.lineOfScrimmage - play.field.yard * 7.5, y: play.field.height / 2 + role.lane * play.field.yard };
    if (Math.abs(role.lane) > 5 && !this.edgeRush.has(defender)) {
      if (Math.abs(defender.y - target.y) < play.field.yard * 2 && defender.x < target.x) this.edgeRush.add(defender);
      else return { x: target.x - play.field.yard * 2.5, y: target.y };
    }
    return target;
  }
  zoneTarget(play, defender) {
    const { field, lineOfScrimmage: line, receivers } = play, role = defender.coverageRole;
    const low = role.low * field.height, high = role.high * field.height;
    const reads = receivers.map(receiver => this.readReceiver(defender, receiver));
    const threats = reads.filter(read => read.y >= low - 20 && read.y <= high + 20 && read.x > line - field.yard * 4 &&
      (role.deep ? read.x > line + field.yard * (role.depth - 10) : read.x < line + field.yard * (role.depth + 9)));
    if (!threats.length) return role.anchor;
    threats.sort((a, b) => role.deep ? (b.x - Math.abs(b.y - defender.y) * .3) - (a.x - Math.abs(a.y - defender.y) * .3) :
      distance(a, defender) - distance(b, defender));
    const threat = threats[0], shift = play.defensiveAdjustment === 'cushion' ? field.yard * 2 : 0;
    return {
      x: clamp(role.deep ? Math.max(role.anchor.x, threat.x + field.yard * 4) :
        Math.min(line + field.yard * (role.depth + 5) + shift, Math.max(line + field.yard * 1.5, threat.x + field.yard * 1.2 + shift)), defender.radius, field.width - defender.radius),
      y: clamp(threat.y * (role.deep ? .78 : .94) + role.anchor.y * (role.deep ? .22 : .06), Math.max(defender.radius, low), Math.min(field.height - defender.radius, high)),
    };
  }
  readReceiver(defender, receiver) {
    const samples = this.reads.get(receiver);
    if (!samples?.length) return receiver;
    const delay = .1 + reactionTime(defender.ratings) * .8 + (99 - defender.ratings.coverage) * .001;
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
    observed.x += observed.vx * age * .4; observed.y += observed.vy * age * .4;
    return observed;
  }
  coverageTarget(defender, receiver, field, adjustment = 'balanced') {
    if (!receiver) return defender;
    const r = defender.ratings;
    const read = this.readReceiver(defender, receiver);
    const lead = .03 + r.awareness * .0005;
    const cushion = adjustment === 'press' ? 7 + (99 - r.coverage) * .2 :
      adjustment === 'cushion' ? field.yard * 3 + (99 - r.coverage) * .48 : 18 + (99 - r.coverage) * .48;
    const inside = (read.y < field.height / 2 ? 1 : -1) * (11 + (99 - r.coverage) * .3);
    let targetX = read.x + read.vx * lead + cushion;
    // On a vertical release, keep existing leverage instead of first running
    // backward into the receiver. Cuts and curls still force a real turn.
    if (read.vx > 30 && Math.abs(read.vy) < read.vx * .5 && defender.x > read.x)
      targetX = Math.max(defender.x, targetX);
    return {
      x: clamp(targetX, defender.radius, field.width - defender.radius),
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
