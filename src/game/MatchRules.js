export const TEAMS = { home: 'NORTHSIDE', away: 'EASTBANK' };

const other = team => team === 'home' ? 'away' : 'home';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

const ordinals = ['1ST', '2ND', '3RD', '4TH'];



// Match rules use yards from the possessing team's own goal (0..100).

// This keeps possession reversals separate from the field's pixel coordinates.

export class MatchRules {

  constructor(random = Math.random) { this.random = random; this.teams = { ...TEAMS }; this.reset(); }

  reset() {

    this.phase = 'pregame'; this.quarter = 1; this.quarterSeconds = 120; this.clock = 120;

    this.playClock = 40; this.clockRunning = false; this.possession = 'home';

    this.score = { home: 0, away: 0 }; this.byQuarter = { home: [0, 0, 0, 0], away: [0, 0, 0, 0] };

    this.spot = 25; this.down = 1; this.firstDownLine = 35;

    this.result = ''; this.detail = ''; this.next = null; this.kick = null; this.playNumber = 0;

  }

  start(seconds = 120) {

    this.reset(); this.quarterSeconds = clamp(Number(seconds) || 120, 10, 900); this.clock = this.quarterSeconds;

    this.phase = 'ready'; this.detail = `Opening kickoff: touchback. ${this.teams.home} starts at its own 25.`;

  }

  get yardsToGo() { return Math.max(0, this.firstDownLine - this.spot); }

  get downLabel() { return `${ordinals[this.down - 1]} & ${this.firstDownLine >= 100 ? 'GOAL' : Math.max(1, Math.ceil(this.yardsToGo - .001))}`; }

  get spotLabel() { return this.spot === 50 ? 'MIDFIELD' : `${this.spot < 50 ? 'OWN' : 'OPP'} ${Math.round(this.spot < 50 ? this.spot : 100 - this.spot)}`; }

  get fieldGoalDistance() { return Math.round(100 - this.spot + 17); }

  get fieldGoalChance() { const k = this.specialists?.[this.possession]?.kicker; const boost = k ? (k.ratings.kickAccuracy-80)*.004+(k.ratings.kickPower-80)*.002 : 0; return clamp(.98 + boost - Math.max(0, this.fieldGoalDistance - 30) * .017 - Math.max(0, this.fieldGoalDistance - 50) * .022, 0, .98); }

  addScore(team, points) { this.score[team] += points; this.byQuarter[team][this.quarter - 1] += points; }

  newSeries(spot) { this.spot = clamp(spot, .5, 99.5); this.down = 1; this.firstDownLine = Math.min(100, this.spot + 10); }

  changePossession(spot = 25) { this.possession = other(this.possession); this.newSeries(spot); this.clockRunning = false; }

  beginPlay() {

    if (this.phase !== 'ready' || this.clock <= 0) return false;

    this.phase = 'live'; this.clockRunning = true; this.playNumber++; return true;

  }

  tick(dt) {

    if (['pregame', 'final', 'halftime', 'quarterBreak', 'extraPoint'].includes(this.phase)) return;

    if (this.clockRunning) this.clock = Math.max(0, this.clock - dt);

    if (this.phase === 'ready' || (this.phase === 'result' && !this.next)) {

      // Period expiry takes precedence over a play-clock violation.

      if (this.clock <= 0) { if (this.phase === 'ready') this.advanceQuarter(); return; }

      this.playClock = Math.max(0, this.playClock - dt);

      if (this.playClock <= .00001) {

        const penalty = Math.min(5, this.spot / 2);

        this.spot -= penalty; this.clockRunning = false; this.phase = 'result'; this.next = null;

        this.playClock = 25;

        this.result = 'DELAY OF GAME'; this.detail = `${penalty.toFixed(penalty % 1 ? 1 : 0)}-yard penalty. Down remains ${ordinals[this.down - 1]}.`;

      }

    }

  }

