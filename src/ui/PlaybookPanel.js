import { FORMATIONS } from '../football/Playbook.js';
import { PLAY_PROFILES } from '../football/PlayRecommendations.js';
import { SIMPLE_PLAY_NAMES } from '../game/BeginnerGuide.js';
import { isBeginnerMode } from './BeginnerMode.js';

const roles = { '01': 'QB', '08': 'X', '81': 'Y', '11': 'H', '19': 'Z', '22': 'RB' };

export class PlaybookPanel {
  constructor(match, audible, snap) {
    this.match = match; this.root = document.querySelector('#playbook');
    this.stage = document.querySelector('#play-stage');
    this.title = document.querySelector('#call-name'); this.description = document.querySelector('#call-description');
    this.formation = document.querySelector('#call-formation'); this.formation.hidden = true;
    this.canvas = document.querySelector('#call-preview'); this.canvas.width = 820; this.canvas.height = 440;
    this.snap = document.querySelector('#playbook-snap'); this.snap.addEventListener('click', snap);
    this.audibles = document.createElement('p'); this.audibles.id = 'audible-count';
    this.audibles.setAttribute('role', 'status'); this.audibles.setAttribute('aria-live', 'polite');
    const selected = document.createElement('section'); selected.className = 'playbook-selected';
    selected.setAttribute('aria-label', 'Assigned play and primary read');
    const chart = document.createElement('div'); chart.className = 'playbook-chart'; chart.append(this.canvas);
    this.legend = document.createElement('div'); this.legend.className = 'playbook-chart-legend'; chart.append(this.legend);
    this.read = document.createElement('p'); this.read.id = 'call-primary-read';
    this.fit = document.createElement('p'); this.fit.id = 'call-fit'; this.fit.hidden = true;
    selected.append(this.title, this.formation, chart, this.read, this.description, this.fit);
    this.root.querySelector('.playbook-heading').after(this.audibles, selected);
    this.audible = document.createElement('button'); this.audible.id = 'audible-button'; this.audible.type = 'button';
    this.audible.textContent = 'AUDIBLE / NEW RANDOM PLAY'; this.audible.addEventListener('click', audible);
    this.audible.setAttribute('aria-describedby', 'audible-count');
    this.root.insertBefore(this.audible, this.snap);
    this.updateMode();
  }
  updateMode() {
    const beginner = isBeginnerMode();
    if (this.beginner === beginner) return;
    this.beginner = beginner; this.lastCall = null;
    this.legend.innerHTML = beginner ? '<span><i class="chart-primary"></i>FIRST LOOK</span><span><i class="chart-los"></i>START LINE</span><span><i class="chart-first"></i>TARGET LINE</span>' : '<span><i class="chart-primary"></i>PRIMARY READ</span><span><i class="chart-los"></i>SCRIMMAGE</span><span><i class="chart-first"></i>FIRST DOWN</span>';
    this.snap.textContent = beginner ? 'START THIS PLAY / SPACE' : 'SPACE / SNAP BALL';
  }
  update(paused) {
    this.updateMode();
    const visible = this.match.humanTurn && this.match.rules.phase === 'ready';
    this.root.hidden = !visible; this.stage.classList.toggle('choosing-play', visible);
    if (!visible) return;
    const play = this.match.play, rules = this.match.rules, call = play.call;
    const formation = play.formation || call.formation, profile = PLAY_PROFILES[call.id]; play.previewSlot = profile.primarySlot;
    const remaining = this.match.audiblesRemaining;
    this.root.querySelector('.playbook-heading').lastElementChild.textContent = remaining ? 'RANDOMLY ASSIGNED' : 'PLAY LOCKED';
    const text = remaining ? `${remaining} AUDIBLE${remaining === 1 ? '' : 'S'} LEFT / Audible gives you a different random play` : 'NO AUDIBLES LEFT / Start your assigned play';
    if (this.audibles.textContent !== text) this.audibles.textContent = text;
    this.audible.disabled = paused || remaining <= 0; this.snap.disabled = paused;
    const receiver = play.receivers.find(player => player.slot === profile.primarySlot);
    this.read.textContent = this.beginner ? (call.type === 'run' ? `YOUR RUNNER: #${receiver?.number || profile.primarySlot}. The handoff happens automatically.` : `LOOK FIRST: teammate #${receiver?.number || profile.primarySlot} on the bright green route.`) : `FIRST LOOK / ${profile.read} / #${receiver?.number || profile.primarySlot}`;
    this.description.textContent = this.beginner ? (call.type === 'run' ? 'Use WASD or arrow keys to steer right. Avoid opponents and aim for the yellow line.' : `${call.id === 'play-action' ? 'Wait for the handoff fake to finish. ' : ''}Start the play, then hold the mouse, pull opposite your throw direction and release to pass.`) : `${profile.strength} ${call.type === 'run' ? 'Follow the highlighted lane or steer after the handoff.' : 'Lime route is the first read; look for an open teammate.'}`;
    this.title.textContent = this.beginner ? (SIMPLE_PLAY_NAMES[call.id] || call.name) : call.name;
    const motion = play.execution.motion, motionKey = motion ? `${Math.round(motion.player.x / 3)},${Math.round(motion.player.y / 3)}` : '';
    const context = `${play.generation}:${formation}:${motionKey}:${rules.yardsToGo}`;
    if (this.lastCall === call && this.lastChartContext === context) return;
    this.lastCall = call; this.lastChartContext = context;
    this.canvas.setAttribute('aria-label', `Assigned play: ${call.name}. Primary read ${profile.read}. ${call.description}`);
    this.draw(call);
  }

