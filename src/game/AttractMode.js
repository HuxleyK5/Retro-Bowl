import { createLeague } from '../data/League.js';
import { Field } from '../world/Field.js';
import { Camera } from '../world/Camera.js';
import { Renderer } from '../rendering/Renderer.js';
import { Play } from '../football/Play.js';
import { MatchController } from './MatchController.js';
import { formatClock } from '../ui/GameHUD.js';

export const IDLE_DELAY = 45000;

// Exhibition owns its players, rules and renderer; it never touches the franchise.
export class AttractMode {
  constructor({ onStart = () => {}, onEnd = () => {} } = {}) {
    this.onStart = onStart; this.onEnd = onEnd;
    this.lastActivity = performance.now(); this.active = false; this.gameNumber = 0;
    this.root = document.createElement('section');
    this.root.id = 'attract-mode'; this.root.hidden = true; this.root.tabIndex = -1;
    this.root.setAttribute('aria-label', 'CPU exhibition game. Press any key or move the mouse to return.');
    this.root.innerHTML = `<header class="attract-header"><span class="attract-brand">PF</span><div><p>ARCADE EXHIBITION</p><h2>CPU vs CPU</h2></div><span class="attract-live">LIVE DEMO</span></header>
      <div class="attract-score"><strong data-demo="home"></strong><b data-demo="score"></b><strong data-demo="away"></strong></div>
      <p class="attract-status" data-demo="status"></p><div class="attract-field"><canvas aria-label="Live CPU versus CPU football exhibition"></canvas></div>
      <footer class="attract-footer"><strong>PRESS ANY KEY OR MOVE THE MOUSE TO PLAY</strong><span>Your game is waiting right where you left it.</span></footer>`;
    document.body.append(this.root);
    this.labels = Object.fromEntries([...this.root.querySelectorAll('[data-demo]')].map(node => [node.dataset.demo, node]));
    this.canvas = this.root.querySelector('canvas'); this.app = document.querySelector('.app');
    this.listen = event => {
      if (this.active) {
        // The wake-up input belongs to this screen, never the game behind it.
        event.preventDefault(); event.stopImmediatePropagation(); this.stop();
      }
      this.lastActivity = performance.now();
    };
    for (const name of ['pointerdown', 'pointermove', 'keydown', 'wheel'])
      window.addEventListener(name, this.listen, { capture: true, passive: false });
    document.addEventListener('visibilitychange', () => { this.lastActivity = performance.now(); });
    new ResizeObserver(() => this.resize()).observe(this.root.querySelector('.attract-field'));
  }
  activity() { this.lastActivity = performance.now(); }
  start() {
    if (this.active) return;
    this.savedFocus = document.activeElement; this.savedOverflow = document.body.style.overflow;
    this.savedInert = this.app.inert;
    this.active = true; this.onStart(); this.root.hidden = false;
    this.app.inert = true; document.body.style.overflow = 'hidden';
    this.root.focus({ preventScroll: true });
    this.league ??= createLeague();
    this.newGame(); this.resize();
  }
  newGame() {
    const index = this.gameNumber++ % this.league.length;
    const home = this.league[index], away = this.league[(index + 11) % this.league.length];
    this.field = new Field(); this.camera = new Camera(this.field);
    this.renderer = new Renderer(this.canvas, this.camera, this.field);
    this.renderer.teams = { home, away };
    this.play = new Play(this.field, Math.random, { home: home.roster, away: away.roster });
    this.match = new MatchController(this.play, Math.random, { cpuOnly: true });
    this.match.rules.teams = { home: `${home.city} ${home.name}`, away: `${away.city} ${away.name}` };
    this.match.rules.specialists = Object.fromEntries(Object.entries({ home, away }).map(([side, team]) =>
      [side, { kicker: team.roster.find(p => p.position === 'K'), punter: team.roster.find(p => p.position === 'P') }]));
    this.match.start(60);
    for (const [side, team] of Object.entries({ home, away })) {
      this.labels[side].textContent = team.abbreviation;
      this.labels[side].style.borderColor = team.primaryColor;
      this.labels[side].title = `${team.city} ${team.name}`;
    }
    this.resize();
  }
  stop() {
    if (!this.active) return;
    this.active = false; this.root.hidden = true; this.app.inert = this.savedInert;
    document.body.style.overflow = this.savedOverflow; this.activity(); this.onEnd();
    if (this.savedFocus?.isConnected) this.savedFocus.focus({ preventScroll: true });
  }
  resize() {
    if (!this.active || !this.renderer) return;
    const { width, height } = this.canvas.parentElement.getBoundingClientRect();
    this.renderer.resize(width, height); this.camera.followPlay(this.play, 0);
  }
  update(dt) {
    if (document.hidden) return;
    if (!this.active) {
      if (performance.now() - this.lastActivity >= IDLE_DELAY) this.start();
      return;
    }
    this.match.update(dt, { x: 0, y: 0 });
    const r = this.match.rules;
    if (['halftime', 'quarterBreak'].includes(r.phase) && this.match.phaseAge > 2.5) this.match.advance();
    if (r.phase === 'final' && this.match.phaseAge > 6) { this.newGame(); return; }
    this.renderer.updateEffects(dt, this.play, r); this.camera.followPlay(this.play, dt);
  }
  render() {
    if (!this.active) return;
    this.renderer.render(this.play.players, null, this.play, null);
    const r = this.match.rules;
    this.labels.score.textContent = `${r.score.home} : ${r.score.away}`;
    this.labels.status.textContent = `${r.phase === 'final' ? 'FINAL' : `Q${r.quarter}  ${formatClock(r.clock)}`}  /  ${r.teams[r.possession]} BALL  /  ${r.phase === 'result' ? r.result : r.phase === 'halftime' ? 'HALFTIME' : r.downLabel}`;
  }
}
