const phases = new Set(['ready', 'live', 'result']);

// Keep the field clear: play selection lives beside the field; only timeout stays here.
export class StrategyPanel {
  constructor(root, match, onAction) {
    this.root = typeof root === 'string' ? document.querySelector(root) : root;
    this.match = match;
    this.root.classList.add('strategy-panel');
    this.root.setAttribute('aria-label', 'Timeout');
    this.root.innerHTML = `<span id="strategy-timeouts"></span><button type="button" id="strategy-timeout" title="T / Call timeout">CALL TIMEOUT</button>`;
    this.count = this.root.querySelector('#strategy-timeouts');
    this.button = this.root.querySelector('#strategy-timeout');
    this.button.addEventListener('click', () => { if (!this.button.disabled) onAction('timeout'); });
  }

  update(paused = false) {
    const r = this.match.rules;
    this.root.hidden = !phases.has(r.phase);
    if (this.root.hidden) return;
    const left = r.timeouts?.home ?? 3;
    const legal = typeof r.canTimeout === 'function' ? r.canTimeout('home') : typeof r.canTimeout === 'boolean' ? r.canTimeout
      : ['ready', 'result'].includes(r.phase) && r.clock > 0 && r.clockRunning && !r.next && !r.kickoffPending && left > 0;
    this.button.disabled = paused || !legal;
    this.count.textContent = `${left} timeouts left`;
    this.button.setAttribute('aria-label', `Call timeout, ${left} remaining`);
  }
}
