import { PLAYBOOK, FORMATIONS } from '../football/Playbook.js';
import { COVERAGES } from '../football/Tactics.js';
import { PLAY_PROFILES, assessPlay, recommendPlays } from '../football/PlayRecommendations.js';

const roles = { '01': 'QB', '08': 'X', '81': 'Y', '11': 'H', '19': 'Z', '22': 'RB' };
const pointString = points => points.map(point => point.join(',')).join(' ');

function miniature(call) {
  const positions = FORMATIONS[call.formation].positions;
  const primary = PLAY_PROFILES[call.id].primarySlot;
  const depth = Math.max(30, Math.ceil(Math.max(...Object.values(call.routes).flat().map(point => point[0])) / 10) * 10);
  const point = ([x, y]) => [Math.round(19 + x / depth * 105), Math.round(29 + y / 27 * 25)];
  const paths = Object.entries(call.routes).sort(([a], [b]) => (a === primary) - (b === primary));
  return `<svg class="play-tile-diagram" viewBox="0 0 128 58" aria-hidden="true" focusable="false"><path class="tile-scrimmage" d="M19 3V55"/>${paths.map(([slot, route]) => `<polyline class="${slot === primary ? 'tile-primary' : 'tile-route'}" points="${pointString([positions[slot], ...route].map(point))}"/>`).join('')}${Object.entries(positions).map(([slot, start]) => { const [x, y] = point(start); return `<circle class="${slot === primary ? 'tile-primary-dot' : 'tile-dot'}" cx="${x}" cy="${y}" r="${slot === primary ? 2.4 : 1.7}"/>`; }).join('')}</svg>`;
}

