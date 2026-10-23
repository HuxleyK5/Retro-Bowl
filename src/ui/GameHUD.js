

import { getBeginnerGuide } from '../game/BeginnerGuide.js';
import { isBeginnerMode } from './BeginnerMode.js';

export const formatClock = seconds => {
  const value = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
};
const names = { kickMeter: 'KICK METER', kickoff: 'KICKOFF', return: 'KICK RETURN', ready: 'PRE-SNAP', live: 'LIVE PLAY', result: 'WHISTLE', extraPoint: 'EXTRA POINT', kick: 'KICK IN FLIGHT', halftime: 'HALFTIME', final: 'FINAL', pregame: 'MATCH DAY', quarterBreak: 'END OF QUARTER' };

export class GameHUD {
  constructor(match) {
    this.match = match; this.screenPhase = null;
    this.elements = Object.fromEntries(['home-score', 'away-score', 'quarter', 'game-clock', 'play-clock', 'down-distance', 'ball-spot', 'possession', 'state-label', 'play-notice', 'play-result', 'player-label', 'position-label', 'juke-label', 'snap', 'field-goal', 'punt', 'match-screen', 'screen-eyebrow', 'screen-title', 'screen-copy', 'screen-summary', 'screen-action', 'match-options', 'home-team', 'away-team', 'home-timeouts', 'away-timeouts', 'home-timeout-status', 'away-timeout-status', 'home-score-change', 'away-score-change', 'timeout-count', 'clock-event', 'scoreboard-announcement'].map(id => [id, document.getElementById(id)]));
    this.scoreboard = document.querySelector('.match-scoreboard');
    this.clockPanel = document.querySelector('.score-time'); this.playClockPanel = document.querySelector('.play-clock-label');
    this.scoreboardState = null; this.clockMilestones = new Set();
    this.scoreboard.addEventListener('animationend', event => {
      if (event.animationName === 'score-lift') event.target.closest('.score-team')?.classList.remove('score-updated');
      if (event.animationName === 'clock-mark') this.clockPanel.classList.remove('clock-cued');
      if (event.animationName === 'play-clock-mark') this.playClockPanel.classList.remove('play-clock-cued');
    });
  }
  text(id, value) { const el = this.elements[id]; if (el.textContent !== String(value)) el.textContent = value; }
  cue(element, className, counter) {
    // Restart only for a new match event, never for an ordinary render frame.
    if (element.classList.contains(className)) { element.classList.remove(className); void element.offsetWidth; }
    element.classList.add(className);
    element.dataset[counter] = String(Number(element.dataset[counter] || 0) + 1);
  }
  clearScoreboardCues() {
    for (const team of ['home', 'away']) this.elements[`${team}-team`].classList.remove('score-updated');
    this.clockPanel.classList.remove('clock-cued'); this.playClockPanel.classList.remove('play-clock-cued');
  }
  updateScoreboard(r, paused, playClockActive) {
    const e = this.elements, previous = this.scoreboardState;
    const current = { home: r.score.home, away: r.score.away, score: r.score, quarter: r.quarter, phase: r.phase,
      clock: r.clock, playClock: r.playClock, playClockActive, playNumber: r.playNumber, possession: r.possession,
      homeTimeouts: r.timeouts.home, awayTimeouts: r.timeouts.away, homeName: r.teams.home, awayName: r.teams.away };
    // Rules replaces its score object on reset; identity catches a new 0–0 game
    // even if both the previous and new match happen to be in the same quarter.
    const reset = !previous || previous.score !== current.score || current.home < previous.home || current.away < previous.away
      || current.quarter < previous.quarter || current.playNumber < previous.playNumber
      || current.homeName !== previous.homeName || current.awayName !== previous.awayName;
    this.scoreboard.classList.toggle('hud-paused', !!paused);
    e['play-clock'].classList.toggle('urgent', playClockActive && r.playClock <= 5);
    this.clockPanel.classList.toggle('clock-low', r.clock > 0 && r.clock <= 30 && !['pregame', 'halftime', 'final', 'quarterBreak'].includes(r.phase));
    this.text('timeout-count', `TIMEOUTS YOU ${r.timeouts.home} / CPU ${r.timeouts.away}`);
    for (const team of ['home', 'away']) {
      const count = r.timeouts[team], status = e[`${team}-timeout-status`];
      this.text(`${team}-timeouts`, count);
      const label = `${r.teams[team]}: ${count} timeout${count === 1 ? '' : 's'} remaining`;
      if (status.getAttribute('aria-label') !== label) status.setAttribute('aria-label', label);
      status.querySelectorAll('.timeout-dot').forEach((dot, index) => dot.classList.toggle('available', index < count));
      e[`${team}-team`].classList.toggle('has-ball', r.possession === team);
    }
    e.possession.dataset.team = r.possession; e.possession.title = `${r.teams[r.possession]} has possession`;
    const announcements = [];
    if (reset) {
      this.clearScoreboardCues(); this.clockMilestones.clear(); this.text('clock-event', ''); this.text('scoreboard-announcement', '');
    } else {
      // Reduced-motion cues remain static until the next snap; all other cues
      // clean themselves up through animationend, and pause freezes both.
      if (current.playNumber !== previous.playNumber) this.clearScoreboardCues();
      for (const team of ['home', 'away']) {
        const points = current[team] - previous[team];
        if (points > 0) {
          this.text(`${team}-score-change`, `+${points}`); this.cue(e[`${team}-team`], 'score-updated', 'scoreEvents');
          announcements.push(`${r.teams[team]} scores ${points}. Score: ${r.teams.home} ${r.score.home}, ${r.teams.away} ${r.score.away}.`);
        }
        if (current[`${team}Timeouts`] < previous[`${team}Timeouts`]) announcements.push(`${r.teams[team]} timeout. ${r.timeouts[team]} remaining.`);
      }
      if (current.possession !== previous.possession) announcements.push(`${r.teams[r.possession]} has possession.`);
      if (r.phase === 'halftime' && previous.phase !== 'halftime') announcements.push('Halftime. Three timeouts per team for the second half.');
      let clockEvent = '';
      if (current.quarter !== previous.quarter) clockEvent = r.phase === 'quarterBreak' ? `END Q${r.breakQuarter}` : `QUARTER ${r.quarter}`;
      if (current.phase !== previous.phase && ['halftime', 'final'].includes(r.phase)) clockEvent = r.phase === 'halftime' ? 'HALFTIME' : 'FINAL';
      for (const seconds of [30, 10, 0]) {
        const key = `${r.quarter}:${seconds}`;
        if (current.quarter === previous.quarter && previous.clock > seconds && r.clock <= seconds && !this.clockMilestones.has(key)) {
          this.clockMilestones.add(key); clockEvent = seconds === 0 ? 'TIME EXPIRED' : `${seconds} SECONDS`;
        }
      }
      if (clockEvent) { this.text('clock-event', clockEvent); this.cue(this.clockPanel, 'clock-cued', 'clockEvents'); announcements.push(clockEvent.toLowerCase() + '.'); }
      if (playClockActive && r.playClock <= 5 && previous.playClock > 5) this.cue(this.playClockPanel, 'play-clock-cued', 'clockEvents');
      if (announcements.length) this.text('scoreboard-announcement', announcements.join(' '));
    }
    this.scoreboardState = current;
  }
  update(paused) {
    const r = this.match.rules, p = this.match.play, e = this.elements;
    const beginner = isBeginnerMode(), guide = beginner ? getBeginnerGuide(this.match) : null;
    const coach = document.querySelector('#beginner-coach');
    if (coach) {
      coach.hidden = !beginner;
      if (guide) for (const key of ['goal', 'tip', 'recommendation']) {
        const element = document.getElementById(`beginner-${key}`);
        if (element && element.textContent !== guide[key]) element.textContent = guide[key];
      }
    }
    this.text('home-score', r.score.home); this.text('away-score', r.score.away);
    this.text('quarter', r.phase === 'final' ? 'FINAL' : r.phase === 'halftime' ? 'HALF' : `Q${r.quarter}`);
    this.text('game-clock', formatClock(r.clock));
    const playClockActive = r.phase === 'ready' || (r.phase === 'result' && !r.next && !r.kickoffPending && r.clock > 0);
    this.text('play-clock', playClockActive ? Math.ceil(r.playClock) : '—');
    this.text('down-distance', r.phase === 'extraPoint' || r.kick?.kind === 'extraPoint' ? (beginner ? 'BONUS KICK' : 'PAT') : ['kickoff','return'].includes(r.phase) || (r.phase === 'kickMeter' && this.match.meter?.kind === 'kickoff') ? 'KICKOFF' : beginner ? `TRY ${r.down} OF 4 · ${Math.max(1, Math.ceil(r.yardsToGo - .001))} YD` : r.downLabel);
    this.text('ball-spot', beginner ? `${Math.ceil(100 - r.spot)} yards to score` : r.spotLabel); this.text('possession', beginner ? `${this.match.humanTurn ? 'YOUR' : 'OPPONENT'} BALL →` : `${r.teams[r.possession]} BALL →`);
    this.updateScoreboard(r, paused, playClockActive);
    this.text('state-label', paused ? 'GAME PAUSED' : p.phase === 'loose' ? 'FUMBLE / BALL LOOSE' : `${names[r.phase]}${!this.match.humanTurn && ['ready', 'live', 'kick'].includes(r.phase) ? ' · CPU' : ''}`);
    let notice = r.detail;
    if (r.phase === 'ready') notice = this.match.humanTurn ? `${p.call?.name || 'Offense'} · Q / E audible · SPACE snap · Play clock keeps running` : `${r.teams.away} is calling a play. Watch your defense work.`;
    if (r.phase === 'live') notice = this.match.humanTurn ? p.notice : `${r.teams.away} OFFENSE / Computer-controlled possession`;
    if (r.phase === 'extraPoint') notice = this.match.humanTurn ? 'Untimed extra point · SPACE or the button to kick for +1' : `${r.teams.away} lines up for the extra point.`;
    if (r.phase === 'kick') notice = r.kick.kind === 'punt' ? 'Punt away · No return · Possession changes at the landing spot' : `${r.kick.distance}-yard ${r.kick.kind === 'extraPoint' ? 'extra point' : 'field goal'} attempt…`;
    if (r.phase === 'kickMeter') notice = 'SPACE or click the meter button: lock power, then lock accuracy. ESC pauses.';
    if (r.phase === 'kickoff') notice = 'KICKOFF / Watch the landing spot. Returns start automatically.';
    if (r.phase === 'return') notice = this.match.humanTurn ? p.notice : `${r.teams.away} returning / Watch your coverage team`;
    if (r.phase === 'result') notice = `${r.detail} ${r.clock <= 0 ? 'Period expired.' : ''} SPACE to continue`;
    if (r.phase === 'pregame') notice = 'Choose a quarter length and start your game.';
    if (r.phase === 'halftime') notice = `HALFTIME / Clocks stopped / ${r.teams.away} receives to start the third quarter.`;
    if (r.phase === 'quarterBreak') notice = `END OF QUARTER ${r.breakQuarter} · Possession and downs carry into the next quarter.`;
    if (r.phase === 'final') notice = `FINAL · ${r.teams.home} ${r.score.home} — ${r.score.away} ${r.teams.away} · Start a new game to play again.`;
    if (r.phase === 'ready' && r.detail.includes(' timeout.')) notice = r.detail;
    if (beginner) {
      if (r.phase === 'ready') notice = this.match.humanTurn ? 'Choose a play, then press Start this play or Space. Start before the play clock reaches 0.' : 'Your defense plays automatically. Watch until your team gets the ball.';
      else if (r.phase === 'result') notice = `${r.detail} ${this.match.humanTurn ? 'Press Continue or Space.' : 'Opponent plays automatically.'}`;
      else notice = guide.tip;
      if (paused) notice = 'Game paused. Press Resume when you are ready.';
    }
    this.text('play-notice', notice);
    e['play-result'].hidden = r.phase !== 'result'; this.text('play-result', r.result);
    document.querySelector('.line-legend').hidden = !!p.isKickoff;
    this.text('player-label', r.phase === 'kickMeter' ? `YOU / KICKER #${p.qb.number} ${p.qb.data.name}` : `${this.match.humanTurn ? 'YOU' : 'CPU'} / ${p.controlled.number} ${p.controlled.data.name}`);
    this.text('position-label', beginner ? 'MOVE RIGHT TO SCORE →' : `BALL ${r.spotLabel}`);
    this.text('juke-label', p.phase === 'loose' ? 'RECOVER THE BALL' : !this.match.humanTurn ? 'WATCHING DEFENSE' : p.controlled.jukeCooldown > 0 ? `${beginner ? 'DODGE' : 'JUKE'} ${p.controlled.jukeCooldown.toFixed(1)}s` : beginner ? 'J / DODGE READY' : 'JUKE READY');
    e.snap.hidden = !['ready', 'result', 'extraPoint'].includes(r.phase) || (!this.match.humanTurn && r.phase !== 'result');
    e.snap.disabled = paused;
    this.text('snap', r.phase === 'result' ? 'CONTINUE →' : r.phase === 'extraPoint' ? (beginner ? 'BONUS KICK / 1 POINT →' : 'KICK EXTRA POINT →') : beginner ? 'START PLAY →' : 'SNAP BALL →');
    for (const id of ['field-goal', 'punt']) { e[id].hidden = r.phase !== 'ready' || !this.match.humanTurn; e[id].disabled = paused; }
    this.text('field-goal', beginner ? `KICK FOR 3 / ${r.fieldGoalDistance} YARDS` : `F / FG ${r.fieldGoalDistance} YD / TIMING METER`);
    this.text('punt', beginner ? 'KICK AWAY / GIVE UP THE BALL' : 'K · PUNT');
    e['field-goal'].title = beginner ? 'Field goal: kick through the posts for 3 points. A miss gives the opponent the ball.' : 'F / Field goal';
    e.punt.title = beginner ? 'Punt: give up the ball and kick it farther away from your end zone. Scores no points.' : 'K / Punt';
    e['field-goal'].classList.toggle('coach-suggested', beginner && guide.suggestedAction === 'fieldGoal');
    e.punt.classList.toggle('coach-suggested', beginner && guide.suggestedAction === 'punt');
    this.updateScreen(r, paused);
  }
  updateScreen(r, paused) {
    const e = this.elements;
    const beginner = isBeginnerMode();
    const show = ['pregame', 'halftime', 'quarterBreak', 'final'].includes(r.phase);
    e['match-screen'].hidden = !show;
    if (!show) { this.screenPhase = null; return; }
    e['screen-action'].disabled = paused;
    if (this.screenPhase === r.phase && this.screenBeginner === beginner) return;
    this.screenPhase = r.phase;
    this.screenBeginner = beginner;
    e['match-options'].hidden = r.phase !== 'pregame';
    const winner = r.score.home === r.score.away ? 'Tie game.' : r.score.home > r.score.away ? `${r.teams.home} wins.` : `${r.teams.away} wins.`;
    this.text('screen-eyebrow', r.phase === 'pregame' ? `${r.teams.home} vs ${r.teams.away}` : r.phase === 'final' ? 'REGULATION FINAL' : 'TAKE A BREATHER');
    this.text('screen-title', r.phase === 'pregame' ? 'Four quarters. Your game.' : r.phase === 'halftime' ? 'Halftime.' : r.phase === 'final' ? winner : `End of quarter ${r.breakQuarter}.`);
    this.text('screen-copy', r.phase === 'pregame' ? `You run ${r.teams.home}'s offense. ${r.teams.away} plays automatically. Return the opening kickoff, then call your offense.` : r.phase === 'halftime' ? `${r.teams.away} receives the second-half kickoff. You kick after the break.` : r.phase === 'final' ? 'The final whistle. Every yard counted.' : `${r.teams[r.possession]} keeps the ball. ${r.downLabel}, ${r.spotLabel.toLowerCase()}.`);
    if (beginner) this.text('screen-copy', r.phase === 'pregame' ? 'Run or pass toward the right end zone. Reach the yellow line within 4 tries to earn 4 more. Touchdowns score 6 points; field goal kicks score 3. Your defense plays automatically.' : r.phase === 'halftime' ? 'Two quarters down, two to go. You kick the ball to the other team to start the second half.' : r.phase === 'final' ? 'Return to your team to prepare for the next game.' : `${this.match.humanTurn ? 'Your team keeps' : 'The other team keeps'} the ball. Next is try ${r.down} of 4, with ${Math.max(1, Math.ceil(r.yardsToGo - .001))} yards to the target line.`);
    this.text('screen-action', r.phase === 'pregame' ? 'START GAME →' : r.phase === 'final' ? 'NEW GAME →' : r.phase === 'halftime' ? 'START SECOND HALF →' : 'NEXT QUARTER →');
    e['screen-summary'].hidden = r.phase === 'pregame';
    if (r.phase !== 'pregame') {
      e['screen-summary'].innerHTML = `<table class="line-score"><thead><tr><th>TEAM</th><th>1</th><th>2</th><th>3</th><th>4</th><th>T</th></tr></thead><tbody>${['home', 'away'].map(team => `<tr><th>${r.teams[team]}</th>${r.byQuarter[team].map(score => `<td>${score}</td>`).join('')}<td>${r.score[team]}</td></tr>`).join('')}</tbody></table>`;
    }
    if (!paused) e['screen-action'].focus({ preventScroll: true });
  }
}
