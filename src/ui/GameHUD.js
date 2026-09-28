

export const formatClock = seconds => {
  const value = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
};
const names = { ready: 'PRE-SNAP', live: 'LIVE PLAY', result: 'WHISTLE', extraPoint: 'EXTRA POINT', kick: 'KICK IN FLIGHT', halftime: 'HALFTIME', final: 'FINAL', pregame: 'MATCH DAY', quarterBreak: 'END OF QUARTER' };

export class GameHUD {
  constructor(match) {
    this.match = match; this.screenPhase = null;
    this.elements = Object.fromEntries(['home-score', 'away-score', 'quarter', 'game-clock', 'play-clock', 'down-distance', 'ball-spot', 'possession', 'state-label', 'play-notice', 'play-result', 'player-label', 'position-label', 'juke-label', 'snap', 'field-goal', 'punt', 'match-screen', 'screen-eyebrow', 'screen-title', 'screen-copy', 'screen-summary', 'screen-action', 'match-options'].map(id => [id, document.getElementById(id)]));
  }
  text(id, value) { const el = this.elements[id]; if (el.textContent !== String(value)) el.textContent = value; }
  update(paused) {
    const r = this.match.rules, p = this.match.play, e = this.elements;
    this.text('home-score', r.score.home); this.text('away-score', r.score.away);
    this.text('quarter', r.phase === 'final' ? 'FINAL' : r.phase === 'halftime' ? 'HALF' : `Q${r.quarter}`);
    this.text('game-clock', formatClock(r.clock));
    this.text('play-clock', (r.phase === 'ready' || (r.phase === 'result' && !r.next && r.clock > 0)) ? Math.ceil(r.playClock) : '—');
    e['play-clock'].classList.toggle('urgent', r.playClock <= 5);
    this.text('down-distance', r.phase === 'extraPoint' || r.kick?.kind === 'extraPoint' ? 'PAT' : r.downLabel);
    this.text('ball-spot', r.spotLabel); this.text('possession', `${r.teams[r.possession]} BALL →`);
    document.getElementById('home-team').classList.toggle('has-ball', r.possession === 'home');
    document.getElementById('away-team').classList.toggle('has-ball', r.possession === 'away');
    this.text('state-label', paused ? 'GAME PAUSED' : `${names[r.phase]}${!this.match.humanTurn && ['ready', 'live', 'kick'].includes(r.phase) ? ' · CPU' : ''}`);
    let notice = r.detail;
    if (r.phase === 'ready') notice = this.match.humanTurn ? `${p.call?.name || 'Offense'} · Q / E audible · SPACE snap · Play clock keeps running` : `${r.teams.away} is calling a play. Watch your defense work.`;
    if (r.phase === 'live') notice = this.match.humanTurn ? p.notice : `${r.teams.away} OFFENSE / Computer-controlled possession`;
    if (r.phase === 'extraPoint') notice = this.match.humanTurn ? 'Untimed extra point · SPACE or the button to kick for +1' : `${r.teams.away} lines up for the extra point.`;
    if (r.phase === 'kick') notice = r.kick.kind === 'punt' ? 'Punt away · No return · Possession changes at the landing spot' : `${r.kick.distance}-yard ${r.kick.kind === 'extraPoint' ? 'extra point' : 'field goal'} attempt…`;
    if (r.phase === 'result') notice = `${r.detail} ${r.clock <= 0 ? 'Period expired.' : ''} SPACE to continue`;
    if (r.phase === 'pregame') notice = 'Choose a quarter length and start your game.';
    if (r.phase === 'halftime') notice = `HALFTIME / Clocks stopped / ${r.teams.away} receives to start the third quarter.`;
    if (r.phase === 'quarterBreak') notice = `END OF QUARTER ${r.breakQuarter} · Possession and downs carry into the next quarter.`;
    if (r.phase === 'final') notice = `FINAL · ${r.teams.home} ${r.score.home} — ${r.score.away} ${r.teams.away} · Start a new game to play again.`;
    this.text('play-notice', notice);
    e['play-result'].hidden = r.phase !== 'result'; this.text('play-result', r.result);
    this.text('player-label', `${this.match.humanTurn ? 'YOU' : 'CPU'} / ${p.controlled.number} ${p.controlled.data.name}`);
    this.text('position-label', `BALL ${r.spotLabel}`);
    this.text('juke-label', !this.match.humanTurn ? 'WATCHING DEFENSE' : p.controlled.jukeCooldown > 0 ? `JUKE ${p.controlled.jukeCooldown.toFixed(1)}s` : 'JUKE READY');
    e.snap.hidden = !['ready', 'result', 'extraPoint'].includes(r.phase) || (!this.match.humanTurn && r.phase !== 'result');
    e.snap.disabled = paused;
    this.text('snap', r.phase === 'result' ? 'CONTINUE →' : r.phase === 'extraPoint' ? 'KICK EXTRA POINT →' : 'SNAP BALL →');
    for (const id of ['field-goal', 'punt']) { e[id].hidden = r.phase !== 'ready' || !this.match.humanTurn; e[id].disabled = paused; }
    this.text('field-goal', `F · FG ${r.fieldGoalDistance} YD / ${Math.round(r.fieldGoalChance * 100)}%`);
    this.updateScreen(r, paused);
  }
  updateScreen(r, paused) {
    const e = this.elements;
    const show = ['pregame', 'halftime', 'quarterBreak', 'final'].includes(r.phase);
    e['match-screen'].hidden = !show;
    if (!show) { this.screenPhase = null; return; }
    e['screen-action'].disabled = paused;
    if (this.screenPhase === r.phase) return;
    this.screenPhase = r.phase;
    e['match-options'].hidden = r.phase !== 'pregame';
    const winner = r.score.home === r.score.away ? 'Tie game.' : r.score.home > r.score.away ? `${r.teams.home} wins.` : `${r.teams.away} wins.`;
    this.text('screen-eyebrow', r.phase === 'pregame' ? `${r.teams.home} vs ${r.teams.away}` : r.phase === 'final' ? 'REGULATION FINAL' : 'TAKE A BREATHER');
    this.text('screen-title', r.phase === 'pregame' ? 'Four quarters. Your game.' : r.phase === 'halftime' ? 'Halftime.' : r.phase === 'final' ? winner : `End of quarter ${r.breakQuarter}.`);
    this.text('screen-copy', r.phase === 'pregame' ? `You run ${r.teams.home}'s offense. ${r.teams.away} plays automatically. Opening kickoff: your ball at the 25.` : r.phase === 'halftime' ? `${r.teams.away} receives the second-half kickoff. Both clocks are stopped.` : r.phase === 'final' ? 'The final whistle. Every yard counted.' : `${r.teams[r.possession]} keeps the ball. ${r.downLabel}, ${r.spotLabel.toLowerCase()}.`);
    this.text('screen-action', r.phase === 'pregame' ? 'START GAME →' : r.phase === 'final' ? 'NEW GAME →' : r.phase === 'halftime' ? 'START SECOND HALF →' : 'NEXT QUARTER →');
    e['screen-summary'].hidden = r.phase === 'pregame';
    if (r.phase !== 'pregame') {
      e['screen-summary'].innerHTML = `<table class="line-score"><thead><tr><th>TEAM</th><th>1</th><th>2</th><th>3</th><th>4</th><th>T</th></tr></thead><tbody>${['home', 'away'].map(team => `<tr><th>${r.teams[team]}</th>${r.byQuarter[team].map(score => `<td>${score}</td>`).join('')}<td>${r.score[team]}</td></tr>`).join('')}</tbody></table>`;
    }
    if (!paused) e['screen-action'].focus({ preventScroll: true });
  }
}
