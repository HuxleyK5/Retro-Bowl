const TAU = Math.PI * 2;
const styles = {
  catch: { color: '#edff9e', label: 'CAUGHT!', life: .75 },
  tackle: { color: '#ffe1ad', label: 'HIT!', life: .65 },
  interception: { color: '#ffb58b', label: 'INTERCEPTION', life: 1.8, banner: true },
  fumble: { color: '#ffd378', label: 'BALL LOOSE!', life: 1.5, banner: true },
  recovery: { color: '#e9f7bc', label: 'RECOVERED', life: 1.1, banner: true },
  brokenTackle: { color: '#f9e39b', label: 'BROKEN TACKLE', life: .85 },
  juke: { color: '#dbf7a0', label: 'JUKE!', life: .5 },
  touchdown: { color: '#f3d47c', label: 'TOUCHDOWN', life: 2.3, banner: true },
  incomplete: { color: '#d4dfc0', label: 'INCOMPLETE', life: .85 },
};

// Presentation time advances with the simulation, so pause freezes every effect.
export class PlayEffects {
  constructor() {
    this.reducedMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.effects = []; this.trails = []; this.generation = null; this.lastEventId = 0; this.trailClock = 0;
  }
  sync(play) {
    if (this.generation !== play.generation) {
      this.generation = play.generation; this.effects = []; this.trails = []; this.trailClock = 0;
    }
    for (const event of play.events || []) {
      if (event.id <= this.lastEventId) continue;
      this.lastEventId = event.id;
      const style = styles[event.type];
      if (!style || !Number.isFinite(event.x) || !Number.isFinite(event.y)) continue;
      this.effects.push({ ...style, ...event, label: event.label || style.label, age: 0 });
    }
    this.effects = this.effects.slice(-24);
  }
  update(dt, play) {
    const step = Math.max(0, Math.min(.1, dt));
    for (const effect of this.effects) effect.age += step;
    this.effects = this.effects.filter(effect => effect.age < effect.life);
    for (const trail of this.trails) trail.age += step;
    this.trails = this.trails.filter(trail => trail.age < .24);
    this.sync(play);
    this.trailClock += step;
    if (!this.reducedMotion && this.trailClock >= .045) {
      this.trailClock = 0;
      for (const player of play.players) {
        if (player.moving && player.jukeTime > 0) this.trails.push({ x: player.x, y: player.y, age: 0 });
      }
      this.trails = this.trails.slice(-32);
    }
  }
  reaction(player) {
    if (!player || this.reducedMotion) return null;
    const effect = this.effects.findLast(effect => String(effect.number) === String(player.number) &&
      (!effect.team || effect.team === player.team) &&
      ['catch', 'interception', 'recovery', 'tackle', 'brokenTackle', 'touchdown'].includes(effect.type));
    if (!effect) return null;
    const t = effect.age;
    if (effect.type === 'tackle' && t < .65) return { tilt: player.facing * Math.min(.9, t * 8), lift: 0, armsUp: false };
    if (effect.type === 'brokenTackle' && t < .24) return { tilt: -player.facing * .18 * (1 - t / .24), lift: 0, armsUp: false };
    const duration = effect.type === 'touchdown' ? .75 : .42;
    if (t < duration) return { tilt: 0, lift: Math.sin(t / duration * Math.PI) * 9, armsUp: true };
    return null;
  }
  drawTrails(c) {
    if (!this.trails.length) return;
    c.save(); c.fillStyle = '#e2f0a8';
    for (const trail of this.trails) {
      c.globalAlpha = (1 - trail.age / .24) * .2;
      c.fillRect(trail.x - 10, trail.y - 12, 20, 19);
    }
    c.restore();
  }
  drawWorld(c) {
    c.save();
    for (const effect of this.effects) {
      const progress = effect.age / effect.life;
      const fade = Math.min(1, (1 - progress) * 3);
      c.globalAlpha = fade; c.strokeStyle = effect.color; c.fillStyle = effect.color; c.lineWidth = 2.5;
      const impact = ['tackle', 'brokenTackle', 'fumble'].includes(effect.type);
      const radius = this.reducedMotion ? 27 : 18 + Math.min(1, progress * 2) * (impact ? 40 : 26);
      c.globalAlpha = fade * .6;
      c.beginPath(); c.ellipse(effect.x, effect.y + 9, radius, radius * .5, 0, 0, TAU); c.stroke();
      if (!this.reducedMotion && progress < .65) {
        for (let i = 0; i < (impact ? 8 : 5); i++) {
          const angle = i / (impact ? 8 : 5) * TAU + .3;
          const spread = 13 + progress * (impact ? 82 : 55);
          const x = effect.x + Math.cos(angle) * spread;
          const y = effect.y - 7 + Math.sin(angle) * spread * .7 - Math.sin(progress * Math.PI) * 15;
          c.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
        }
      }
      if (!effect.banner) {
        c.globalAlpha = fade; c.font = 'bold 17px monospace'; c.textAlign = 'center'; c.textBaseline = 'bottom';
        const y = effect.y - 42 - (this.reducedMotion ? 0 : Math.min(1, progress * 2) * 17);
        c.lineWidth = 5; c.strokeStyle = '#20382b'; c.strokeText(effect.label, effect.x, y); c.fillText(effect.label, effect.x, y);
      }
    }
    c.restore();
  }
  drawBanner(c, width) {
    if (width < 100) return;
    const effect = this.effects.findLast(effect => effect.banner);
    if (!effect) return;
    const progress = effect.age / effect.life;
    const alpha = Math.min(1, (1 - progress) * 5);
    const size = Math.min(28, Math.max(17, width / 22));
    c.save(); c.globalAlpha = alpha; c.font = `bold ${size}px monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
    const w = Math.min(width - 28, c.measureText(effect.label).width + 54);
    const x = (width - w) / 2; const y = 48;
    c.fillStyle = '#172d29ee'; c.fillRect(x, y, w, 49);
    c.fillStyle = effect.color; c.fillRect(x, y, 4, 49); c.fillRect(x + w - 4, y, 4, 49);
    c.fillText(effect.label, width / 2, y + 25, w - 28); c.restore();
  }
}
