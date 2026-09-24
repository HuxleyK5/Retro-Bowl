export class Field {
  constructor() {
    this.yard = 20;
    this.width = 120 * this.yard;
    this.height = 53.333 * this.yard;
    this.endZone = 10 * this.yard;
    this.margin = 95;
  }
  constrain(player) {
    player.x = Math.max(player.radius, Math.min(this.width - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(this.height - player.radius, player.y));
  }
  positionLabel(x) {
    const yard = Math.round((x - this.endZone) / this.yard);
    if (yard <= 0 || yard >= 100) return 'END ZONE';
    return yard <= 50 ? `OWN ${yard} YD` : `OPP ${100 - yard} YD`;
  }
}