  completePlay({ type, spot }) {

    if (this.phase !== 'live') return false;

    const start = this.spot;

    const end = Number.isFinite(spot) ? Math.round(spot * 10) / 10 : start;

    this.phase = 'result'; this.next = null; this.result = type; this.detail = '';

    this.playClock = 40;

    if (type === 'INTERCEPTION') {

      if (end <= 0) {

        this.possession = other(this.possession); this.touchdown('INTERCEPTION · DEFENSIVE TOUCHDOWN');

      } else {

        this.changePossession(end >= 100 ? 20 : 100 - end);

        this.result = 'INTERCEPTION'; this.detail = `${this.teams[this.possession]} takes over at ${this.spotLabel.toLowerCase()}${end >= 100 ? ' (touchback)' : ''}.`;

      }

      return true;

    }

    if (type === 'TOUCHDOWN' || (end >= 100 && type !== 'INCOMPLETE')) { this.touchdown(); return true; }

    if (type === 'SAFETY' || (end <= 0 && type !== 'INCOMPLETE')) {

      this.addScore(other(this.possession), 2); this.changePossession(25);

      this.result = 'SAFETY · +2'; this.detail = `${this.teams[this.possession]} receives the free kick at its own 25.`; return true;

    }

    const incomplete = type === 'INCOMPLETE';

    this.spot = incomplete ? start : clamp(end, .5, 99.5);

    const gain = Math.round((this.spot - start) * 10) / 10;

    this.clockRunning = !incomplete && type !== 'OUT OF BOUNDS';

    const amount = Math.abs(gain); const unit = amount === 1 ? 'yard' : 'yards';

    this.result = incomplete ? 'INCOMPLETE' : gain < 0 ? (type === 'SACK' ? 'SACK' : 'TACKLE FOR LOSS') : gain === 0 ? 'NO GAIN' : `Gain of ${gain} ${unit}`;

    this.detail = incomplete ? 'Pass falls incomplete. The clock stops.' : gain < 0 ? `Loss of ${amount} ${unit}.` : `${type === 'OUT OF BOUNDS' ? 'Out of bounds. Clock stopped.' : 'Runner down in bounds. Clock running.'}`;

    if (this.spot >= this.firstDownLine - .001) {

      this.newSeries(this.spot); this.result = `FIRST DOWN · Gain of ${gain} yards`;

    } else if (this.down === 4) {

      this.changePossession(100 - this.spot); this.result = 'TURNOVER ON DOWNS';

      this.detail = `${this.teams[this.possession]} takes over at ${this.spotLabel.toLowerCase()}.`;

    } else this.down++;

    return true;

  }

  touchdown(label = 'TOUCHDOWN') {

    this.addScore(this.possession, 6); this.clockRunning = false; this.result = label;

    this.detail = `${this.teams[this.possession]} scores six. Extra point to follow.`; this.next = 'extraPoint';

  }

  beginKick(kind) {

    const extra = kind === 'extraPoint';

    if (extra ? this.phase !== 'extraPoint' : this.phase !== 'ready' || !['fieldGoal', 'punt'].includes(kind) || this.clock <= 0) return false;

    this.kick = { kind, from: this.spot, chance: extra ? clamp(.94 + ((this.specialists?.[this.possession]?.kicker.ratings.kickAccuracy ?? 80)-80)*.003, .5, .99) : this.fieldGoalChance, distance: extra ? 33 : this.fieldGoalDistance };

    if (kind === 'punt') this.kick.landing = Math.round(this.spot + 36 + ((this.specialists?.[this.possession]?.punter.ratings.kickPower ?? 80)-80)*.3 + Math.floor(this.random() * 16));

    else this.kick.good = this.random() < this.kick.chance;

    this.phase = 'kick'; this.clockRunning = !extra; this.playNumber++; return true;

  }

  completeKick() {

    if (this.phase !== 'kick') return false;

    const { kind, from, good, distance, landing } = this.kick;

    this.phase = 'result'; this.clockRunning = false; this.next = null;

    this.playClock = 40;

    if (kind === 'punt') {

      this.changePossession(landing >= 100 ? 20 : 100 - landing);

      this.result = landing >= 100 ? 'PUNT · TOUCHBACK' : `PUNT · ${landing - from} YARDS`;

      this.detail = `${this.teams[this.possession]} takes over at ${this.spotLabel.toLowerCase()}. No return.`;

    } else {

      if (good) this.addScore(this.possession, kind === 'extraPoint' ? 1 : 3);

      this.result = `${kind === 'extraPoint' ? 'EXTRA POINT' : 'FIELD GOAL'} ${good ? 'GOOD' : 'MISSED'}`;

      this.detail = `${distance}-yard attempt${good ? ` · +${kind === 'extraPoint' ? 1 : 3} point${kind === 'extraPoint' ? '' : 's'}` : ' · no score'}.`;

      // Missed field goals turn over at the kick spot (7 yards behind the LOS),

      // or the receiving team's 20, whichever gives them better field position.

      this.changePossession(kind === 'extraPoint' || good ? 25 : Math.max(20, 100 - (from - 7)));

      this.detail += ` ${this.teams[this.possession]} ball, ${this.spotLabel.toLowerCase()}.`;

    }

    return true;

  }

  continue() {

    if (this.phase === 'halftime') {

      this.quarter = 3; this.clock = this.quarterSeconds; this.possession = 'away'; this.newSeries(25);

      this.clockRunning = false; this.ready(); this.detail = `Second-half kickoff: ${this.teams.away} receives at its own 25.`; return true;

    }

    if (this.phase === 'quarterBreak') { this.ready(); return true; }

    if (this.phase !== 'result') return false;

    if (this.next === 'extraPoint') { this.phase = 'extraPoint'; this.next = null; this.clockRunning = false; return true; }

    if (this.clock <= 0) this.advanceQuarter(); else this.ready(true);

    return true;

  }

  ready(preserveClock = false) { this.phase = 'ready'; if (!preserveClock) this.playClock = 40; this.result = ''; this.kick = null; }

  advanceQuarter() {

    this.clockRunning = false;

    if (this.quarter === 4) { this.phase = 'final'; return; }

    if (this.quarter === 2) { this.phase = 'halftime'; return; }

    this.breakQuarter = this.quarter; this.quarter++; this.clock = this.quarterSeconds; this.phase = 'quarterBreak';

  }

}
