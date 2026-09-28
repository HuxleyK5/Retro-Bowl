import { PlayRenderer } from './PlayRenderer.js';

export class Renderer {
  constructor(canvas, camera, field) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.camera = camera; this.field = field;
    this.playRenderer = new PlayRenderer();
    if (!this.ctx) throw new Error('A browser with Canvas 2D support is required.');
  }
  resize(width, height) {
    width = Math.max(1, width); height = Math.max(1, height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * this.dpr); this.canvas.height = Math.round(height * this.dpr);
    this.camera.resize(width, height);
  }
  render(players, selected, play, aim) {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#284e35'; c.fillRect(0, 0, this.camera.width, this.camera.height);
    c.save(); this.camera.apply(c); this.drawField(c);
    if (play) this.playRenderer.drawGuides(c, play, aim);
    for (const player of [...players].sort((a, b) => a.y - b.y)) this.drawPlayer(c, player, player === selected);
    if (play) this.playRenderer.drawBall(c, play.ball);
    c.restore();
  }
  drawField(c) {
    const { width: w, height: h, endZone: end, yard } = this.field;
    c.fillStyle = '#8b9d68'; c.fillRect(-14, -14, w + 28, h + 28);
    c.fillStyle = '#426d42'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 20; i++) { c.fillStyle = i % 2 ? '#477545' : '#416d40'; c.fillRect(end + i * yard * 5, 0, yard * 5, h); }
    c.fillStyle = '#284f39'; c.fillRect(0, 0, end, h); c.fillRect(w - end, 0, end, h);
    c.fillStyle = '#a5bb8066';
    for (let x = 13; x < w; x += 31) for (let y = 17; y < h; y += 37) c.fillRect(x, y, 2, 2);
    c.strokeStyle = '#dce6bfbb'; c.lineWidth = 3;
    c.strokeRect(0, 0, w, h);
    for (let i = 0; i <= 100; i += 5) {
      const x = end + i * yard;
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke();
    }
    c.lineWidth = 2;
    for (let i = 1; i < 100; i++) {
      const x = end + i * yard;
      for (const y of [24, h * .42, h * .58, h - 24]) { c.beginPath(); c.moveTo(x, y - 7); c.lineTo(x, y + 7); c.stroke(); }
    }
    c.fillStyle = '#e0e8c5b3'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'bold 49px monospace';
    for (let i = 10; i < 100; i += 10) {
      const x = end + i * yard;
      c.fillText(String(Math.min(i, 100 - i)), x, h - 135);
      c.save(); c.translate(x, 135); c.rotate(Math.PI); c.fillText(String(Math.min(i, 100 - i)), 0, 0); c.restore();
    }
    for (const x of [end / 2, w - end / 2]) {
      c.save(); c.translate(x, h / 2); c.rotate(-Math.PI / 2); c.font = 'bold 64px monospace'; c.fillStyle = '#a9c49355'; c.fillText(this.teams?.home.name.toUpperCase() || 'POCKET FIELD', 0, 0, h - 100); c.restore();
    }
    c.save(); c.translate(w / 2, h / 2); c.rotate(-Math.PI / 8); c.fillStyle = '#b5ce8d24'; c.fillRect(-90, -90, 180, 180); c.rotate(Math.PI / 8); c.font = 'bold 88px monospace'; c.fillStyle = '#c1d69a44'; c.fillText(this.teams?.home.abbreviation || 'PF', 0, 5); c.restore();
    c.fillStyle = '#bdcc92';
    for (const x of [0, end, w - end, w]) for (const y of [-4, h - 4]) { c.fillStyle = '#efae63'; c.fillRect(x - 4, y, 8, 8); }
    c.fillStyle = '#b4c19b66';
    for (let x = end; x <= w - end; x += 200) { c.fillRect(x - 26, -58, 52, 8); c.fillRect(x - 26, h + 50, 52, 8); }
  }
  drawPlayer(c, p, selected) {
    c.save(); c.translate(Math.round(p.x), Math.round(p.y));
    c.fillStyle = '#17362066'; c.beginPath(); c.ellipse(3, 14, 20, 9, 0, 0, Math.PI * 2); c.fill();
    if (selected) { c.strokeStyle = '#e0f59a'; c.lineWidth = 2.5; c.beginPath(); c.ellipse(0, 9, 25, 15, 0, 0, Math.PI * 2); c.stroke(); c.fillStyle = '#e6f7a1'; c.beginPath(); c.moveTo(-7, -37); c.lineTo(7, -37); c.lineTo(0, -29); c.fill(); }
    const stride = p.moving ? Math.round(Math.sin(p.stride) * 5) : 0;
    c.fillStyle = '#152d2a'; c.fillRect(-10, 7 + stride, 7, 10); c.fillRect(3, 7 - stride, 7, 10);
    c.fillStyle = '#eee7ba'; c.fillRect(-10, 8 + stride, 7, 4); c.fillRect(3, 8 - stride, 7, 4);
    c.fillStyle = '#ad7850'; c.fillRect(-17, -7 - stride / 2, 6, 12); c.fillRect(11, -7 + stride / 2, 6, 12);
    const uniform = p.uniform || p.team;
    const club = this.teams?.[uniform];
    c.fillStyle = club?.primaryColor || (uniform === 'home' ? '#e3ecbb' : '#d58c62'); c.fillRect(-13, -12, 26, 19);
    c.fillStyle = club?.secondaryColor || '#e3ecbb'; c.fillRect(-13, -11, 4, 7); c.fillRect(9, -11, 4, 7);
    c.font = 'bold 10px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = club ? '#ffffff' : '#283d2e'; c.fillText(p.number, 0, 0);
    c.fillStyle = '#172f29'; c.fillRect(-10, -26, 20, 15); c.fillStyle = '#dfe9b8'; c.fillRect(-9, -25, 18, 12); c.fillStyle = '#6c8755'; c.fillRect(-2, -25, 4, 12); c.fillStyle = '#263f32'; c.fillRect(p.facing > 0 ? 5 : -10, -17, 6, 5);
    if (p.jukeTime > 0) { c.strokeStyle = '#edff9e'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 34, -.7, 1.5); c.stroke(); }
    c.restore();
  }
}
