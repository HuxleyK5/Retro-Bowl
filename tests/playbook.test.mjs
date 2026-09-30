import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYBOOK, FORMATIONS, getPlay } from '../src/football/Playbook.js';
import { Play } from '../src/football/Play.js';
import { Field } from '../src/world/Field.js';
import { MatchController } from '../src/game/MatchController.js';
import { Opponent } from '../src/game/Opponent.js';

const dt = 1 / 60;
function make(id, defenders = true, spot = 35) {
  const p = new Play(new Field(), () => .4); p.configure(spot, 'home', Math.min(100, spot + 10), id);
  if (!defenders) p.defenders = [];
  return p;
}
const step = (p, seconds, movement) => { for (let i = 0; i < Math.round(seconds / dt); i++) p.update(dt, movement); };

test('catalog has eight unique pass concepts, four distinct runs and valid frozen formations', () => {
  assert.equal(PLAYBOOK.filter(c => c.type === 'pass').length, 8);
  assert.equal(PLAYBOOK.filter(c => c.type === 'run').length, 4);
  assert.equal(new Set(PLAYBOOK.map(c => JSON.stringify(c.routes))).size, 12);
  for (const call of PLAYBOOK) {
    assert.ok(FORMATIONS[call.formation]); assert.ok(Object.isFrozen(call.routes));
    for (const number of ['08', '81', '11', '19', '22']) assert.ok(call.routes[number].length > 0);
  }
});

test('slants cut inside, outs break outside, curls come back and settle, posts break deeper, go stays vertical', () => {
  const positions = {};
  for (const id of ['slants', 'outs', 'curls', 'posts', 'go', 'crosses']) {
    const p = make(id, false); p.snap(); step(p, 2.7); positions[id] = { x: p.receivers[0].x, y: p.receivers[0].y };
    if (id === 'curls') { step(p, 2); const player = p.receivers[0]; assert.ok(Math.abs(player.x - player.route.at(-1).x) < 8); }
  }
  assert.ok(positions.slants.y > 300);
  assert.ok(positions.outs.y < 80);
  assert.ok(positions.posts.y > 230 && positions.posts.x > positions.curls.x + 100);
  assert.ok(Math.abs(positions.go.y - make('go').receivers[0].y) < 1);
  const cross = make('crosses', false); cross.snap(); step(cross, 3);
  assert.ok(cross.receivers[1].y < cross.receivers[1].spawn.y - 150);
});

test('all eight passing calls can be thrown, caught and transferred in an open-field simulation', () => {
  for (const call of PLAYBOOK.filter(c => c.type === 'pass')) {
    const p = make(call.id, false); p.snap(); step(p, call.id === 'curls' ? 2.4 : 1.2);
    const receiver = call.id === 'screen' ? p.rb : p.receivers[0];
    assert.equal(p.throw(receiver), true, call.id);
    for (let i = 0; i < 150 && p.phase === 'flight'; i++) p.update(dt);
    assert.ok(p.receivers.includes(p.carrier), `${call.id}: eligible receiver completes the pass`); assert.equal(p.phase, 'running');
  }
});

test('play action delays passing, moves QB through fake, then unlocks; early handoff/juke cannot bypass it', () => {
  const p = make('play-action'); p.snap();
  assert.equal(p.throw(p.receivers[0]), false); assert.equal(p.handoff(), false); assert.equal(p.juke({x: 1, y: 0}), false);
  step(p, .5); assert.notEqual(p.qb.x, p.qb.spawn.x); assert.equal(p.canThrow, false);
  step(p, .5); assert.equal(p.canThrow, true); assert.equal(p.carrier, p.qb); assert.equal(p.throw(p.receivers[0]), true);
});

test('screen holds back release and sends linemen to a different lane from a normal pass', () => {
  const p = make('screen', false); p.snap(); step(p, .3); assert.equal(p.rb.x, p.rb.spawn.x); assert.equal(p.rb.y, p.rb.spawn.y);
  step(p, 1); assert.ok(p.rb.y > p.rb.spawn.y); assert.ok(p.linemen[2].y > p.linemen[2].spawn.y + 50);
  assert.ok(p.rb.x < p.lineOfScrimmage);
  const regular = make('slants', false); regular.snap(); step(regular, 1.3); assert.equal(regular.linemen[2].y, regular.linemen[2].spawn.y);
});

