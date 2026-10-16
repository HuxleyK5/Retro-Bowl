const TAU = Math.PI * 2;
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const hash = seed => {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return n - Math.floor(n);
};
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

// All motion uses simulation time. Rendering never changes the scene, including
// precipitation, so pausing produces a perfectly still stadium.
export class Stadium {
  constructor(field) {
    this.field = field;
    this.weather = 'clear';
    this.cycle = 'auto';
    this.reducedMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.stands = null;
    this.paletteKey = '';
    this.drops = Array.from({ length: 100 }, (_, i) => ({
      x: hash(i + 1), y: hash(i + 121), speed: .75 + hash(i + 241) * .7,
      size: 1 + hash(i + 361) * 1.6, phase: hash(i + 481) * TAU,
    }));
    this.reset();
  }

  reset() {
    this.time = 0;
    this.darkness = this.cycle === 'night' ? 1 : this.cycle === 'dusk' ? .5 : 0;
    this.crowdEnergy = 0;
    this.crowdTeam = 'home';
    this.lastEventId = 0;
    this.play = null;
    this.matchProgress = 0;
  }

  get timeLabel() { return this.darkness < .23 ? 'DAY' : this.darkness < .76 ? 'DUSK' : 'NIGHT'; }
  get weatherLabel() { return this.weather === 'rain' ? 'RAIN' : this.weather === 'snow' ? 'SNOW' : 'CLEAR'; }
  get label() { return `${this.weatherLabel} / ${this.timeLabel}`; }

  update(dt, play, rules) {
    const step = clamp(Number(dt) || 0, 0, .1);
    this.time += step;
    this.crowdEnergy = Math.max(0, this.crowdEnergy - step * .24);
    if (rules && Number.isFinite(rules.quarter) && rules.quarterSeconds > 0) {
      this.matchProgress = clamp(((rules.quarter - 1) + 1 - rules.clock / rules.quarterSeconds) / 4);
    }
    const progress = rules ? this.matchProgress : (this.time % 480) / 240;
    const autoDarkness = smooth((progress <= 1 ? progress : 2 - progress) / .86 - .12);
    const target = this.cycle === 'night' ? 1 : this.cycle === 'dusk' ? .5 : this.cycle === 'day' ? 0 : autoDarkness;
    this.darkness += (target - this.darkness) * (1 - Math.exp(-step * 1.8));

    if (!play) return;
    // A replacement Play may restart event IDs; ordinary new downs do not.
    if (this.play !== play) { this.play = play; this.lastEventId = 0; }
    for (const event of play.events || []) {
      if (event.id <= this.lastEventId) continue;
      this.lastEventId = event.id;
      const energy = { touchdown: 1.6, interception: 1.1, turnover: 1.2, bigHit: 1, recovery: 1, fumble: .85, tackle: .65, brokenTackle: .6, catch: .4 }[event.type];
      if (!energy) continue;
      this.crowdEnergy = Math.max(this.crowdEnergy, energy);
      this.crowdTeam = event.uniform || event.team || 'home';
    }
  }

