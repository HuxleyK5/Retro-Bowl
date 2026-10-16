const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const livePhases = new Set(['passing', 'flight', 'running', 'loose']);

// Every cue is synthesized locally. Musical notes are advanced by simulation time,
// so pausing or starting another game cannot leave a delayed celebration playing.
export class StadiumAudio {
  constructor() {
    this.Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    this.supported = typeof this.Context === 'function';
    this.enabled = false;
    this.paused = false;
    this.unlocked = false;
    this.context = null;
    this.master = null;
    this.noise = null;
    this.crowd = null;
    this.voices = new Set();
    this.notes = [];
    this.time = 0;
    this.reaction = 0;
    this.lastEventId = 0;
    this.previous = null;
    this.play = null;
    this.rules = null;
    this.discardNext = true;
    this.stateRevision = 0;
  }

  get status() {
    if (!this.supported) return 'unavailable';
    if (!this.enabled) return 'muted';
    if (this.paused) return 'paused';
    return this.context?.state === 'running' ? 'on' : 'ready';
  }

  // Call directly from a pointer/key event to satisfy browser audio policies.
  // A rejected resume is harmless; the next trusted gesture may try again.
  async unlock() {
    if (!this.supported) return false;
    try {
      if (!this.context) {
        this.context = new this.Context();
        const context = this.context;
        this.master = context.createGain();
        this.master.gain.value = 0;
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.knee.value = 18;
        compressor.ratio.value = 6;
        compressor.attack.value = .008;
        compressor.release.value = .22;
        this.master.connect(compressor);
        compressor.connect(context.destination);
        this.compressor = compressor;
        this.noise = this.createNoise();
      }
      if (this.enabled && !this.paused) {
        await this.context.resume();
        this.unlocked = this.context.state === 'running';
        // A pause/mute may have happened while the resume promise was pending.
        this.syncState();
      } else {
        this.syncState();
      }
      return this.unlocked;
    } catch {
      if (!this.context || !this.master || !this.noise || this.context.state === 'closed') {
        this.supported = false;
        this.enabled = false;
        this.stop();
      }
      return false;
    }
  }

  setEnabled(value) {
    const enabled = !!value && this.supported;
    if (this.enabled === enabled) return this.enabled;
    this.enabled = enabled;
    this.resync();
    if (!enabled) this.stop();
    this.syncState();
    return this.enabled;
  }

  toggle() { return this.setEnabled(!this.enabled); }

  setPaused(value) {
    const paused = !!value;
    if (this.paused === paused) return;
    this.paused = paused;
    this.resync();
    if (paused) this.stop();
    this.syncState();
  }

  syncState() {
    const context = this.context;
    if (!context || context.state === 'closed') return;
    const active = this.enabled && !this.paused;
    const revision = ++this.stateRevision;
    try {
      this.master.gain.cancelScheduledValues(context.currentTime);
      this.master.gain.setTargetAtTime(active ? .44 : 0, context.currentTime, .035);
      const pending = active ? context.resume() : context.suspend();
      Promise.resolve(pending).then(() => {
        this.unlocked = context.state === 'running';
        if (revision !== this.stateRevision) {
          const shouldRun = this.enabled && !this.paused;
          if ((context.state === 'running') !== shouldRun) this.syncState();
        }
      }).catch(() => {});
    } catch { /* Audio may become unavailable when the browser closes a page. */ }
  }

  createNoise() {
    const context = this.context;
    const buffer = context.createBuffer(2, Math.ceil(context.sampleRate * 2), context.sampleRate);
    let seed = 0x5f3759df;
    for (let channel = 0; channel < 2; channel++) {
      const samples = buffer.getChannelData(channel);
      let low = 0;
      for (let i = 0; i < samples.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const white = seed / 2147483648 - 1;
        low = low * .84 + white * .16;
        samples[i] = white * .54 + low * .8;
      }
    }
    return buffer;
  }

  snapshot(play, rules) {
    return { generation: play?.generation, phase: play?.phase, thrown: !!play?.hasThrown,
      rulesPhase: rules?.phase, result: rules?.result || '', playNumber: rules?.playNumber,
      home: rules?.score?.home || 0, away: rules?.score?.away || 0 };
  }

  baseline(play, rules) {
    this.play = play;
    this.rules = rules;
    this.lastEventId = Math.max(0, play?.eventSerial || 0, ...(play?.events || []).map(event => event.id || 0));
    this.previous = this.snapshot(play, rules);
  }

  // Capture the current objects at the gesture, before another snap can occur.
  // Discarding the following update would also discard fresh events in that tick.
  resync() {
    this.discardNext = !this.play;
    if (this.play) this.baseline(this.play, this.rules);
  }

  reset(play, rules) {
    this.stop();
    this.time = 0;
    this.baseline(play, rules);
    this.discardNext = false;
    this.syncState();
  }