export class PlaybookPanel {
  constructor(match, select, snap) {
    this.match = match; this.root = document.querySelector('#playbook');
    this.stage = document.querySelector('#play-stage');
    this.title = document.querySelector('#call-name'); this.description = document.querySelector('#call-description');
    this.formation = document.querySelector('#call-formation');
    this.canvas = document.querySelector('#call-preview'); this.canvas.width = 820; this.canvas.height = 440;
    this.snap = document.querySelector('#playbook-snap'); this.snap.addEventListener('click', snap);
    const selected = document.createElement('section'); selected.className = 'playbook-selected'; selected.setAttribute('aria-label', 'Selected play and primary read');
    this.root.querySelector('.playbook-heading').after(selected);
    const chart = document.createElement('div'); chart.className = 'playbook-chart'; chart.append(this.canvas);
    const legend = document.createElement('div'); legend.className = 'playbook-chart-legend';
    legend.innerHTML = '<span><i class="chart-primary"></i>PRIMARY READ</span><span><i class="chart-los"></i>SCRIMMAGE</span><span><i class="chart-first"></i>FIRST DOWN</span>';
    chart.append(legend);
    this.read = document.createElement('p'); this.read.id = 'call-primary-read';
    this.fit = document.createElement('p'); this.fit.id = 'call-fit';
    selected.append(this.title, this.formation, chart, this.read, this.description, this.fit);
    const catalog = document.createElement('div'); catalog.className = 'playbook-catalog'; this.root.insertBefore(catalog, this.snap);
    for (const id of ['pass-plays', 'run-plays']) {
      const grid = document.getElementById(id), heading = grid.previousElementSibling;
      const group = document.createElement('div'); group.className = 'playbook-group'; group.append(heading, grid); catalog.append(group);
    }
    this.buttons = PLAYBOOK.map(call => {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.play = call.id;
      const profile = PLAY_PROFILES[call.id];
      button.innerHTML = `<span class="play-tile-copy"><strong>${call.name}</strong><small>${profile.depth}</small><span class="play-fit-badge" hidden>GOOD FIT</span></span>${miniature(call)}`;
      button.setAttribute('aria-label', `${call.name}. ${profile.strength}`);
      button.title = call.description; button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => select(call.id));
      document.querySelector(call.type === 'pass' ? '#pass-plays' : '#run-plays').append(button); return button;
    });
  }

  update(paused) {
    const visible = this.match.humanTurn && this.match.rules.phase === 'ready';
    this.root.hidden = !visible; this.stage.classList.toggle('choosing-play', visible);
    if (!visible) return;
    const play = this.match.play, rules = this.match.rules, call = play.call;
    const formation = play.formation || call.formation, profile = PLAY_PROFILES[call.id]; play.previewSlot = profile.primarySlot;
    const context = JSON.stringify([rules.down, Math.ceil(rules.yardsToGo), Math.round(rules.spot), rules.quarter,
      rules.clock <= 10, rules.clock <= Math.min(45, rules.quarterSeconds / 2), rules.clock <= Math.min(90, rules.quarterSeconds * .75), rules.score, play.coverage, play.defensiveAdjustment]);
    if (context !== this.lastContext) {
      this.lastContext = context;
      const goodFits = new Map(recommendPlays(rules, play.coverage, play.defensiveAdjustment).map(fit => [fit.id, fit]));
      for (const button of this.buttons) {
        const fit = goodFits.get(button.dataset.play); button.querySelector('.play-fit-badge').hidden = !fit; button.classList.toggle('is-good-fit', !!fit);
        const definition = PLAYBOOK.find(candidate => candidate.id === button.dataset.play);
        button.title = fit ? `${definition.description} Good fit: ${fit.reason}` : definition.description;
      }
    }
    this.buttons.forEach(button => { button.disabled = paused; button.setAttribute('aria-pressed', String(button.dataset.play === call.id)); });
    this.snap.disabled = paused;
    const motion = play.execution.motion, motionKey = motion ? `${Math.round(motion.player.x / 3)},${Math.round(motion.player.y / 3)}` : '';
    const fit = assessPlay(call, rules, play.coverage, play.defensiveAdjustment), receiver = play.receivers.find(player => player.slot === profile.primarySlot);
    const readText = `FIRST LOOK  ${profile.read} · #${receiver?.number || profile.primarySlot}`;
    if (this.read.textContent !== readText) this.read.textContent = readText;
    const description = `${profile.strength} ${call.id === 'play-action' ? 'Wait for the 0.9s fake before throwing.' : call.type === 'run' ? 'Follow the highlighted lane or steer after the handoff.' : 'Lime route is the first read; scan the other routes if covered.'}`;
    if (this.description.textContent !== description) this.description.textContent = description;
    const fitText = `${COVERAGES[play.coverage]?.name || 'Coverage read'} · ${fit.reason}`;
    if (this.fit.textContent !== fitText) this.fit.textContent = fitText;
    if (this.lastCall === call && this.lastFormation === formation && this.lastMotion === motionKey && this.lastChartContext === context) return;
    this.lastCall = call; this.lastFormation = formation; this.lastMotion = motionKey; this.lastChartContext = context;
    this.title.textContent = call.name;
    this.formation.textContent = FORMATIONS[formation].name;
    this.canvas.setAttribute('aria-label', `${call.name}: ${FORMATIONS[formation].name}. Primary read ${profile.read}. ${call.description}`);
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
      c.fillStyle = '#829e80'; c.fillText(yard ? `${yard} YD` : 'LOS', x, 25);
    }
    for (const y of [-20, -10, 0, 10, 20]) { c.strokeStyle = '#b8d49b0c'; c.beginPath(); c.moveTo(bounds.left, point([0, y]).y); c.lineTo(bounds.right, point([0, y]).y); c.stroke(); }
    c.setLineDash([]);
    const first = point([Math.min(depth - 2, this.match.rules.yardsToGo), 0]).x;
    c.strokeStyle = '#e7c56f'; c.lineWidth = 2; c.setLineDash([8, 7]); c.beginPath(); c.moveTo(first, bounds.top); c.lineTo(first, bounds.bottom); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#e7c56f'; c.font = 'bold 22px monospace'; c.fillText(`1ST · ${Math.ceil(this.match.rules.yardsToGo)} YD`, Math.min(w - 85, Math.max(90, first)), h - 12);
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
      c.fillStyle = selected ? '#edf6ce' : '#a8bd99'; c.font = `${selected ? 'bold ' : ''}23px monospace`; c.textAlign = 'right'; c.fillText(roles[slot], v.x - 19, v.y + 7);
    }
    c.fillStyle = '#607d60'; for (let i = -2; i <= 2; i++) { const v = point([0, i * 2.5]); c.fillRect(v.x - 5, v.y - 4, 9, 8); }
  }
}
