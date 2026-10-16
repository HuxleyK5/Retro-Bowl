const TAU = Math.PI * 2;
const confettiColors = ['#fff0af', '#f4bf50', '#ed6c50', '#87d5d2', '#ecf8dd'];
const styles = {
  catch: { color: '#edff9e', label: 'CAUGHT!', life: .85 },
  tackle: { color: '#ffe1ad', label: 'HIT!', life: .7 },
  bigHit: { color: '#ffae72', label: 'BIG HIT!', life: 1.15 },
  interception: { color: '#ffab86', label: 'INTERCEPTION', subtitle: 'TURNOVER / DEFENSE TAKES OVER', life: 2.8, banner: true },
  fumble: { color: '#ffd378', label: 'BALL LOOSE!', subtitle: 'FUMBLE / CHASE THE BALL', life: 1.6, banner: true },
  recovery: { color: '#e9f7bc', label: 'RECOVERED', life: 1.65, banner: true },
  turnover: { color: '#ffab86', label: 'TURNOVER', subtitle: 'CHANGE OF POSSESSION', life: 2.8, banner: true },
  brokenTackle: { color: '#f9e39b', label: 'BROKEN TACKLE', life: .9 },
  juke: { color: '#dbf7a0', label: 'JUKE!', life: .5 },
  touchdown: { color: '#f3d47c', label: 'TOUCHDOWN', subtitle: '+6 POINTS / WHAT A PLAY!', life: 3.6, banner: true },
  incomplete: { color: '#d4dfc0', label: 'INCOMPLETE', life: .85 },
};
const isTurnover = effect => effect.type === 'interception' || effect.type === 'turnover' ||
  (effect.type === 'recovery' && effect.team === 'away');