  makeStand(length, home, away, seed) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(length); canvas.height = 190;
    const c = canvas.getContext('2d');
    if (!c) return null;
    c.fillStyle = '#283d43'; c.fillRect(0, 0, length, 190);
    const colors = [home, home, home, away, '#c9cebf', '#c7a679', '#6d8d98', '#314d65'];
    const skin = ['#ddb08a', '#9b6d4e', '#6c4838', '#c48f66'];
    for (let row = 0; row < 8; row++) {
      const y = 8 + row * 22;
      c.fillStyle = row % 2 ? '#344b50' : '#3c5356'; c.fillRect(0, y + 13, length, 8);
      c.fillStyle = '#142b32'; c.fillRect(0, y + 20, length, 2);
      for (let col = 0; col < length / 13; col++) {
        const x = 4 + col * 13;
        const n = seed + row * 313 + col;
        if (x % 390 < 28 || hash(n + 91) < .08) continue;
        c.fillStyle = '#192f38'; c.fillRect(x - 1, y + 5, 10, 14);
        c.fillStyle = colors[Math.floor(hash(n) * colors.length)]; c.fillRect(x, y + 6, 8, 9);
        c.fillStyle = skin[Math.floor(hash(n + 18) * skin.length)]; c.fillRect(x + 2, y + 1, 4, 5);
        if (hash(n + 31) < .27) { c.fillStyle = colors[Math.floor(hash(n + 61) * colors.length)]; c.fillRect(x + 1, y, 6, 2); }
      }
    }
    for (let x = 0; x < length; x += 390) {
      c.fillStyle = '#6f7d78'; c.fillRect(x, 0, 25, 181);
      c.fillStyle = '#96a49a';
      for (let y = 12; y < 181; y += 22) c.fillRect(x + 2, y, 21, 3);
      c.fillStyle = '#c0c8ae'; c.fillRect(x + 11, 3, 2, 174);
    }
    c.fillStyle = '#142b32'; c.fillRect(0, 181, length, 9);
    c.fillStyle = '#bac7b8'; c.fillRect(0, 181, length, 3);
    return canvas;
  }

  ensureStands(teams) {
    const home = teams?.home?.primaryColor || '#d7e8ac';
    const away = teams?.away?.primaryColor || '#d48a5d';
    const key = `${home}:${away}:${this.field.width}:${this.field.height}`;
    if (this.paletteKey === key && this.stands) return;
    this.paletteKey = key;
    this.stands = [this.makeStand(this.field.width + 460, home, away, 12),
      this.makeStand(this.field.width + 460, home, away, 351),
      this.makeStand(this.field.height + 152, home, away, 831)];
  }

  drawWorld(c, teams, effects) {
    const { width: w, height: h, endZone: end } = this.field;
    this.ensureStands(teams);
    const active = effects?.effects?.some(effect => effect.type === 'touchdown' && effect.age < effect.life);
    const energy = Math.max(this.crowdEnergy, active ? 1 : 0);
    c.save();
    c.fillStyle = '#233b3b'; c.fillRect(-480, -480, w + 960, h + 960);
    c.fillStyle = '#4e6256'; c.fillRect(-74, -74, w + 148, h + 148);
    c.fillStyle = '#718273'; c.fillRect(-56, -56, w + 112, h + 112);
    c.strokeStyle = '#d8dfbf'; c.lineWidth = 3; c.strokeRect(-22, -22, w + 44, h + 44);
    c.setLineDash([15, 10]); c.lineWidth = 2; c.strokeStyle = '#c7d0b392'; c.strokeRect(-47, -47, w + 94, h + 94); c.setLineDash([]);
    if (this.stands?.[0]) c.drawImage(this.stands[0], -230, -264);
    if (this.stands?.[1]) c.drawImage(this.stands[1], -230, h + 74);
    if (this.stands?.[2]) {
      c.save(); c.translate(-74, -76); c.rotate(Math.PI / 2); c.drawImage(this.stands[2], 0, 0); c.restore();
      c.save(); c.translate(w + 264, -76); c.rotate(Math.PI / 2); c.drawImage(this.stands[2], 0, 0); c.restore();
    }
    this.drawCrowd(c, teams, energy);
    // Low walls, club boards, benches, and substitutes make the touchlines distinct.
    for (const side of ['home', 'away']) {
      const y = side === 'home' ? -73 : h + 65;
      const color = teams?.[side]?.primaryColor || (side === 'home' ? '#b6ce91' : '#c78b65');
      c.fillStyle = '#192e36'; c.fillRect(0, y, w, 9);
      for (let x = 70; x < w - 50; x += 340) {
        c.fillStyle = color; c.fillRect(x, y + 1, 245, 7);
        c.font = 'bold 11px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#f0efd8';
        c.fillText((teams?.[side]?.abbreviation || 'POCKET FIELD').toUpperCase(), x + 122, y + 5);
      }
      const benchY = side === 'home' ? -54 : h + 44;
      for (let x = w * .34; x <= w * .66; x += 220) {
        c.fillStyle = '#283d40'; c.fillRect(x - 43, benchY + 5, 86, 8);
        c.fillStyle = '#c1c6ab'; c.fillRect(x - 43, benchY, 86, 5);
      }
      for (let i = 0; i < 25; i++) {
        const x = w * .29 + i * 41;
        const py = side === 'home' ? -34 - (i % 3) * 4 : h + 32 + (i % 3) * 4;
        c.fillStyle = '#283537'; c.fillRect(x - 4, py + 4, 3, 5); c.fillRect(x + 1, py + 4, 3, 5);
        c.fillStyle = i % 7 === 0 ? '#dedec8' : color; c.fillRect(x - 5, py - 5, 10, 10);
        c.fillStyle = '#d8c5a3'; c.fillRect(x - 3, py - 10, 6, 6);
      }
    }
    // Orange chain crew and equipment outside the live field.
    for (const x of [end + 190, end + 390]) {
      c.fillStyle = '#ee9e45'; c.fillRect(x - 2, -41, 4, 22); c.fillRect(x - 7, -46, 14, 11);
      c.fillStyle = '#273638'; c.fillRect(x - 4, -43, 8, 5);
    }
    for (const x of [end - 45, w - end + 45]) for (const y of [-47, h + 35]) {
      c.fillStyle = '#e8e9c7'; c.fillRect(x - 9, y, 18, 13);
      c.fillStyle = '#d58a4c'; c.fillRect(x - 10, y - 2, 20, 4);
    }
    this.drawFloodlights(c);
    c.restore();
  }

  drawCrowd(c, teams, energy) {
    const { width: w, height: h } = this.field;
    const bounce = this.reducedMotion ? 0 : energy;
    for (const side of ['home', 'away']) {
      const bottom = side === 'away';
      const color = teams?.[side]?.primaryColor || (bottom ? '#d48a5d' : '#d7e8ac');
      const cheering = energy * (this.crowdTeam === side ? 1 : .45);
      for (let i = 0; i < 102; i++) {
        if (hash(i + (bottom ? 7 : 1)) < .24) continue;
        const x = 17 + i * (w - 34) / 102;
        const lift = Math.max(0, Math.sin(this.time * (energy > 0 ? 8 : 2.2) + i * .83)) * (2 + bounce * 6);
        const y = (bottom ? h + 88 : -91) - (this.reducedMotion ? 0 : lift);
        c.fillStyle = i % 4 ? color : '#b6c5bd'; c.fillRect(x - 4, y, 8, 8);
        c.fillStyle = i % 3 ? '#c79269' : '#795641'; c.fillRect(x - 2, y - 5, 4, 5);
        if (cheering > .3 && (i % 3 || energy > 1)) {
          c.fillRect(x - 7, y - 5, 3, 9); c.fillRect(x + 4, y - 5, 3, 9);
        }
      }
    }
  }

  drawFloodlights(c) {
    const { width: w, height: h } = this.field;
    const glow = smooth((this.darkness - .14) / .65);
    for (const x of [170, w / 2, w - 170]) for (const y of [-116, h + 116]) {
      c.fillStyle = '#172b35'; c.fillRect(x - 4, y - 7, 8, 82);
      c.fillStyle = '#758b90'; c.fillRect(x - 2, y - 7, 3, 81);
      if (glow > .02) {
        const halo = c.createRadialGradient(x, y, 4, x, y, 126);
        halo.addColorStop(0, `rgba(255,247,186,${glow * .25})`); halo.addColorStop(1, 'rgba(255,247,186,0)');
        c.fillStyle = halo; c.fillRect(x - 126, y - 126, 252, 252);
      }
      c.fillStyle = '#213c46'; c.fillRect(x - 35, y - 13, 70, 26);
      c.fillStyle = glow > .1 ? '#fff6ca' : '#aebeb5';
      for (let col = 0; col < 6; col++) for (let row = 0; row < 2; row++) c.fillRect(x - 30 + col * 10, y - 9 + row * 10, 7, 7);
    }
  }

  drawLighting(c, width, height) {
    c.save();
    const dusk = Math.sin(this.darkness * Math.PI);
    if (dusk > .01) { c.fillStyle = `rgba(239,167,105,${dusk * .055})`; c.fillRect(0, 0, width, height); }
    if (this.darkness > .01) {
      c.fillStyle = `rgba(10,22,53,${this.darkness * .14})`; c.fillRect(0, 0, width, height);
      const vignette = c.createRadialGradient(width * .5, height * .5, height * .12, width * .5, height * .5, Math.max(width, height) * .66);
      vignette.addColorStop(0, 'rgba(7,16,36,0)'); vignette.addColorStop(1, `rgba(7,16,36,${this.darkness * .14})`);
      c.fillStyle = vignette; c.fillRect(0, 0, width, height);
      // Floodlight spill is deliberately restrained to preserve jersey contrast.
      c.globalCompositeOperation = 'screen';
      for (const x of [width * .2, width * .8]) {
        const beam = c.createRadialGradient(x, -height * .1, 0, x, height * .15, height * .9);
        beam.addColorStop(0, `rgba(232,244,255,${this.darkness * .075})`); beam.addColorStop(1, 'rgba(232,244,255,0)');
        c.fillStyle = beam; c.fillRect(0, 0, width, height);
      }
    }
    c.restore();
  }

  drawWeather(c, width, height) {
    if (this.weather !== 'rain' && this.weather !== 'snow') return;
    const rain = this.weather === 'rain';
    c.save();
    c.fillStyle = rain ? 'rgba(27,49,69,.028)' : 'rgba(217,231,237,.022)'; c.fillRect(0, 0, width, height);
    c.strokeStyle = 'rgba(198,224,235,.43)'; c.fillStyle = 'rgba(242,248,246,.8)'; c.lineWidth = 1;
    const count = this.reducedMotion ? 18 : rain ? 64 : 72;
    for (let i = 0; i < count; i++) {
      const drop = this.drops[i];
      const speed = this.reducedMotion ? 0 : rain ? .7 : .065;
      const y = ((drop.y + this.time * drop.speed * speed) % 1) * (height + 30) - 15;
      const drift = this.reducedMotion ? 0 : rain ? this.time * 46 * drop.speed : Math.sin(this.time * .65 + drop.phase) * 22;
      const x = ((drop.x * (width + 70) + drift) % (width + 70) + width + 70) % (width + 70) - 35;
      if (rain) { c.beginPath(); c.moveTo(x, y); c.lineTo(x - 4, y + 12 + drop.size * 2); c.stroke(); }
      else { c.globalAlpha = .35 + drop.size * .2; c.fillRect(Math.round(x), Math.round(y), drop.size, drop.size); }
    }
    c.restore();
  }
}