  update(dt, play, rules) {
    if (!play) return;
    const step = clamp(Number.isFinite(dt) ? dt : 0, 0, .1);
    const next = this.snapshot(play, rules);
    if (this.play !== play || !this.previous || this.discardNext) {
      this.baseline(play, rules);
      this.discardNext = false;
      try { this.updateCrowd(step, play, rules); } catch { this.stop(); }
      return;
    }
    const previous = this.previous;
    this.rules = rules;
    const events = [];
    for (const event of play.events || []) {
      if (!Number.isFinite(event.id) || event.id <= this.lastEventId) continue;
      this.lastEventId = event.id;
      events.push(event);
    }
    // Advance cursors even while muted: enabling sound never replays old events.
    this.previous = next;
    if (!this.enabled || this.paused || this.context?.state !== 'running') return;
    this.time += step;
    this.reaction *= Math.exp(-step * .62);
    try {
      const types = new Set(events.map(event => event.type));
      const frame = { impact: false, whistle: false };
      // A forceful contact may also emit tackle/fumble: keep its strongest thud.
      if (types.has('bigHit')) this.event('bigHit', frame);
      for (const event of events) if (event.type !== 'bigHit') this.event(event.type, frame);
      if (!types.has('snap') && ((next.rulesPhase === 'live' && previous.rulesPhase === 'ready') ||
          (next.generation === previous.generation && previous.phase === 'presnap' && livePhases.has(next.phase)))) this.event('snap', frame);
      if (!types.has('pass') && next.thrown && !previous.thrown) this.event('pass', frame);
      if (['kick', 'kickoff'].includes(next.rulesPhase) &&
          (next.rulesPhase !== previous.rulesPhase || next.generation !== previous.generation)) this.event('kick', frame);
      const resultChanged = next.result !== previous.result || next.playNumber !== previous.playNumber;
      const score = next.home + next.away - previous.home - previous.away;
      if (score >= 6 && !types.has('touchdown')) this.event('touchdown', frame);
      else if (score > 0 && score < 6) this.event('score', frame);
      if (resultChanged && /TURNOVER|INTERCEPTION|DEFENSE RECOVERS|FUMBLE \/ TOUCHBACK/.test(next.result) &&
          !types.has('interception') && !types.has('recovery') && !types.has('touchdown') && !types.has('turnover')) this.event('turnover', frame);
      if (next.phase === 'dead' && previous.phase !== 'dead' &&
          !types.has('tackle') && !types.has('touchdown') && !types.has('interception') && !types.has('incomplete')) this.whistle(.075, frame);
      if (resultChanged && /MISSED/.test(next.result)) {
        this.react(.45); this.tone(230, .26, .045, 'triangle', 160);
      }
      while (this.notes.length && this.notes[0].at <= this.time) {
        const note = this.notes.shift();
        if (note.kind === 'beat') this.impact(.5);
        else this.tone(note.frequency, note.duration, note.volume, note.wave || 'square');
      }
      this.updateCrowd(step, play, rules);
    } catch {
      // Audio is optional; a device/browser failure must never interrupt a play.
      this.stop();
    }
  }

  react(intensity) { this.reaction = Math.max(this.reaction, clamp(intensity, 0, 1)); }

  event(type, frame) {
    switch (type) {
      case 'snap': this.noiseBurst(.07, .09, 950); this.tone(140, .09, .055, 'triangle', 80); break;
      case 'pass': this.noiseBurst(.2, .075, 1800, 420); break;
      case 'kick': this.impact(.65, frame); this.noiseBurst(.3, .075, 2200, 650); break;
      case 'catch': this.impact(.45, frame); this.react(.34); break;
      case 'juke': this.tone(340, .1, .045, 'triangle', 680); this.react(.22); break;
      case 'brokenTackle': this.impact(.72, frame); this.react(.58); break;
      case 'bigHit': this.impact(1.3, frame); this.react(.78); break;
      case 'tackle': this.impact(1, frame); this.whistle(.1, frame); this.react(.48); break;
      case 'incomplete': this.whistle(.085, frame); this.react(.18); break;
      case 'fumble': this.impact(.8, frame); this.tone(720, .14, .07, 'triangle', 280); this.react(.85); break;
      case 'recovery': this.tone(392, .12, .06, 'square'); this.react(.7); break;
      case 'interception':
      case 'turnover': this.turnover(frame); break;
      case 'touchdown': this.touchdown(frame); break;
      case 'score':
        this.react(.68);
        this.enqueue([{ delay: 0, frequency: 523.25, duration: .12, volume: .065 },
          { delay: .15, frequency: 659.25, duration: .12, volume: .065 },
          { delay: .3, frequency: 783.99, duration: .3, volume: .065 }]);
        break;
    }
  }

  turnover(frame) {
    this.react(.9);
    this.impact(.75, frame);
    this.whistle(.09, frame);
    this.enqueue([659.25, 523.25, 392].map((frequency, i) =>
      ({ delay: i * .14, frequency, duration: .16, volume: .065, wave: 'triangle' })));
  }

