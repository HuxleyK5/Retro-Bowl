export class PlayRenderer {
  drawGuides(c, play, aim) {
    c.save();
    if (!play.isKickoff) {
    c.strokeStyle = '#a6ddedaa'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(play.lineOfScrimmage, 0); c.lineTo(play.lineOfScrimmage, play.field.height); c.stroke();
    if (play.firstDownX) {
      c.strokeStyle = '#f3ce6cbb'; c.beginPath(); c.moveTo(play.firstDownX, 0); c.lineTo(play.firstDownX, play.field.height); c.stroke();
    }
    }
    c.strokeStyle = '#f4d37d'; c.lineWidth = 5;
    for (const x of [5, play.field.width - 5]) {
      const y = play.field.height / 2;
      c.beginPath(); c.moveTo(x, y + 60); c.lineTo(x, y - 60); c.moveTo(x - 25, y - 60); c.lineTo(x + 25, y - 60); c.moveTo(x - 25, y - 60); c.lineTo(x - 25, y - 110); c.moveTo(x + 25, y - 60); c.lineTo(x + 25, y - 110); c.stroke();
    }
    if (play.phase === 'presnap') {
      c.setLineDash([12, 12]); c.lineWidth = 3; c.strokeStyle = '#edf4b68c';
      for (const receiver of play.receivers) {
        c.strokeStyle = receiver === play.rb ? '#f6ca70cc' : play.call?.type === 'run' ? '#a7b89a77' : '#edf4b68c';
        c.beginPath(); c.moveTo(receiver.x, receiver.y);
        receiver.route.forEach(p => c.lineTo(p.x, p.y)); c.stroke();
        const end = receiver.route.at(-1);
        const prev = receiver.route.length > 1 ? receiver.route.at(-2) : receiver;
        c.save(); c.setLineDash([]); c.translate(end.x, end.y); c.rotate(Math.atan2(end.y - prev.y, end.x - prev.x));
        c.beginPath(); c.moveTo(-14, -9); c.lineTo(0, 0); c.lineTo(-14, 9); c.stroke(); c.restore();
      }
    }
    if (play.call?.type === 'run' && play.live && play.execution.guided) {
      c.strokeStyle = '#f6ca7088'; c.lineWidth = 3; c.setLineDash([10, 12]); c.beginPath(); c.moveTo(play.rb.x, play.rb.y);
      play.rb.route.slice(play.rb.routeIndex).forEach(p => c.lineTo(p.x, p.y)); c.stroke(); c.setLineDash([]);
    }
    if (play.canThrow && aim) {
      const { target, receiver } = aim;
      c.strokeStyle = receiver ? '#edff9e' : '#fff3ca'; c.lineWidth = 2; c.setLineDash([9, 10]);
      c.setLineDash([]); c.fillStyle = '#fff3ca';
      const dots = Math.max(12, Math.ceil(Math.hypot(target.x-play.qb.x, target.y-play.qb.y)/22));
      for (let i = 0; i <= dots; i++) {
        const t = i / dots;
        const height = 4 * 105 * t * (1-t) + 10 * (1-t);
        c.beginPath(); c.arc(play.qb.x+(target.x-play.qb.x)*t, play.qb.y+(target.y-play.qb.y)*t-height, 3.5, 0, Math.PI*2); c.fill();
      }
      c.font = 'bold 15px monospace'; c.textAlign = 'center';
      c.fillText('RELEASE TO THROW', play.qb.x, play.qb.y-55);
      c.setLineDash([]); c.beginPath(); c.ellipse(target.x, target.y, 25, 15, 0, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(target.x - 35, target.y); c.lineTo(target.x + 35, target.y); c.moveTo(target.x, target.y - 24); c.lineTo(target.x, target.y + 24); c.stroke();
      if (receiver) {
        c.beginPath(); c.arc(receiver.x, receiver.y, 32, 0, Math.PI * 2); c.stroke();
        c.fillStyle = '#edff9e'; c.font = 'bold 15px monospace'; c.textAlign = 'center'; c.fillText(`LEAD #${receiver.number}`, receiver.x, receiver.y - 48);
      }
    }
    if (play.ball.mode === 'flight') {
      const { target } = play.ball;
      c.setLineDash([6, 6]); c.strokeStyle = '#f2d99a';
      c.beginPath(); c.ellipse(target.x, target.y, 25, 15, 0, 0, Math.PI * 2); c.stroke();
    }
    c.restore();
  }
  drawBall(c, ball) {
    c.save(); c.fillStyle = '#14261f88';
    c.beginPath(); c.ellipse(ball.x, ball.y + 7, 9, 4, 0, 0, Math.PI * 2); c.fill();
    c.translate(ball.x, ball.y - ball.height);
    c.rotate(ball.mode === 'flight' ? ball.elapsed * 14 : .4);
    c.fillStyle = '#a45b32'; c.strokeStyle = '#fff0c8'; c.lineWidth = 1.5;
    c.beginPath(); c.ellipse(0, 0, 10, 6, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-5, 0); c.lineTo(5, 0);
    for (let x = -3; x <= 3; x += 3) { c.moveTo(x, -2); c.lineTo(x, 2); } c.stroke();
    c.restore();
  }
}
