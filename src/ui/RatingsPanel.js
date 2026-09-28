import { POSITION_RATINGS, RATING_LABELS } from '../data/PlayerData.js';
import { topSpeed, acceleration, throwRange, throwVelocity } from '../football/RatingEffects.js';

export class RatingsPanel {
  constructor(play, state, focusGame) {
    this.play = play; this.state = state; this.focusGame = focusGame;
    this.root = document.querySelector('#ratings-panel');
    this.team = document.querySelector('#ratings-team'); this.player = document.querySelector('#ratings-player');
    this.rows = document.querySelector('#ratings-values'); this.previousPlaying = false;
    document.querySelector('#ratings-toggle').addEventListener('click', () => this.open());
    document.querySelector('#ratings-close').addEventListener('click', () => this.close());
    this.team.addEventListener('change', () => this.loadTeam());
    this.player.addEventListener('change', () => this.render());
    this.root.addEventListener('keydown', event => {
      if (event.code === 'Escape' || event.code === 'KeyP') { event.preventDefault(); event.stopPropagation(); this.close(); }
      if (event.code === 'Tab') {
        const elements = [document.querySelector('#ratings-close'), this.team, this.player];
        if (event.shiftKey && document.activeElement === elements[0]) { event.preventDefault(); elements.at(-1).focus(); }
        else if (!event.shiftKey && document.activeElement === elements.at(-1)) { event.preventDefault(); elements[0].focus(); }
      }
    });
  }
  get visible() { return !this.root.hidden; }
  open() {
    if (this.visible) return;
    this.previousPlaying = this.state.playing; this.state.set('paused');
    this.root.hidden = false; this.loadTeam(); document.querySelector('#ratings-close').focus({ preventScroll: true });
  }
  close() {
    if (!this.visible) return;
    this.root.hidden = true;
    if (this.previousPlaying) { this.state.set('playing'); this.focusGame(); }
    else document.querySelector('#resume').focus({ preventScroll: true });
  }
  loadTeam() {
    this.player.replaceChildren();
    for (const data of this.play.rosters[this.team.value]) {
      const option = document.createElement('option'); option.value = data.id;
      option.textContent = `#${data.number} ${data.specialty} · ${data.name}`; this.player.append(option);
    }
    this.render();
  }
  render() {
    const data = this.play.rosters[this.team.value].find(p => p.id === this.player.value);
    document.querySelector('#ratings-name').textContent = data.name;
    document.querySelector('#ratings-position').textContent = `#${data.number} · ${data.specialty} · OVERALL ${data.overall}`;
    this.rows.replaceChildren();
    for (const key of POSITION_RATINGS[data.position]) {
      const row = document.createElement('div'); row.className = 'rating-row'; row.dataset.rating = key;
      const label = document.createElement('span'); label.textContent = RATING_LABELS[key];
      const meter = document.createElement('meter'); meter.min = 1; meter.max = 99; meter.value = data.ratings[key]; meter.setAttribute('aria-label', RATING_LABELS[key]);
      const value = document.createElement('strong'); value.textContent = data.ratings[key]; row.append(label, meter, value); this.rows.append(row);
    }
    document.querySelector('#ratings-effect').textContent = data.position === 'QB'
      ? `Arm range ${(throwRange(data.ratings) / 20).toFixed(0)} yd · Ball speed ${(throwVelocity(data.ratings) / 20).toFixed(1)} yd/s`
      : `Run speed ${(topSpeed(data.ratings) / 20).toFixed(1)} yd/s · Sprint ${(topSpeed(data.ratings) * 1.5 / 20).toFixed(1)} yd/s · Acceleration ${(acceleration(data.ratings) / 20).toFixed(1)} yd/s²`;
    document.querySelector('#ratings-identity').textContent = `Age ${data.age} / Potential ${data.potential} / ${data.contract.yearsRemaining} years / $${(data.contract.annualSalary/1000000).toFixed(2)}M per year / $${(data.contract.guaranteed/1000000).toFixed(2)}M guaranteed / ID ${data.id}`;
  }
}
