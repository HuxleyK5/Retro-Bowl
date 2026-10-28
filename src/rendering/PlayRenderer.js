export class PlayRenderer {
  drawGuides(c, play, aim) {
    c.save();
    if (!play.isKickoff) {
    c.strokeStyle = '#102c28bd'; c.lineWidth = 8;
    c.beginPath(); c.moveTo(play.lineOfScrimmage, 0); c.lineTo(play.lineOfScrimmage, play.field.height); c.stroke();
    c.strokeStyle = '#7ae5ff'; c.lineWidth = 4; c.stroke();
    if (play.firstDownX) {
      c.strokeStyle = '#4a3819b8'; c.lineWidth = 8;
      c.beginPath(); c.moveTo(play.firstDownX, 0); c.lineTo(play.firstDownX, play.field.height); c.stroke();
      c.strokeStyle = '#ffe18a'; c.lineWidth = 4; c.stroke();
    }
    }
    c.strokeStyle = '#f4d37d'; c.lineWidth = 5;
    for (const x of [5, play.field.width - 5]) {
      const y = play.field.height / 2;
      c.beginPath(); c.moveTo(x, y + 60); c.lineTo(x, y - 60); c.moveTo(x - 25, y - 60); c.lineTo(x + 25, y - 60); c.moveTo(x - 25, y - 60); c.lineTo(x - 25, y - 110); c.moveTo(x + 25, y - 60); c.lineTo(x + 25, y - 110); c.stroke();
    }
    if (play.phase === 'presnap') {
      const primarySlot = play.previewSlot || (play.call?.type === 'run' ? '22' : '81');
      const ordered = [...play.receivers].sort((a, b) => Number(a.slot === primarySlot) - Number(b.slot === primarySlot));
      for (const receiver of ordered) {
        const primary = receiver.slot === primarySlot;
        const motion = play.execution?.motion;
        const dx = motion?.player === receiver ? receiver.x - motion.origin.x : 0;
        const dy = motion?.player === receiver ? receiver.y - motion.origin.y : 0;
        const route = (receiver.route || []).map(point => ({
          x: Math.max(20, Math.min(play.field.width - 25, point.x + dx)),
          y: Math.max(30, Math.min(play.field.height - 30, point.y + dy)),
        }));
        if (!route.length) continue;
        const color = primary ? '#e6ff94' : receiver === play.rb ? '#f5d38cba' : play.call?.type === 'run' ? '#ced9bc82' : '#fff4d5b8';
        c.setLineDash(primary ? [] : [13, 12]);
        c.lineWidth = primary ? 9 : 6; c.strokeStyle = primary ? '#123a27df' : '#123a2773';
        c.beginPath(); c.moveTo(receiver.x, receiver.y); route.forEach(point => c.lineTo(point.x, point.y)); c.stroke();
        c.lineWidth = primary ? 4.5 : 2.5; c.strokeStyle = color; c.stroke();
        const end = route.at(-1);
        const prev = route.length > 1 ? route.at(-2) : receiver;
        c.save(); c.setLineDash([]); c.translate(end.x, end.y); c.rotate(Math.atan2(end.y - prev.y, end.x - prev.x));
        c.beginPath(); c.moveTo(-14, -9); c.lineTo(0, 0); c.lineTo(-14, 9); c.stroke(); c.restore();
      }
      c.setLineDash([]);
    }
    if (play.call?.type === 'run' && play.live && play.execution.guided) {
      c.strokeStyle = '#f6ca7088'; c.lineWidth = 3; c.setLineDash([10, 12]); c.beginPath(); c.moveTo(play.rb.x, play.rb.y);
      play.rb.route.slice(play.rb.routeIndex).forEach(p => c.lineTo(p.x, p.y)); c.stroke(); c.setLineDash([]);
    }
    if (play.canThrow && aim) {
      const { target, receiver } = aim;
      const nearestDefender = Math.min(...play.defenders.map(player => Math.hypot(player.x - target.x, player.y - target.y)));
      const suppliedRisk = typeof aim.risk === 'object' ? aim.risk?.level : aim.risk;
      const risk = typeof suppliedRisk === 'number' ? suppliedRisk : suppliedRisk === 'danger' || suppliedRisk === 'high' ? 1 : suppliedRisk === 'contested' || suppliedRisk === 'medium' ? .55 : suppliedRisk === 'open' || suppliedRisk === 'low' ? 0 : nearestDefender < 60 ? 1 : nearestDefender < 125 ? .55 : 0;
      const color = risk >= .72 ? '#ffad89' : risk >= .35 ? '#f5d781' : '#edff9e';
      const read = risk >= .72 ? 'TIGHT WINDOW' : risk >= .35 ? 'CONTESTED' : receiver ? 'OPEN WINDOW' : 'AIMED PASS';
      c.strokeStyle = color; c.lineWidth = 2; c.setLineDash([]); c.fillStyle = color;
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
      c.font = 'bold 15px monospace'; c.lineWidth = 4; c.strokeStyle = '#20382b';
      c.strokeText(read, target.x, target.y + 42); c.fillText(read, target.x, target.y + 42); c.strokeStyle = color; c.lineWidth = 2;
      if (receiver) {
        c.beginPath(); c.arc(receiver.x, receiver.y, 32, 0, Math.PI * 2); c.stroke();
        c.fillStyle = color; c.font = 'bold 15px monospace'; c.textAlign = 'center'; c.fillText(`LEAD #${receiver.number}`, receiver.x, receiver.y - 48);
      }
    }
    if (play.ball.mode === 'flight') {
      const { target } = play.ball;
      c.setLineDash([6, 6]); c.strokeStyle = '#f2d99a';
      c.beginPath(); c.ellipse(target.x, target.y, 25, 15, 0, 0, Math.PI * 2); c.stroke();
    }
    c.restore();
  }
  drawBall(c, ball, lift = 0) {
    c.save(); c.fillStyle = '#14261f88';
    if (ball.mode === 'loose') {
      c.save(); c.strokeStyle = '#ffe29e'; c.lineWidth = 3; c.setLineDash([7, 6]);
      c.beginPath(); c.ellipse(ball.x, ball.y + 5, 23, 13, 0, 0, Math.PI * 2); c.stroke(); c.restore();
    }
    c.beginPath(); c.ellipse(ball.x, ball.y + 7, 9, 4, 0, 0, Math.PI * 2); c.fill();
    c.translate(ball.x, ball.y - ball.height - lift);
    c.rotate(ball.mode === 'flight' ? ball.elapsed * 14 : ball.mode === 'loose' ? ball.elapsed * 9 : .4);
    c.fillStyle = '#512e21'; c.fillRect(-7, -6, 14, 12); c.fillRect(-10, -3, 20, 6);
    c.fillStyle = '#bb7541'; c.fillRect(-7, -4, 14, 8); c.fillRect(-9, -2, 18, 4);
    c.fillStyle = '#8c482b'; c.fillRect(-6, 2, 12, 2);
    c.fillStyle = '#f6eac9'; c.fillRect(-5, -1, 10, 1);
    for (let x = -3; x <= 3; x += 3) c.fillRect(x, -2, 1, 3);
    c.restore();
  }
}
