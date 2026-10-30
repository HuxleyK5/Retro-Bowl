import { drawArcadePlayer } from './ArcadePlayer.js';
import { PlayRenderer } from './PlayRenderer.js';
import { PlayEffects } from './PlayEffects.js';
import { Stadium } from './Stadium.js';

const textColor = hex => {
  const color = (hex || '#345846').replace('#', '');
  const rgb = color.length === 3 ? color.split('').map(n => n + n).join('') : color;
  const value = parseInt(rgb, 16);
  return ((value >> 16) * .299 + ((value >> 8) & 255) * .587 + (value & 255) * .114) > 155 ? '#10251f' : '#ffffff';
};

export class Renderer {
  constructor(canvas, camera, field) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.camera = camera; this.field = field;
    this.playRenderer = new PlayRenderer();
    this.effects = new PlayEffects();
    this.stadium = new Stadium(field);
    this.lastResult = '';
    this.playerSprite = document.createElement('canvas');
    this.playerSprite.width = 40; this.playerSprite.height = 60;
    if (!this.ctx) throw new Error('A browser with Canvas 2D support is required.');
  }
  resize(width, height) {
    width = Math.max(1, width); height = Math.max(1, height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * this.dpr); this.canvas.height = Math.round(height * this.dpr);
    this.camera.resize(width, height);
  }
  resetPresentation() {
    this.effects = new PlayEffects(); this.stadium.reset(); this.lastResult = '';
  }
  updateEffects(dt, play, rules) {
    // Rules resolve fourth downs and end-zone fumbles after the play emits its events.
    if (rules) {
      const result = `${play.generation}:${rules.playNumber}:${rules.result}`;
      if (result !== this.lastResult) {
        this.lastResult = result;
        if (rules.result === 'TURNOVER ON DOWNS' || rules.result === 'FUMBLE / TOUCHBACK') {
          const point = play.carrier || play.ball;
          play.emit('turnover', { x: point.x, y: point.y, team: 'away', uniform: rules.possession }, rules.result);
        }
      }
    }
    this.effects.update(dt, play);
    this.stadium.update(dt, play, rules);
  }
  render(players, selected, play, aim) {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#1a302b'; c.fillRect(0, 0, this.camera.width, this.camera.height);
    if (play) this.effects.sync(play);
    c.save(); this.camera.apply(c);
    this.stadium.drawWorld(c, this.teams, this.effects);
    this.drawField(c);
    if (play) this.playRenderer.drawGuides(c, play, aim);
    this.effects.drawTrails(c);
    const primarySlot = play?.previewSlot || (play?.call?.type === 'run' ? '22' : '81');
    for (const player of [...players].sort((a, b) => a.y - b.y)) this.drawPlayer(c, player, player === selected, player === play?.carrier,
      play?.phase === 'presnap' && player.team === 'home' && player.slot === primarySlot);
    if (play) this.playRenderer.drawBall(c, play.ball, this.effects.reaction(play.carrier)?.lift || 0);
    this.effects.drawWorld(c);
    c.restore();
    this.stadium.drawLighting(c, this.camera.width, this.camera.height);
    this.stadium.drawWeather(c, this.camera.width, this.camera.height);
    this.effects.drawScreen(c, this.camera.width, this.camera.height);
    this.effects.drawBanner(c, this.camera.width, this.camera.height);
  }
  drawField(c) {
    const { width: w, height: h, endZone: end, yard } = this.field;
    c.fillStyle = '#e9eed9'; c.fillRect(-10, -10, w + 20, h + 20);
    c.fillStyle = '#318b42'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 20; i++) { c.fillStyle = i % 2 ? '#389848' : '#318b42'; c.fillRect(end + i * yard * 5, 0, yard * 5, h); }
    c.fillStyle = this.teams?.home.primaryColor || '#214f43'; c.fillRect(0, 0, end, h);
    c.fillStyle = this.teams?.away.primaryColor || '#304c61'; c.fillRect(w - end, 0, end, h);
    c.fillStyle = '#10251f35'; c.fillRect(0, 0, end, h); c.fillRect(w - end, 0, end, h);
    // Restrained grain keeps the turf alive without competing with players,
    // route stems and one-yard hashes at the broadcast camera's smaller scale.
    c.fillStyle = '#d6e5aa12';
    for (let x = 23; x < w; x += 73) for (let y = 31; y < h; y += 79) c.fillRect(x, y, 2, 1);
    c.strokeStyle = '#fff8dc'; c.lineWidth = 5;
    c.strokeRect(0, 0, w, h);
    for (let i = 0; i <= 100; i += 5) {
      const x = end + i * yard;
      c.lineWidth = i % 10 === 0 ? 4.5 : 2.5;
      c.strokeStyle = i % 10 === 0 ? '#fff9e9' : '#f5f2d4c9';
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke();
    }
    c.lineWidth = 3; c.strokeStyle = '#fff8e3ed';
    for (let i = 1; i < 100; i++) {
      const x = end + i * yard;
      for (const y of [24, h * .42, h * .58, h - 24]) { c.beginPath(); c.moveTo(x, y - 7); c.lineTo(x, y + 7); c.stroke(); }
    }
    c.fillStyle = '#fff9e9'; c.strokeStyle = '#15472e'; c.lineWidth = 3;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'bold 54px monospace';
    for (let i = 10; i < 100; i += 10) {
      const x = end + i * yard;
      const number = String(Math.min(i, 100 - i));
      c.strokeText(number, x, h - 135); c.fillText(number, x, h - 135);
      c.save(); c.translate(x, 135); c.rotate(Math.PI); c.strokeText(number, 0, 0); c.fillText(number, 0, 0); c.restore();
      if (i !== 50) for (const y of [135, h - 135]) {
        const direction = i < 50 ? -1 : 1;
        c.beginPath(); c.moveTo(x + direction * 43, y - 8); c.lineTo(x + direction * 55, y); c.lineTo(x + direction * 43, y + 8); c.fill();
      }
    }
    for (const x of [end / 2, w - end / 2]) {
      const club = this.teams?.[x < w / 2 ? 'home' : 'away'];
      c.save(); c.translate(x, h / 2); c.rotate(-Math.PI / 2); c.font = 'bold 76px monospace'; c.fillStyle = '#ffffffd9'; c.fillText(club?.name.toUpperCase() || 'POCKET FIELD', 0, 0, h - 140); c.restore();
    }
    c.save(); c.translate(w / 2, h / 2); c.rotate(-Math.PI / 8); c.fillStyle = '#b5ce8d13'; c.fillRect(-90, -90, 180, 180); c.rotate(Math.PI / 8); c.font = 'bold 88px monospace'; c.fillStyle = '#d9e6b32b'; c.fillText(this.teams?.home.abbreviation || 'PF', 0, 5); c.restore();
    c.fillStyle = '#bdcc92';
    for (const x of [0, end, w - end, w]) for (const y of [-4, h - 4]) { c.fillStyle = '#efae63'; c.fillRect(x - 4, y, 8, 8); }
  }
  drawPlayer(c, p, selected, carrier = false, primary = false) {
    const reaction = this.effects.reaction(p);
    c.save(); c.translate(Math.round(p.x + (reaction?.offsetX || 0)), Math.round(p.y + (reaction?.offsetY || 0)));
    const scale = Math.min(2.1, Math.max(1, .88 / this.camera.zoom));
    c.scale(scale, scale);
    c.fillStyle = '#0c211c80'; c.beginPath(); c.ellipse(2, 13, 15, 5, 0, 0, Math.PI * 2); c.fill();
    if (selected || carrier) {
      c.fillStyle = selected ? '#dcff7b26' : '#ffd47724';
      c.beginPath(); c.ellipse(0, 11, 21, 11, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#10261f'; c.lineWidth = 7; c.stroke();
      c.strokeStyle = selected ? '#e6ff94' : '#ffd477'; c.lineWidth = 3.5; c.stroke();
    }
    if (selected) { c.fillStyle = '#e6ff94'; c.strokeStyle = '#10261f'; c.lineWidth = 3; c.beginPath(); c.moveTo(-6, -38); c.lineTo(6, -38); c.lineTo(0, -31); c.stroke(); c.fill(); }
    if (reaction) { c.translate(0, -reaction.lift); c.rotate(reaction.tilt); }
    const uniform = p.uniform || p.team;
    const club = this.teams?.[uniform];
    const jersey = uniform === 'away' ? '#f5f2df' : club?.primaryColor || '#2565ad';
    const trim = uniform === 'away' ? club?.primaryColor || '#304c61' : club?.secondaryColor || '#ffda67';
    drawArcadePlayer(this.playerSprite.getContext('2d'), p, {
      jersey, trim, helmet: club?.primaryColor || '#e7ebd6', numberColor: textColor(jersey),
    }, reaction, carrier);
    c.imageSmoothingEnabled = false;
    c.drawImage(this.playerSprite, -20, -36);
    if (p.jukeTime > 0) { c.strokeStyle = '#edff9e'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 34, -.7, 1.5); c.stroke(); }
    c.restore();
    if (selected || (p.team === 'home' && p.role !== 'LINEMAN')) {
      c.save(); c.translate(p.x, p.y - 43 * scale); c.scale(1 / this.camera.zoom, 1 / this.camera.zoom);
      const label = selected ? `YOU #${p.number}` : primary ? `READ #${p.number}` : p.role === 'QUARTERBACK' ? `QB #${p.number}` : `#${p.number}`;
      c.font = 'bold 11px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const width = c.measureText(label).width + 10;
      c.fillStyle = selected ? '#e6ff94' : '#10251f'; c.fillRect(-width / 2, -8.5, width, 17);
      c.strokeStyle = selected ? '#10251f' : primary ? '#e6ff94' : '#e8efd47a'; c.lineWidth = 1; c.strokeRect(-width / 2, -8.5, width, 17);
      c.fillStyle = selected ? '#10251f' : primary ? '#e6ff94' : '#fff8df'; c.fillText(label, 0, .5); c.restore();
    }
  }
}
