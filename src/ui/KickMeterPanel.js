import { isBeginnerMode } from './BeginnerMode.js';

export class KickMeterPanel {
  constructor(match, lock) {
    this.match = match;
    this.root = document.querySelector('#kick-meter');
    this.button = document.querySelector('#kick-lock');
    this.button.addEventListener('click', lock);
  }
  update(paused) {
    const meter = this.match.rules.phase === 'kickMeter' ? this.match.meter : null;
    this.root.hidden = !meter;
    if (!meter) return;
    const power = meter.stage === 'power';
    const beginner = isBeginnerMode();
    document.querySelector('#kick-meter-title').textContent = beginner ? `${meter.kind === 'extraPoint' ? 'BONUS KICK: 1 POINT' : meter.kind === 'fieldGoal' ? 'SCORING KICK: 3 POINTS' : meter.kind === 'punt' ? 'KICK THE BALL AWAY' : 'KICK TO RESTART PLAY'} / STEP ${power ? '1' : '2'} OF 2` : `${meter.kind === 'extraPoint' ? 'EXTRA POINT' : meter.kind === 'fieldGoal' ? 'FIELD GOAL' : meter.kind.toUpperCase()} / ${power ? 'POWER' : 'ACCURACY'}`;
    document.querySelector('#kick-meter-help').textContent = beginner ? (power ? 'Press Space or the button when the marker is near the right edge. This chooses how far the kick goes.' : 'Now press Space or the button when the marker reaches the center. This keeps the kick straight.') : power ? 'Lock near the right edge for maximum distance.' : `Power ${Math.round(meter.power * 100)}% locked. Stop on the center line for a straight kick.`;
    document.querySelector('#kick-needle').style.left = `${meter.value * 100}%`;
    document.querySelector('#kick-track').classList.toggle('accuracy', !power);
    this.button.textContent = beginner ? (power ? '1. SET DISTANCE / SPACE' : '2. KICK STRAIGHT / SPACE') : power ? 'SPACE / LOCK POWER' : 'SPACE / KICK';
    this.button.disabled = paused;
  }
}
