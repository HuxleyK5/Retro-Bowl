import { FORMATIONS } from '../football/Playbook.js';
import { COVERAGES, DEFENSIVE_ADJUSTMENTS, THROW_DEPTHS, matchupAdvice } from '../football/Tactics.js';
import { formatClock } from './GameHUD.js';
import { isBeginnerMode } from './BeginnerMode.js';

const phases = new Set(['ready', 'live', 'result']);
const option = (value, name) => `<option value="${value}">${name}</option>`;

/** Sideline controls stay mounted so keyboard focus survives the animation loop. */
export class StrategyPanel {
  constructor(root, match, onAction) {
    this.root = typeof root === 'string' ? document.querySelector(root) : root;
    this.match = match;
    this.onAction = onAction;
    this.root.classList.add('strategy-panel');
    this.root.setAttribute('aria-label', 'Play calling and clock management');
    this.root.innerHTML = `
      <div class="strategy-heading"><h2>SIDELINE / PLAY CALLING</h2><span id="strategy-phase"></span></div>
      <div class="strategy-scout">
        <div class="strategy-look"><span id="strategy-look-label">DEFENSIVE LOOK</span><strong id="strategy-look"></strong></div>
        <p id="strategy-advice"></p>
      </div>
      <div class="strategy-offense" data-strategy-side="offense">
        <div class="strategy-alignments">
          <label for="strategy-formation">FORMATION<select id="strategy-formation" data-strategy="formation" aria-describedby="strategy-alignment-help">${option('play', 'Play default')}${Object.entries(FORMATIONS).map(([id, formation]) => option(id, formation.name)).join('')}</select></label>
          <label for="strategy-motion">MOTION / M<select id="strategy-motion" data-strategy="motion" aria-describedby="strategy-alignment-help">${option('none', 'None')}${option('left', 'Receiver left')}${option('right', 'Receiver right')}</select></label>
          <p id="strategy-alignment-help">Change receiver alignments before the snap. <span>Q / E changes the play.</span></p>
        </div>
        <fieldset class="strategy-depth"><legend>THROW DEPTH <span>0 / 1 / 2 / 3</span></legend><div class="strategy-depth-buttons">${Object.entries(THROW_DEPTHS).map(([id, depth]) => `<button type="button" data-strategy="throwDepth" data-value="${id}" aria-pressed="false" title="${depth.description}">${depth.name}<small>${id === 'auto' ? 'MOUSE AIM' : `${depth.yards} YD`}</small></button>`).join('')}</div><p>Choose depth before releasing the pass; aim left or right with the mouse.</p></fieldset>
      </div>
      <div class="strategy-defense" data-strategy-side="defense" hidden>
        <label for="strategy-coverage">COVERAGE<select id="strategy-coverage" data-strategy="coverage">${Object.entries(COVERAGES).map(([id, coverage]) => option(id, coverage.name)).join('')}</select></label>
        <label for="strategy-adjustment">ADJUSTMENT<select id="strategy-adjustment" data-strategy="adjustment" aria-describedby="strategy-defense-help">${Object.entries(DEFENSIVE_ADJUSTMENTS).map(([id, adjustment]) => option(id, adjustment.name)).join('')}</select></label>
        <p id="strategy-defense-help"></p>
      </div>
      <div class="strategy-clock">
        <div class="strategy-situation"><strong id="strategy-situation"></strong><span id="strategy-clock-state"></span><small id="strategy-timeouts"></small></div>
        <label for="strategy-tempo" class="strategy-tempo">TEMPO<select id="strategy-tempo" data-strategy="tempo" aria-describedby="strategy-tempo-help">${option('normal', 'Normal')}${option('hurry', 'Hurry-up')}${option('chew', 'Chew clock')}</select></label>
        <div class="strategy-clock-actions"><button type="button" id="strategy-timeout" data-strategy="timeout" title="T / Call timeout">CALL TIMEOUT</button><button type="button" id="strategy-kneel" data-strategy="kneel" title="Lose a yard and use a down. The game clock keeps running.">KNEEL</button><button type="button" id="strategy-spike" data-strategy="spike" title="Use a down to stop the game clock with an incomplete pass.">SPIKE</button></div>
        <p id="strategy-tempo-help"><span id="strategy-tempo-description"></span><span>Kneel uses a down and keeps the clock running. Spike uses a down and stops it.</span></p>
      </div>`;
    this.details = document.createElement('details'); this.details.id = 'beginner-strategy-options'; this.details.className = 'beginner-strategy-details';
    this.summary = document.createElement('summary'); this.summary.textContent = 'More football options (optional)';
    this.details.append(this.summary, ...this.root.childNodes); this.root.append(this.details);
    this.elements = Object.fromEntries([...this.root.querySelectorAll('[id]')].map(element => [element.id, element]));
    this.controls = [...this.root.querySelectorAll('[data-strategy]')];
    this.root.addEventListener('change', event => {
      const control = event.target.closest('select[data-strategy]');
      if (control && !control.disabled) this.onAction(control.dataset.strategy, control.value);
    });
    this.root.addEventListener('click', event => {
      const control = event.target.closest('button[data-strategy]');
      if (control && !control.disabled) this.onAction(control.dataset.strategy, control.dataset.value);
    });
  }

  text(id, value) {
    const element = this.elements[id];
    if (element.textContent !== String(value)) element.textContent = value;
  }