  touchdown(frame) {
    this.react(1);
    this.whistle(.11, frame);
    this.notes = [];
    const melody = [523.25, 659.25, 783.99, 1046.5, 783.99, 659.25, 783.99, 1046.5];
    const timing = [0, .15, .3, .45, .78, .93, 1.08, 1.23];
    this.enqueue(melody.map((frequency, i) => ({ delay: timing[i], frequency,
      duration: i === 7 ? .62 : i === 3 ? .26 : .125, volume: .078 })));
    this.enqueue([0, .3, .6, .9, 1.2, 1.5].flatMap((delay, i) => [
      { delay, frequency: i % 2 ? 196 : 130.81, duration: .21, volume: .08, wave: 'triangle' },
      { delay, kind: 'beat' },
    ]));
    this.enqueue([{ delay: 1.23, frequency: 659.25, duration: .62, volume: .045 },
      { delay: 1.23, frequency: 783.99, duration: .62, volume: .045 }]);
  }

  enqueue(notes) {
    for (const note of notes) this.notes.push({ ...note, at: this.time + note.delay });
    this.notes.sort((a, b) => a.at - b.at);
    this.notes = this.notes.slice(0, 64);
  }

  track(source, nodes) {
    const voice = { source, nodes };
    this.voices.add(voice);
    source.onended = () => {
      for (const node of nodes) { try { node.disconnect(); } catch {} }
      this.voices.delete(voice);
    };
    return voice;
  }

  tone(frequency, duration, volume, wave = 'triangle', endFrequency = frequency) {
    if (this.voices.size >= 36) return;
    const context = this.context, now = context.currentTime;
    const oscillator = context.createOscillator(), gain = context.createGain(), filter = context.createBiquadFilter();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    filter.type = 'lowpass'; filter.frequency.value = wave === 'square' ? 2200 : 3800;
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(clamp(volume, .0001, .16), now + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(filter); filter.connect(gain); gain.connect(this.master);
    this.track(oscillator, [oscillator, filter, gain]);
    oscillator.start(now); oscillator.stop(now + duration + .015);
  }

  noiseBurst(duration, volume, frequency, endFrequency = frequency) {
    if (this.voices.size >= 36) return;
    const context = this.context, now = context.currentTime;
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = this.noise;
    filter.type = 'bandpass'; filter.Q.value = .7;
    filter.frequency.setValueAtTime(frequency, now);
    filter.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(clamp(volume, .0001, .2), now + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    source.connect(filter); filter.connect(gain); gain.connect(this.master);
    this.track(source, [source, filter, gain]);
    source.start(now); source.stop(now + duration + .015);
  }

  impact(strength, frame) {
    if (frame?.impact) return;
    if (frame) frame.impact = true;
    const heavy = strength > 1;
    this.tone(heavy ? 102 : 118, heavy ? .25 : .17, .115 * strength, 'sine', heavy ? 34 : 42);
    this.noiseBurst(heavy ? .18 : .12, .13 * strength, heavy ? 480 : 620, 230);
  }

  whistle(volume, frame) {
    if (frame?.whistle) return;
    if (frame) frame.whistle = true;
    this.tone(2450, .19, volume * .52, 'sine', 2680);
    this.tone(2780, .16, volume * .23, 'sine', 2900);
  }

  updateCrowd(dt, play, rules) {
    if (!this.enabled || this.paused || this.context?.state !== 'running') return;
    if (!this.crowd) {
      const context = this.context;
      const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
      const rumble = context.createBiquadFilter(), lowGain = context.createGain();
      source.buffer = this.noise; source.loop = true;
      filter.type = 'bandpass'; filter.frequency.value = 1150; filter.Q.value = .55;
      rumble.type = 'lowpass'; rumble.frequency.value = 340;
      gain.gain.value = 0; lowGain.gain.value = 0;
      source.connect(filter); filter.connect(gain); gain.connect(this.master);
      source.connect(rumble); rumble.connect(lowGain); lowGain.connect(this.master);
      this.track(source, [source, filter, gain, rumble, lowGain]);
      this.crowd = { source, gain, lowGain, filter };
      source.start();
    }
    const live = livePhases.has(play.phase);
    const nearGoal = live && rules?.spot > 65 ? (rules.spot - 65) / 35 : 0;
    const flutter = Math.sin(this.time * 1.7) * .0025 + Math.sin(this.time * 4.3) * .0015;
    const level = .032 + (live ? .015 : 0) + nearGoal * .017 + this.reaction * .18 + flutter;
    const now = this.context.currentTime;
    const settle = Math.max(.035, dt * 3);
    this.crowd.gain.gain.setTargetAtTime(level, now, settle);
    this.crowd.lowGain.gain.setTargetAtTime(level * .6, now, settle);
    this.crowd.filter.frequency.setTargetAtTime(900 + this.reaction * 950, now, .16);
  }

  stop() {
    this.notes = [];
    this.reaction = 0;
    if (this.master && this.context) {
      try {
        this.master.gain.cancelScheduledValues(this.context.currentTime);
        this.master.gain.setValueAtTime(0, this.context.currentTime);
      } catch {}
    }
    for (const voice of this.voices) {
      try { voice.source.stop(); } catch {}
      for (const node of voice.nodes) { try { node.disconnect(); } catch {} }
    }
    this.voices.clear();
    this.crowd = null;
  }
}
