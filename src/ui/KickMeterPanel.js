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
    document.querySelector('#kick-meter-title').textContent = `${meter.kind === 'extraPoint' ? 'EXTRA POINT' : meter.kind === 'fieldGoal' ? 'FIELD GOAL' : meter.kind.toUpperCase()} / ${power ? 'POWER' : 'ACCURACY'}`;
    document.querySelector('#kick-meter-help').textContent = power ? 'Lock near the right edge for maximum distance.' : `Power ${Math.round(meter.power * 100)}% locked. Stop on the center line for a straight kick.`;
    document.querySelector('#kick-needle').style.left = `${meter.value * 100}%`;
    document.querySelector('#kick-track').classList.toggle('accuracy', !power);
    this.button.textContent = power ? 'SPACE / LOCK POWER' : 'SPACE / KICK';
    this.button.disabled = paused;
  }
}
