import { pixelNumber, playerSkin } from './PixelArt.js';

const tone = (hex, amount) => {
  const color = hex.replace('#', '');
  const full = color.length === 3 ? [...color].map(n => n + n).join('') : color;
  const value = parseInt(full, 16);
  return '#' + [16, 8, 0].map(shift => Math.max(0, Math.min(255, ((value >> shift) & 255) + amount)).toString(16).padStart(2, '0')).join('');
};

// A side-view, full-body arcade sprite. All limb poses land on whole pixels.
export function drawArcadePlayer(c, player, { jersey, trim, helmet, numberColor }, reaction, carrier) {
  c.clearRect(0, 0, 40, 60);
  const facing = reaction?.facing ?? player.facing;
  c.save(); c.translate(20, 36); c.scale(facing < 0 ? -1 : 1, 1);
  const ink = '#18212b', skin = playerSkin(player.data || player);
  const rect = (x, y, w, h, color) => { c.fillStyle = color; c.fillRect(x, y, w, h); };
  const line = (x0, y0, x1, y1, width, color) => {
    const dx = Math.abs(x1-x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1-y0), sy = y0 < y1 ? 1 : -1;
    let error = dx+dy;
    while (true) {
      rect(x0-Math.floor(width/2), y0-Math.floor(width/2), width, width, color);
      if (x0 === x1 && y0 === y1) break;
      const twice = error*2;
      if (twice >= dy) { error += dy; x0 += sx; }
      if (twice <= dx) { error += dx; y0 += sy; }
    }
  };
  const running = player.moving && !reaction?.diving;
  const frame = running ? Math.floor(player.stride / (Math.PI * 2) * 6) % 6 : 0;
  const poses = [
    [[-4,6,-9,12],[5,6,9,10]],
    [[-6,4,-10,6],[2,8,5,13]],
    [[-4,5,-7,4],[-1,7,2,13]],
    [[5,6,9,10],[-4,6,-9,12]],
    [[2,8,5,13],[-6,4,-10,6]],
    [[-1,7,2,13],[-4,5,-7,4]],
  ];
  const legs = reaction?.diving ? [[-4,4,-10,6],[3,5,0,10]] : running ? poses[frame] : [[-4,7,-5,12],[4,7,5,12]];
  const leg = (pose, back) => {
    const [kx, ky, fx, fy] = pose;
    line(back ? -3 : 2, 0, kx, ky, 6, ink);
    line(back ? -3 : 2, 0, kx, ky, 4, back ? '#afb9c9' : '#f5f2df');
    line(kx, ky, fx, fy-1, 4, ink);
    line(kx, ky, fx, fy-1, 2, back ? tone(trim,-30) : trim);
    rect(fx-2, fy-1, 7, 3, ink); rect(fx, fy+1, 5, 1, '#ebedd8');
  };
  leg(legs[0], true);
  const bob = running && (frame === 1 || frame === 4) ? -1 : 0;
  c.translate(running ? 1 : 0, bob);
  const arm = (back) => {
    const pump = running ? (frame < 3 ? -1 : 1) * (back ? -1 : 1) : 0;
    const up = reaction?.armsUp || reaction?.diving;
    const elbow = up ? [8,-19] : carrier && !back ? [8,-4] : [pump*6+1,-5];
    const hand = up ? [11,-27] : carrier && !back ? [12,-8] : [pump*8+5,-9];
    line(back ? -5 : 1,-11, ...elbow, 5, ink);
    line(back ? -5 : 1,-11, ...elbow, 3, back ? tone(skin,-30) : skin);
    line(...elbow, ...hand, 5, ink); line(...elbow, ...hand, 3, back ? tone(skin,-30) : skin);
    rect(hand[0]-1, hand[1]-1, 3, 3, '#f0f0dc');
  };
  arm(true);
  // Compact pads, a fitted waist, and bright pants replace the portrait silhouette.
  rect(-8,-15,14,3,ink); rect(-9,-12,17,9,ink); rect(-6,-3,12,5,ink);
  rect(-7,-14,12,3,jersey); rect(-8,-11,15,7,jersey); rect(-5,-4,10,5,jersey);
  rect(-8,-11,3,5,tone(jersey,-34)); rect(-5,-14,8,2,tone(jersey,35));
  rect(-8,-10,4,2,trim); rect(4,-11,3,2,trim);
  rect(-5,0,10,2,'#f5f2df'); rect(-5,1,10,1,ink);
  c.save();
  if (facing < 0) c.scale(-1, 1);
  pixelNumber(player.number, facing < 0 ? -3 : -4, -9, numberColor, rect);
  c.restore();
  leg(legs[1], false);
  // Small profile helmet with exposed cheek, ear hole and a projecting face guard.
  const hx = running ? 2 : 0;
  c.save(); c.translate(hx,0);
  rect(-5,-29,10,2,ink); rect(-8,-27,15,3,ink); rect(-9,-24,17,8,ink);
  rect(-6,-27,11,2,helmet); rect(-7,-25,13,7,helmet); rect(-8,-23,15,5,helmet);
  rect(-5,-27,3,2,tone(helmet,65)); rect(-7,-24,2,3,tone(helmet,45));
  rect(-7,-19,9,2,tone(helmet,-35)); rect(-2,-27,2,5,trim);
  rect(3,-22,6,6,ink); rect(4,-21,4,4,skin); rect(6,-21,1,1,ink);
  rect(2,-20,2,5,helmet); rect(2,-19,1,2,ink);
  rect(8,-20,4,1,'#dce3dd'); rect(11,-20,1,5,'#dce3dd');
  rect(7,-16,5,1,'#dce3dd'); rect(8,-18,4,1,'#8d9b9e');
  rect(-1,-16,6,2,ink); rect(1,-16,3,2,skin);
  c.restore();
  arm(false);
  c.restore();
}
