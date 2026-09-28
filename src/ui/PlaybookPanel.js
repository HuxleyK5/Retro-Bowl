import { PLAYBOOK, FORMATIONS } from '../football/Playbook.js';

export class PlaybookPanel {
  constructor(match, select, snap) {
    this.match = match; this.root = document.querySelector('#playbook');
    this.stage = document.querySelector('#play-stage');
    this.title = document.querySelector('#call-name'); this.description = document.querySelector('#call-description');
    this.formation = document.querySelector('#call-formation');
    this.canvas = document.querySelector('#call-preview');
    this.snap = document.querySelector('#playbook-snap'); this.snap.addEventListener('click', snap);
    this.buttons = PLAYBOOK.map(call => {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.play = call.id;
      button.textContent = call.name; button.title = call.description; button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => select(call.id));
      document.querySelector(call.type === 'pass' ? '#pass-plays' : '#run-plays').append(button);
      return button;
    });
  }
  update(paused) {
    const visible = this.match.humanTurn && this.match.rules.phase === 'ready';
    this.root.hidden = !visible; this.stage.classList.toggle('choosing-play', visible);
    if (!visible) return;
    const call = this.match.play.call;
    this.buttons.forEach(button => {
      button.disabled = paused;
      button.setAttribute('aria-pressed', String(button.dataset.play === call.id));
    });
    this.snap.disabled = paused;
    if (this.lastCall === call) return;
    this.lastCall = call;
    this.title.textContent = call.name; this.description.textContent = call.description;
    this.formation.textContent = FORMATIONS[call.formation].name;
    this.canvas.setAttribute('aria-label', `${call.name}: ${FORMATIONS[call.formation].name}. ${call.description}`);
    this.draw(call);
  }
  draw(call) {
    const c = this.canvas.getContext('2d');
    const w = this.canvas.width, h = this.canvas.height;
    const point = ([x, y]) => ({ x: (x + 13) / 77 * w, y: (y + 27) / 54 * h });
    c.clearRect(0, 0, w, h); c.fillStyle = '#173427'; c.fillRect(0, 0, w, h);
    const los = point([0, 0]); c.strokeStyle = '#85c8db'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(los.x, 0); c.lineTo(los.x, h); c.stroke();
    const positions = FORMATIONS[call.formation].positions;
    for (const [number, route] of Object.entries(call.routes)) {
      const start = point(positions[number]);
      c.strokeStyle = number === '22' ? '#f6ca70' : call.type === 'run' ? '#8a9f84' : '#deeca6'; c.lineWidth = number === '22' ? 2 : 1;
      c.beginPath(); c.moveTo(start.x, start.y); route.forEach(p => { const v = point(p); c.lineTo(v.x, v.y); }); c.stroke();
      const end = point(route.at(-1)); const prev = point(route.length > 1 ? route.at(-2) : positions[number]);
      c.save(); c.translate(end.x, end.y); c.rotate(Math.atan2(end.y - prev.y, end.x - prev.x));
      c.beginPath(); c.moveTo(-4, -3); c.lineTo(0, 0); c.lineTo(-4, 3); c.stroke(); c.restore();
    }
    for (const [number, position] of Object.entries(positions)) {
      const v = point(position); c.fillStyle = number === '22' ? '#f6ca70' : '#edf4c7';
      c.beginPath(); c.arc(v.x, v.y, 3, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = '#9dac89'; for (let i = -2; i <= 2; i++) { const v = point([0, i * 2.5]); c.fillRect(v.x - 2, v.y - 2, 4, 4); }
  }
}