  draw(call) {
    const c = this.canvas.getContext('2d'), w = this.canvas.width, h = this.canvas.height;
    const play = this.match.play, motion = play.execution.motion, primary = PLAY_PROFILES[call.id].primarySlot;
    const bounds = { left: 40, right: w - 24, top: 49, bottom: h - 35 };
    const maxRoute = Math.max(...play.receivers.flatMap(player => player.route.map(position => (position.x - play.lineOfScrimmage) / play.field.yard)));
    const depth = Math.min(65, Math.max(30, Math.ceil((Math.max(maxRoute, this.match.rules.yardsToGo) + 3) / 10) * 10));
    const point = ([x, y]) => ({ x: bounds.left + (x + 13) / (depth + 13) * (bounds.right - bounds.left), y: bounds.top + (y + 27) / 54 * (bounds.bottom - bounds.top) });
    const local = position => [(position.x - play.lineOfScrimmage) / play.field.yard, (position.y - play.field.height / 2) / play.field.yard];
    c.clearRect(0, 0, w, h); c.fillStyle = '#152e24'; c.fillRect(0, 0, w, h); c.font = '22px monospace'; c.textAlign = 'center';
    for (let yard = 0; yard <= depth; yard += 10) {
      const x = point([yard, 0]).x;
      if (yard % 20 === 0) { c.fillStyle = '#c8e4ab04'; c.fillRect(x, bounds.top, (bounds.right - bounds.left) / (depth + 13) * 10, bounds.bottom - bounds.top); }
      c.strokeStyle = '#b8d49b20'; c.lineWidth = 1; c.setLineDash([4, 8]); c.beginPath(); c.moveTo(x, bounds.top); c.lineTo(x, bounds.bottom); c.stroke();
      c.fillStyle = '#829e80'; c.fillText(yard ? `${yard} YD` : this.beginner ? 'START' : 'LOS', x, 25);
    }
    for (const y of [-20, -10, 0, 10, 20]) { c.strokeStyle = '#b8d49b0c'; c.beginPath(); c.moveTo(bounds.left, point([0, y]).y); c.lineTo(bounds.right, point([0, y]).y); c.stroke(); }
    c.setLineDash([]);
    const first = point([Math.min(depth - 2, this.match.rules.yardsToGo), 0]).x;
    c.strokeStyle = '#e7c56f'; c.lineWidth = 2; c.setLineDash([8, 7]); c.beginPath(); c.moveTo(first, bounds.top); c.lineTo(first, bounds.bottom); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#e7c56f'; c.font = 'bold 22px monospace'; c.fillText(`${this.beginner ? 'TARGET' : '1ST'} · ${Math.ceil(this.match.rules.yardsToGo)} YD`, Math.min(w - 85, Math.max(90, first)), h - 12);
    const los = point([0, 0]); c.strokeStyle = '#85c8db'; c.lineWidth = 2; c.beginPath(); c.moveTo(los.x, bounds.top); c.lineTo(los.x, bounds.bottom); c.stroke();
    const positions = Object.fromEntries([play.qb, ...play.receivers].map(player => [player.slot, local(player)]));
    const paths = Object.fromEntries(play.receivers.map(player => {
      const dx = motion?.player === player ? player.x - motion.origin.x : 0, dy = motion?.player === player ? player.y - motion.origin.y : 0;
      return [player.slot, player.route.map(position => local({ x: position.x + dx, y: position.y + dy }))];
    }));
    for (const [slot, route] of Object.entries(paths).sort(([a], [b]) => (a === primary) - (b === primary))) {
      const start = point(positions[slot]), selected = slot === primary, color = selected ? '#d8ef8b' : slot === '22' ? '#b8a471' : '#819c7f';
      const stroke = (width, color) => {
        c.strokeStyle = color; c.lineWidth = width; c.lineJoin = 'round'; c.lineCap = 'round'; c.beginPath(); c.moveTo(start.x, start.y);
        route.forEach(position => { const v = point(position); c.lineTo(v.x, v.y); }); c.stroke();
      };
      if (selected) stroke(10, '#11251d'); stroke(selected ? 5 : 2.2, color);
      const end = point(route.at(-1)), prev = point(route.length > 1 ? route.at(-2) : positions[slot]);
      c.save(); c.translate(end.x, end.y); c.rotate(Math.atan2(end.y - prev.y, end.x - prev.x)); c.strokeStyle = color; c.lineWidth = selected ? 4 : 2;
      c.beginPath(); c.moveTo(-10, -7); c.lineTo(0, 0); c.lineTo(-10, 7); c.stroke(); c.restore();
    }
    for (const [slot, position] of Object.entries(positions)) {
      const v = point(position), selected = slot === primary;
      c.fillStyle = selected ? '#d8ef8b' : slot === '01' ? '#e9e5c7' : '#a6bb96'; c.strokeStyle = '#10251a'; c.lineWidth = 3;
      c.beginPath(); c.arc(v.x, v.y, selected ? 10 : 8, 0, Math.PI * 2); c.fill(); c.stroke();
      if (selected) { c.strokeStyle = '#d8ef8b66'; c.lineWidth = 2; c.beginPath(); c.arc(v.x, v.y, 16, 0, Math.PI * 2); c.stroke(); }
      c.fillStyle = selected ? '#edf6ce' : '#a8bd99'; c.font = `${selected ? 'bold ' : ''}23px monospace`; c.textAlign = 'right'; c.fillText(this.beginner ? `#${[play.qb, ...play.receivers].find(player => player.slot === slot)?.number || slot}` : roles[slot], v.x - 19, v.y + 7);
    }
    c.fillStyle = '#607d60'; for (let i = -2; i <= 2; i++) { const v = point([0, i * 2.5]); c.fillRect(v.x - 5, v.y - 4, 9, 8); }
  }
}