  update(paused = false) {
    const beginner = isBeginnerMode();
    if (beginner !== this.beginner) {
      this.beginner = beginner; this.details.open = !beginner; this.summary.hidden = !beginner; this.lastKey = null;
    }
    const m = this.match, r = m.rules, p = m.play;
    const visible = phases.has(r.phase);
    this.root.hidden = !visible;
    if (!visible) { this.lastKey = null; return; }
    const human = m.humanTurn;
    const ready = r.phase === 'ready' && r.clock > 0;
    const canChooseOffense = !paused && human && ready;
    const canChooseDefense = !paused && !human && ready;
    const canChooseDepth = !paused && human && (ready || (r.phase === 'live' && p.canThrow));
    const canChooseTempo = !paused && human && (ready || r.phase === 'result' && r.clock > 0 && !r.next && !r.kickoffPending);
    const timeouts = r.timeouts || { home: 3, away: 3 };
    const timeoutLegal = typeof r.canTimeout === 'function' ? r.canTimeout('home') : typeof r.canTimeout === 'boolean' ? r.canTimeout : ['ready', 'result'].includes(r.phase) && r.clock > 0 && r.clockRunning && !r.next && !r.kickoffPending && timeouts.home > 0;
    const coverage = p.coverage || 'man';
    const adjustment = p.defensiveAdjustment || 'balanced';
    const key = JSON.stringify([paused, human, r.phase, ready, canChooseDepth, canChooseTempo, timeoutLegal, timeouts.home, timeouts.away, r.quarter, Math.ceil(r.clock), r.downLabel, r.spotLabel, r.clockRunning, p.call?.id, coverage, adjustment, m.selectedFormation, m.selectedMotion, m.throwDepth, m.tempo, m.defensiveCall, m.defensiveAdjustment]);
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.root.querySelector('[data-strategy-side="offense"]').hidden = !human;
    this.root.querySelector('[data-strategy-side="defense"]').hidden = human;
    this.text('strategy-phase', paused ? 'PAUSED' : r.phase === 'ready' ? (human ? 'PRE-SNAP / YOUR OFFENSE' : 'PRE-SNAP / SET YOUR DEFENSE') : r.phase === 'live' ? 'LIVE / READ THE FIELD' : 'WHISTLE / MANAGE THE CLOCK');
    this.text('strategy-look-label', human ? 'DEFENSIVE LOOK' : 'YOUR DEFENSIVE CALL');
    const shownCoverage = human ? coverage : (m.defensiveCall || 'man');
    const shownAdjustment = human ? adjustment : (m.defensiveAdjustment || 'balanced');
    this.text('strategy-look', `${COVERAGES[shownCoverage]?.name || shownCoverage} / ${DEFENSIVE_ADJUSTMENTS[shownAdjustment]?.name || shownAdjustment}`);
    if (human) {
      const advice = matchupAdvice(p.call, coverage, adjustment);
      this.text('strategy-advice', `${advice.strength} ${advice.risk}`);
    } else {
      this.text('strategy-advice', COVERAGES[shownCoverage]?.description || 'Choose a coverage before the opponent snaps.');
    }
    this.text('strategy-defense-help', `${DEFENSIVE_ADJUSTMENTS[shownAdjustment]?.description || ''} Adjustments lock when the ball is snapped.`);

    const selected = { formation: m.selectedFormation || 'play', motion: m.selectedMotion || 'none', throwDepth: m.throwDepth || 'auto', tempo: m.tempo || 'normal', coverage: m.defensiveCall || 'man', adjustment: m.defensiveAdjustment || 'balanced' };
    for (const control of this.controls) {
      const action = control.dataset.strategy;
      if (control.tagName === 'SELECT' && control.value !== selected[action]) control.value = selected[action];
      if (action === 'throwDepth') control.setAttribute('aria-pressed', String(control.dataset.value === selected.throwDepth));
      control.disabled = action === 'throwDepth' ? !canChooseDepth : action === 'tempo' ? !canChooseTempo : ['coverage', 'adjustment'].includes(action) ? !canChooseDefense : action === 'timeout' ? paused || !timeoutLegal : !canChooseOffense;
    }
    this.elements['strategy-tempo'].parentElement.hidden = !human;
    this.elements['strategy-kneel'].hidden = !human;
    this.elements['strategy-spike'].hidden = !human;
    this.text('strategy-situation', `Q${r.quarter} ${formatClock(r.clock)} / ${r.downLabel} / ${r.spotLabel}`);
    this.text('strategy-clock-state', r.clockRunning ? 'CLOCK RUNNING' : 'CLOCK STOPPED');
    this.text('strategy-timeouts', `TIMEOUTS: YOU ${timeouts.home} / CPU ${timeouts.away} · RESET EACH HALF`);
    this.text('strategy-timeout', `TIMEOUT / ${timeouts.home} LEFT`);
    this.elements['strategy-timeout'].setAttribute('aria-label', `Call timeout, ${timeouts.home} remaining`);
    this.text('strategy-tempo-description', selected.tempo === 'hurry' ? 'Hurry-up: auto line up 0.35s after an ordinary play; you still snap.' : selected.tempo === 'chew' ? 'Chew clock: while the game clock runs, both clocks run at 6× until the play clock reaches 5s.' : 'Normal tempo: choose when to line up and snap.');
    this.elements['strategy-tempo-help'].hidden = !human;
  }
}