// Particles derive from event IDs, so redraws never restart effects or consume
// simulation randomness. Presentation time also freezes when the game is paused.
export class PlayEffects {
  constructor() {
    this.reducedMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.effects = []; this.trails = []; this.generation = null; this.lastEventId = 0; this.trailClock = 0;
  }
  sync(play) {
    if (this.generation !== play.generation) {
      this.generation = play.generation; this.effects = []; this.trails = []; this.trailClock = 0; this.lastEventId = 0;
    }
    for (const event of play.events || []) {
      if (event.id <= this.lastEventId) continue;
      this.lastEventId = event.id;
      const style = styles[event.type];
      if (!style || !Number.isFinite(event.x) || !Number.isFinite(event.y)) continue;
      const effect = { ...style, ...event, label: event.label || style.label, age: 0 };
      if (isTurnover(effect)) {
        effect.color = '#ffab86';
        effect.subtitle = effect.type === 'recovery' ? 'TURNOVER / DEFENSE TAKES OVER' : style.subtitle;
      }
      this.effects.push(effect);
    }
    this.effects = this.effects.slice(-24);
  }
  update(dt, play) {
    const step = Number.isFinite(dt) ? Math.max(0, Math.min(.1, dt)) : 0;
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
    if (!player) return null;
    const matches = effect => String(effect.number) === String(player.number) && (!effect.team || effect.team === player.team);
    // A tackle and a big hit can share a tick; retain the stronger contact pose.
    const effect = this.effects.findLast(effect => matches(effect) && effect.type === 'touchdown') ||
      this.effects.findLast(effect => matches(effect) && effect.type === 'bigHit') ||
      this.effects.findLast(effect => matches(effect) &&
        ['catch', 'interception', 'recovery', 'fumble', 'tackle', 'brokenTackle', 'touchdown'].includes(effect.type));
    if (!effect) return null;
    const t = effect.age;
    if (this.reducedMotion) return ['touchdown', 'interception', 'recovery'].includes(effect.type) ? { tilt: 0, lift: 0, armsUp: true } : null;
    if (effect.type === 'bigHit') {
      const fall = Math.min(1, t / .16), settle = Math.min(1, Math.max(0, t - .6) / .55);
      return { tilt: player.facing * fall * (1 - settle) * 1.05, lift: Math.sin(fall * Math.PI) * 4, armsUp: false };
    }
    if (effect.type === 'tackle' && t < .7) return { tilt: player.facing * Math.min(.75, t * 8), lift: 0, armsUp: false };
    if (effect.type === 'fumble' && t < .5) return { tilt: -player.facing * Math.sin(t / .5 * Math.PI) * .32, lift: 0, armsUp: false };
    if (effect.type === 'brokenTackle' && t < .24) return { tilt: -player.facing * .18 * (1 - t / .24), lift: 0, armsUp: false };
    if (effect.type === 'touchdown') {
      const jump = t < 2.8 ? Math.max(0, Math.sin(t * Math.PI * 2.4)) : 0;
      return { tilt: Math.sin(t * 7) * .1 * Math.min(1, t * 5) * Math.max(0, 1 - t / effect.life), lift: jump * 11, armsUp: true };
    }
    if (t < .5 && ['catch', 'interception', 'recovery'].includes(effect.type)) return { tilt: 0, lift: Math.sin(t / .5 * Math.PI) * 10, armsUp: true };
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
      const impact = ['tackle', 'bigHit', 'brokenTackle', 'fumble'].includes(effect.type);
      const turnover = isTurnover(effect);
      const touchdown = effect.type === 'touchdown';
      const radius = this.reducedMotion ? 30 : 18 + Math.min(1, progress * 2.5) * (effect.type === 'bigHit' ? 58 : impact ? 40 : 30);
      c.globalAlpha = fade * .65; c.strokeStyle = effect.color; c.fillStyle = effect.color; c.lineWidth = effect.type === 'bigHit' ? 4 : 2.5;
      c.beginPath(); c.ellipse(effect.x, effect.y + 9, radius, radius * .5, 0, 0, TAU); c.stroke();
      if (turnover) {
        // Sharp points distinguish a possession change from a catch ring.
        c.beginPath();
        for (let i = 0; i <= 24; i++) {
          const angle = i / 24 * TAU, r = i % 2 ? radius * .65 : radius * 1.15;
          const x = effect.x + Math.cos(angle) * r, y = effect.y - 7 + Math.sin(angle) * r * .8;
          if (!i) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.stroke();
      }
      if (!this.reducedMotion && progress < .8) {
        const count = touchdown ? 22 : effect.type === 'bigHit' ? 14 : impact || turnover ? 10 : 5;
        for (let i = 0; i < count; i++) {
          const angle = i / count * TAU + (effect.id % 7) * .2;
          const spread = 15 + progress * (touchdown ? 210 : effect.type === 'bigHit' ? 135 : impact || turnover ? 90 : 58);
          const x = effect.x + Math.cos(angle) * spread;
          const y = effect.y - 7 + Math.sin(angle) * spread * .7 - Math.sin(progress * Math.PI) * (touchdown ? 65 : 18);
          c.globalAlpha = fade * Math.max(0, 1 - progress / .8);
          c.fillStyle = touchdown ? confettiColors[i % confettiColors.length] : effect.color;
          if (effect.type === 'bigHit') {
            c.save(); c.translate(x, y); c.rotate(angle); c.fillRect(-6, -2, 12, 4); c.restore();
          } else c.fillRect(Math.round(x) - 2, Math.round(y) - 2, touchdown ? 6 : 4, 4);
        }
      }
      if (!effect.banner) {
        c.globalAlpha = fade; c.fillStyle = effect.color; c.font = `bold ${effect.type === 'bigHit' ? 23 : 17}px monospace`; c.textAlign = 'center'; c.textBaseline = 'bottom';
        const y = effect.y - 42 - (this.reducedMotion ? 0 : Math.min(1, progress * 2) * 20);
        c.lineWidth = 5; c.strokeStyle = '#13261f'; c.strokeText(effect.label, effect.x, y); c.fillText(effect.label, effect.x, y);
      }
    }
    c.restore();
  }
  drawScreen(c, width, height) {
    if (width < 100 || height < 100) return;
    const touchdown = this.effects.findLast(effect => effect.type === 'touchdown');
    const turnover = this.effects.findLast(effect => isTurnover(effect));
    const effect = touchdown || turnover;
    if (!effect) return;
    const fade = Math.min(1, (1 - effect.age / effect.life) * 4);
    c.save();
    c.globalAlpha = fade * .8; c.strokeStyle = effect.color; c.lineWidth = touchdown ? 5 : 3;
    c.strokeRect(2, 2, width - 4, height - 4);
    if (touchdown && !this.reducedMotion) {
      const count = width < 600 ? 56 : 96;
      for (let i = 0; i < count; i++) {
        const seed = ((i * 73 + effect.id * 29) % 997) / 997;
        const launch = Math.max(0, touchdown.age + .16 - (i % 6) * .025);
        if (!launch) continue;
        const fromLeft = i % 2 === 0;
        const vx = width * (.12 + seed * .3);
        const x = (fromLeft ? -8 : width + 8) + (fromLeft ? 1 : -1) * vx * launch;
        const y = height * (.7 + (i % 5) * .07) - (height * (.55 + seed * .4)) * launch + height * .31 * launch * launch;
        c.save(); c.translate(x, y); c.rotate(i * 1.7 + launch * (2 + seed * 5));
        c.globalAlpha = fade * .9; c.fillStyle = confettiColors[i % confettiColors.length];
        c.fillRect(-3, -2, 6 + seed * 4, 3 + Math.abs(Math.sin(launch * 5 + i)) * 4); c.restore();
      }
    }
    c.restore();
  }
  drawBanner(c, width, height = 0) {
    if (width < 100) return;
    const effect = this.effects.findLast(effect => effect.type === 'touchdown') || this.effects.findLast(effect => effect.banner);
    if (!effect) return;
    const progress = effect.age / effect.life;
    const alpha = Math.min(1, (1 - progress) * 5);
    const touchdown = effect.type === 'touchdown';
    const size = touchdown ? Math.min(52, Math.max(23, width / 13)) : Math.min(27, Math.max(16, width / 23));
    const enter = this.reducedMotion ? 1 : Math.min(1, effect.age / .18);
    const bannerHeight = touchdown ? (width < 480 ? 96 : 118) : effect.subtitle ? 75 : 53;
    const y = touchdown ? Math.max(48, Math.min(130, height * .2)) : 48;
    const offset = this.reducedMotion ? 0 : (1 - enter) * -16;
    c.save(); c.globalAlpha = alpha; c.translate(0, offset); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `bold ${size}px monospace`;
    const w = touchdown ? width : Math.min(width - 24, Math.max(c.measureText(effect.label).width + 44, effect.subtitle ? Math.min(500, width - 24) : 0));
    const x = (width - w) / 2;
    c.fillStyle = touchdown ? '#132b27f5' : '#172d29f2'; c.fillRect(x, y, w, bannerHeight);
    c.fillStyle = effect.color;
    if (touchdown) {
      c.fillRect(x, y, w, 4); c.fillRect(x, y + bannerHeight - 4, w, 4);
      c.globalAlpha = alpha * .12;
      for (const edge of [0, width]) {
        c.beginPath(); c.moveTo(edge, y + 4); c.lineTo(edge + (edge ? -45 : 45), y + bannerHeight / 2); c.lineTo(edge, y + bannerHeight - 4); c.fill();
      }
      c.globalAlpha = alpha;
    } else { c.fillRect(x, y, 4, bannerHeight); c.fillRect(x + w - 4, y, 4, bannerHeight); }
    c.fillText(effect.label, width / 2, y + (effect.subtitle ? bannerHeight * .38 : bannerHeight / 2), w - (touchdown ? 34 : 24));
    if (effect.subtitle) {
      c.font = `bold ${touchdown ? Math.min(17, Math.max(12, width / 34)) : Math.min(12, Math.max(10, width / 42))}px monospace`;
      c.fillStyle = '#f6f1d9'; c.fillText(effect.subtitle, width / 2, y + bannerHeight * .73, w - 28);
    }
    c.restore();
  }
}