test('all four run plays auto-exchange at their own timing and follow distinct lanes', () => {
  const positions = [];
  for (const id of ['inside', 'outside', 'sweep', 'draw']) {
    const p = make(id, false); p.snap(); step(p, p.call.exchangeTime - .05);
    assert.equal(p.carrier, p.qb, id); assert.equal(p.throw(p.receivers[0]), false); assert.equal(p.handoff(), false);
    step(p, .1); assert.equal(p.carrier, p.rb); assert.equal(p.controlled, p.rb); assert.equal(p.phase, 'running');
    step(p, 1.5); positions.push([p.rb.x, p.rb.y]);
    assert.ok(p.linemen.some(l => Math.abs(l.x - l.spawn.x) > 30));
  }
  assert.ok(Math.abs(positions[0][1] - 533) < 60);
  assert.ok(positions[1][1] > 800); assert.ok(positions[2][1] < 200);
  assert.equal(new Set(positions.map(p => p.map(Math.round).join(','))).size, 4);
});

test('draw holds the back in pass formation before its delayed exchange', () => {
  const p = make('draw', false); p.snap(); step(p, .6);
  assert.equal(p.rb.x, p.rb.spawn.x); assert.equal(p.rb.y, p.rb.spawn.y); assert.equal(p.carrier, p.qb);
  step(p, .6); assert.equal(p.carrier, p.rb); assert.equal(p.execution.exchanged, true);
});

test('user steering overrides the designed run lane permanently, sprint and juke still work', () => {
  const p = make('outside', false); p.snap(); step(p, .5);
  step(p, .4, {x: 0, y: -1, sprint: true}); assert.equal(p.execution.guided, false); assert.ok(p.rb.vy < 0);
  assert.equal(p.juke({x: 1, y: 0}), true); assert.ok(p.rb.jukeCooldown > 0);
  step(p, 1, {x: 0, y: 0}); assert.equal(p.execution.guided, false); assert.equal(p.rb.moving, false);
});

test('audibles reconfigure formations but cannot reset downs, clocks, score or field position', () => {
  const m = new MatchController(new Play(new Field())); m.start(60, false); m.rules.tick(7);
  const before = JSON.stringify(m.rules);
  for (const call of PLAYBOOK) { assert.equal(m.selectPlay(call.id), true); assert.equal(m.play.call, call); assert.equal(JSON.stringify(m.rules), before); }
  assert.equal(m.audible(1), true); assert.equal(m.selectedPlayId, PLAYBOOK[0].id);
  assert.equal(m.audible(-1), true); assert.equal(m.selectedPlayId, PLAYBOOK.at(-1).id);
  assert.equal(m.selectPlay('not-a-play'), false); m.snap();
  assert.equal(m.selectPlay('go'), false); assert.equal(m.audible(1), false);
});

test('each new human down retains the call, CPU uses playbook and cannot be audibled by human', () => {
  const m = new MatchController(new Play(new Field()), () => .4); m.start(60, false); m.selectPlay('curls');
  m.snap(); m.rules.completePlay({type:'INCOMPLETE',spot:25}); m.advance(); assert.equal(m.play.call.id, 'curls');
  m.rules.changePossession(25); m.prepare(); assert.ok(getPlay(m.play.call.id)); assert.equal(m.selectPlay('sweep'), false);
  for (const call of PLAYBOOK) {
    const p = make(call.id, false); const coach = new Opponent(() => .4); p.snap();
    for (let i = 0; i < 200 && p.live; i++) p.update(dt, coach.movement(p));
    assert.ok(p.hasThrown || p.execution.exchanged, `${call.id} CPU executes its call`);
  }
});

test('every call fits both goal lines and audibles do not mutate catalog or previous paths', () => {
  const serialized = JSON.stringify(PLAYBOOK);
  for (const spot of [1, 50, 99]) for (const call of PLAYBOOK) {
    const p = make(call.id, true, spot);
    for (const player of p.receivers) for (const point of player.route) {
      assert.ok(point.x > 0 && point.x < p.field.width); assert.ok(point.y > 0 && point.y < p.field.height);
    }
    p.snap(); step(p, 2); assert.ok(p.players.every(v => Number.isFinite(v.x) && Number.isFinite(v.y)));
  }
  assert.equal(JSON.stringify(PLAYBOOK), serialized);
});
