export class GameState {
  constructor(onChange = () => {}) { this.mode = 'playing'; this.onChange = onChange; }
  get playing() { return this.mode === 'playing'; }
  set(mode) {
    if (!['playing', 'paused'].includes(mode)) throw new Error(`Unknown game state: ${mode}`);
    if (mode === this.mode) return;
    this.mode = mode;
    this.onChange(mode);
  }
  togglePause() { this.set(this.playing ? 'paused' : 'playing'); }
}
