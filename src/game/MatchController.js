import { KickMeter } from './KickMeter.js';
import { KickoffReturn } from './KickoffReturn.js';
import { MatchRules } from './MatchRules.js';
import { Opponent } from './Opponent.js';
import { DEFAULT_PLAY, PLAYBOOK, FORMATIONS, getPlay } from '../football/Playbook.js';
import { COVERAGES, DEFENSIVE_ADJUSTMENTS, THROW_DEPTHS, chooseCpuCoverage, configureDefense } from '../football/Tactics.js';
import { clockDecision } from './ClockStrategy.js';

export class MatchController {
  constructor(play, random = Math.random) {
    this.play = play; this.rules = new MatchRules(random); this.opponent = new Opponent(random);
    this.phaseAge = 0; this.lastPhase = this.rules.phase;
    this.selectedPlayId = DEFAULT_PLAY; this.meter = null; this.returns = new KickoffReturn(play);
    this.resetStrategy();
  }
  get humanTurn() { return this.rules.possession === 'home'; }
  resetStrategy() {
    this.selectedFormation = 'play'; this.selectedMotion = 'none'; this.throwDepth = 'auto'; this.tempo = 'normal';
    this.defensiveCall = 'man'; this.defensiveAdjustment = 'balanced'; this.cpuCoverage = 'man'; this.cpuAdjustment = 'balanced';
  }
  start(seconds, openingKickoff = true) { this.meter = null; this.rules.start(seconds); this.selectedPlayId = DEFAULT_PLAY; this.resetStrategy(); this.rules.kickoffPending = openingKickoff; this.prepare(); }
  prepare() {
    if (this.rules.kickoffPending) { this.beginKickoff(); return; }
    if (this.humanTurn) {
      this.cpuCoverage = chooseCpuCoverage(this.rules, this.opponent.random);
      this.cpuAdjustment = this.rules.yardsToGo <= 3 ? 'box' : this.rules.yardsToGo >= 15 ? 'cushion' : 'balanced';
    }
    const id = this.humanTurn ? this.selectedPlayId : this.opponent.selectPlay(this.rules, this.defensiveCall);
    this.configurePlay(id);
    this.opponent.reset(); this.phaseAge = 0;
  }
  configurePlay(id = this.selectedPlayId) {
    this.play.configure(this.rules.spot, this.rules.possession, this.rules.firstDownLine, id, {
      formation: this.humanTurn ? this.selectedFormation : 'play', motion: this.humanTurn ? this.selectedMotion : 'none',
      coverage: this.humanTurn ? this.cpuCoverage : this.defensiveCall,
      adjustment: this.humanTurn ? this.cpuAdjustment : this.defensiveAdjustment,
    });
  }
  selectPlay(id) {
    if (this.rules.phase !== 'ready' || !this.humanTurn || !getPlay(id)) return false;
    this.selectedPlayId = id;
    this.configurePlay(id);
    return true;
  }
  tactic(name, value) {
    const r = this.rules;
    if (name === 'timeout') {
      const called = r.timeout('home');
      if (called) this.phaseAge = 0;
      return called;
    }
    if (name === 'throwDepth') {
      if (!this.humanTurn || !Object.hasOwn(THROW_DEPTHS, value) || !(r.phase === 'ready' || r.phase === 'live' && this.play.canThrow)) return false;
      this.throwDepth = value; return true;
    }
    if (name === 'tempo') {
      if (!this.humanTurn || !['ready', 'result'].includes(r.phase) || !['normal', 'hurry', 'chew'].includes(value)) return false;
      this.tempo = value; return true;
    }
    if (r.phase !== 'ready' || r.clock <= 0) return false;
    if (['coverage', 'adjustment'].includes(name)) {
      if (this.humanTurn) return false;
      if (name === 'coverage' && Object.hasOwn(COVERAGES, value)) this.defensiveCall = value;
      else if (name === 'adjustment' && Object.hasOwn(DEFENSIVE_ADJUSTMENTS, value)) this.defensiveAdjustment = value;
      else return false;
      configureDefense(this.play, this.defensiveCall, this.defensiveAdjustment);
      this.play.defenders.forEach(defender => defender.reset());
      return true;
    }
    if (!this.humanTurn) return false;
    if (name === 'formation' && (value === 'play' || Object.hasOwn(FORMATIONS, value))) {
      this.selectedFormation = value; this.configurePlay(); return true;
    }
    if (name === 'motion' && ['none', 'left', 'right'].includes(value)) {
      this.selectedMotion = value; this.play.execution.startMotion(value); return true;
    }
    if (['kneel', 'spike'].includes(name)) return this.clockPlay(name);
    return false;
  }
  clockPlay(kind) {
    if (!['kneel', 'spike'].includes(kind) || this.rules.phase !== 'ready' || this.rules.clock <= 0) return false;
    if (!this.snap()) return false;
    this.rules.tick(kind === 'kneel' ? 1 : 2);
    if (kind === 'kneel') this.play.qb.x = this.play.lineOfScrimmage - this.play.field.yard;
    this.play.finish(kind.toUpperCase());
    this.rules.completePlay({ type: kind.toUpperCase(), spot: this.rules.spot });
    this.phaseAge = 0;
    return true;
  }
  audible(direction) {
    const index = PLAYBOOK.findIndex(call => call.id === this.selectedPlayId);
    return this.selectPlay(PLAYBOOK[(index + direction + PLAYBOOK.length) % PLAYBOOK.length].id);
  }
  advance() {
    const r = this.rules;
    if (r.phase === 'kickMeter') { this.lockKick(); return; }
    if (r.phase === 'ready') { if (this.humanTurn) this.snap(); }
    else if (r.phase === 'extraPoint') { if (this.humanTurn) this.kick('extraPoint'); }
    else if (['result', 'halftime', 'quarterBreak'].includes(r.phase)) {
      r.continue();
      if (r.phase === 'ready') this.prepare();
      this.phaseAge = 0;
    }
  }
  snap() { if (this.rules.beginPlay()) { this.play.snap(); return true; } return false; }
  beginKickoff() {
    const r = this.rules;
    r.clockRunning = false; r.kick = null;
    this.play.configure(35, r.possession === 'home' ? 'away' : 'home');
    this.play.phase = 'dead'; this.play.isKickoff = true;
    if (r.possession === 'away') this.startMeter('kickoff');
    else this.returns.launch(r, { power: .5, accuracy: .12 });
  }
  startMeter(kind) {
    if (kind === 'extraPoint') this.play.configure(85, this.rules.possession, 100);
    this.play.controlled = this.play.qb;
    this.meter = new KickMeter(kind, this.rules.phase);
    this.rules.phase = 'kickMeter'; this.rules.clockRunning = false;
    const side = kind === 'kickoff' ? 'home' : this.rules.possession;
    const specialist = this.rules.specialists?.[side]?.[kind === 'punt' ? 'punter' : 'kicker'];
    if (specialist) this.play.qb.bindData(specialist);
    this.play.phase = 'dead'; this.play.ball.attach(this.play.qb);
    return true;
  }
  lockKick() {
    if (this.rules.phase !== 'kickMeter' || !this.meter) return;
    const result = this.meter.lock();
    if (result) this.releaseKick(result);
  }
  releaseKick(result) {
    const { kind, previousPhase } = this.meter;
    this.meter = null;
    this.rules.phase = previousPhase;
    if (kind === 'kickoff') this.returns.launch(this.rules, result);
    else this.kick(kind, result);
  }
  kick(kind, execution = null) {
    const r = this.rules;
    const valid = kind === 'extraPoint' ? r.phase === 'extraPoint' : r.phase === 'ready' && r.clock > 0 && ['fieldGoal', 'punt'].includes(kind);
    if (!valid) return false;
    if (this.humanTurn && !execution) return this.startMeter(kind);
    if (!r.beginKick(kind, execution)) return false;
    const p = this.play;
    const extra = kind === 'extraPoint';
    if (extra) p.configure(85, this.rules.possession, 100);
    const specialist = r.specialists?.[r.possession]?.[kind === 'punt' ? 'punter' : 'kicker'];
    if (specialist) p.qb.bindData(specialist);
    p.phase = 'dead'; p.carrier = null;
    const target = kind === 'punt' ? { x: Math.min(p.field.width - 20, p.field.endZone + this.rules.kick.landing * p.field.yard), y: p.field.height / 2 } : { x: p.field.width - 20, y: p.field.height / 2 + (this.rules.kick.good ? 0 : 140) };
    p.ball.throw(p.qb, target, 3);
    this.phaseAge = 0; return true;
  }
  action(action, movement, point) {
    const depths = { throwAuto: 'auto', throwShort: 'short', throwMedium: 'medium', throwDeep: 'deep' };
    if (Object.hasOwn(depths, action)) { this.tactic('throwDepth', depths[action]); return; }
    if (['timeout', 'kneel', 'spike'].includes(action)) { this.tactic(action); return; }
    if (action === 'motionNext') { this.tactic('motion', ['none', 'left', 'right'][(['none', 'left', 'right'].indexOf(this.selectedMotion) + 1) % 3]); return; }
    if (action === 'audiblePrevious' || action === 'audibleNext') { this.audible(action === 'audibleNext' ? 1 : -1); return; }
    if (action === 'snap' || action === 'reset') { if (action === 'snap' || this.rules.phase !== 'live') this.advance(); return; }
    if (!this.humanTurn) return;
    if (action === 'fieldGoal') this.kick('fieldGoal');
    if (action === 'punt') this.kick('punt');
    if (!['live', 'return'].includes(this.rules.phase)) return;
    if (action === 'throw') this.play.throw(point, this.throwDepth);
    if (action === 'handoff') this.play.handoff();
    if (action === 'juke') this.play.juke(movement);
  }
  update(dt, movement) {
    const r = this.rules;
    if (r.phase !== this.lastPhase) { this.phaseAge = 0; this.lastPhase = r.phase; }
    this.phaseAge += dt;
    r.tick(dt);
    const cpuClock = clockDecision(r, 'away');
    if (cpuClock.timeout) { r.timeout('away'); this.phaseAge = 0; }
    if (this.humanTurn && this.tempo === 'chew' && ['ready', 'result'].includes(r.phase) && r.clockRunning && !r.next && !r.kickoffPending && r.playClock > 5) {
      r.tick(Math.min(dt * 5, r.playClock - 5, r.clock));
    }
    if (r.phase === 'ready') this.play.update(dt);
    if (this.humanTurn && this.tempo === 'hurry' && r.phase === 'result' && !r.next && !r.kickoffPending && r.clock > 0 && this.phaseAge > .35) this.advance();
    if (r.phase === 'kickMeter') {
      const result = this.meter.update(dt); if (result) this.releaseKick(result);
    } else if (r.phase === 'kickoff') {
      this.returns.updateFlight(dt, r);
    } else if (r.phase === 'return') {
      this.play.update(dt, this.humanTurn ? movement : this.opponent.movement(this.play), !this.humanTurn);
      r.spot = Math.max(0, Math.min(100, this.play.outcome.spot));
      if (this.play.phase === 'dead') this.returns.finish(r);
    } else if (r.phase === 'live') {
      this.play.update(dt, this.humanTurn ? movement : this.opponent.movement(this.play), !this.humanTurn);
      if (this.play.phase === 'dead') r.completePlay(this.play.outcome);
    } else if (r.phase === 'kick') {
      this.play.ball.update(dt);
      if (this.play.ball.landed) { this.play.ball.mode = 'ground'; r.completeKick(); }
    } else if (!this.humanTurn) {
      const snapDelay = cpuClock.tempo === 'hurry' ? .8 : cpuClock.tempo === 'chew' && r.clockRunning ? Infinity : 4;
      if (r.phase === 'ready' && (this.phaseAge > snapDelay || cpuClock.tempo === 'chew' && r.clockRunning && r.playClock <= 5)) {
        const kneel = r.quarter === 4 && r.score.away > r.score.home && r.spot > 2 && r.down < 4 && r.clock <= Math.max(0, (4 - r.down) * 38 - r.timeouts.home * 25);
        const spike = [2, 4].includes(r.quarter) && r.clock < 12 && r.clockRunning && r.score.away <= r.score.home && r.timeouts.away === 0 && r.down < 4;
        if (kneel || spike) this.clockPlay(kneel ? 'kneel' : 'spike');
        else { const call = this.opponent.call(r); if (call === 'snap') this.snap(); else this.kick(call); }
      } else if (r.phase === 'extraPoint' && this.phaseAge > 1.3) this.kick('extraPoint');
      else if (r.phase === 'result' && this.phaseAge > 2.5) this.advance();
    }
  }
}
