import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerData, POSITION_RATINGS, RATING_LABELS } from '../src/data/PlayerData.js';
import { createRosters, serializeRosters, deserializeRosters } from '../src/data/Rosters.js';
import { Player } from '../src/entities/Player.js';
import { Play } from '../src/football/Play.js';
import { Field } from '../src/world/Field.js';
import { Routes, distance } from '../src/football/Routes.js';
import { Opponent } from '../src/game/Opponent.js';
import { blockDuration, reactionTime, pursuitLead, tackleResult, throwSpread } from '../src/football/RatingEffects.js';

const dt = 1 / 60, field = new Field();
const record = (position = 'WR', ratings = {}) => new PlayerData({ id: 'test-player', name: 'Test Player', teamId: 'home', number: '08', position, ratings });
const entity = ratings => new Player({ x: 500, y: 500, data: record('WR', ratings) });
const tick = (p, seconds, movement = {x: 1, y: 0}) => { for (let i = 0; i < Math.round(seconds / dt); i++) p.update(dt, movement, field); };
const makePlay = () => new Play(new Field(), () => .4);
const base = record('RB').ratings;

test('all five position schemas contain every required rating, validated on a 1–99 scale', () => {
  assert.deepEqual(POSITION_RATINGS.QB, ['throwPower','accuracy','speed','awareness']);
  assert.equal(POSITION_RATINGS.RB.length, 5); assert.equal(POSITION_RATINGS.WR.length, 5);
  assert.equal(POSITION_RATINGS.OL.length, 3); assert.equal(POSITION_RATINGS.DEF.length, 6);
  const p = record('QB', { speed: -10, accuracy: 200, awareness: 65.6 });
  assert.equal(p.ratings.speed, 1); assert.equal(p.ratings.accuracy, 99); assert.equal(p.ratings.awareness, 66);
  const before = p.toJSON();
  for (const value of [NaN, Infinity, '90', null]) assert.throws(() => p.setRatings({ speed: value }), TypeError);
  assert.throws(() => p.setRatings({ typo: 80 })); assert.deepEqual(p.toJSON(), before);
  assert.throws(() => { p.ratings.speed = 80; });
  assert.throws(() => new PlayerData({...before, schemaVersion: 2}));
  assert.throws(() => new PlayerData({...before, position: 'BAD'}));
  assert.throws(() => new PlayerData({...before, id: ''}));
});

test('JSON round-trip preserves identity and ratings but contains no live simulation state', () => {
  const rosters = createRosters(), json = serializeRosters(rosters), loaded = deserializeRosters(json);
  assert.equal(serializeRosters(loaded), json); assert.equal(new Set([...loaded.home, ...loaded.away].map(p => p.id)).size, 38);
  for (const team of Object.values(loaded)) for (const data of team) {
    assert.ok(data instanceof PlayerData); assert.equal(Object.keys(data.ratings).length, Object.keys(RATING_LABELS).length);
    for (const key of ['x','y','vx','stunned','jukeCooldown','route','spawn']) assert.equal(key in data.toJSON(), false);
  }
  const malformed = JSON.parse(json); malformed.teams.home[1].id = malformed.teams.home[0].id;
  assert.throws(() => deserializeRosters(malformed));
});

test('rating changes persist through snaps, audibles and possession changes; team records stay separate', () => {
  const p = makePlay(); const homeQB = p.qb.data;
  p.qb.setRatings({accuracy: 97, speed: 95}); p.configure(40, 'home', 50, 'go');
  assert.equal(p.qb.data, homeQB); assert.equal(p.qb.ratings.accuracy, 97); assert.equal(p.qb.speed, 185);
  p.snap(); p.update(dt); p.reset(); assert.equal(p.qb.ratings.accuracy, 97);
  p.configure(25, 'away'); assert.notEqual(p.qb.data.id, homeQB.id); assert.equal(p.qb.data.teamId, 'away'); assert.equal(p.defenders[0].data.teamId, 'home');
  p.configure(25, 'home'); assert.equal(p.qb.data, homeQB);
  const restored = new Play(field, () => .4, deserializeRosters(serializeRosters(p.rosters)));
  assert.equal(restored.qb.ratings.accuracy, 97);
});

test('formation slots are independent of persistent jersey numbers', () => {
  const roster = createRosters(); roster.home.find(p => p.position === 'WR').number = '77';
  const p = new Play(field, () => .4, roster); p.configure(35,'home',45,'slants');
  assert.equal(p.receivers[0].number, '77'); assert.equal(p.receivers[0].slot, '08'); assert.ok(p.receivers[0].route.length > 0);
});

test('speed increases both first-step acceleration and sustained running speed; acceleration independently improves starts', () => {
  const slow = entity({speed: 15, acceleration: 60}), fast = entity({speed: 95, acceleration: 60});
  tick(slow, .1); tick(fast, .1); assert.ok(fast.vx > slow.vx); assert.ok(fast.x > slow.x);
  tick(slow, 2); tick(fast, 2); assert.ok(fast.x > slow.x + 100); assert.ok(fast.speed > slow.speed);
  const sluggish = entity({speed: 80, acceleration: 10}), explosive = entity({speed: 80, acceleration: 99});
  tick(sluggish, .15); tick(explosive, .15); assert.ok(explosive.vx > sluggish.vx + 20); assert.equal(sluggish.speed, explosive.speed);
});

test('throw power changes real throw range and flight duration at identical targets', () => {
  const values = [];
  for (const throwPower of [10, 95]) {
    const p = makePlay(); p.qb.setRatings({throwPower}); p.snap();
    const far = p.aim({x: 2300, y: 533}); const near = p.aim({x: 1300, y: 533});
    p.throw({x:1300, y:533}); values.push({range: distance(p.qb,far.target), time: p.ball.duration});
    assert.equal(p.ball.duration, near.duration);
  }
  assert.ok(values[1].range > values[0].range + 500); assert.ok(values[1].time < values[0].time);
});

test('accuracy dominates bounded throw variation, awareness reduces moving/pressure error', () => {
  const errors = {};
  for (const accuracy of [15,95]) for (const rng of [0,.25,.5,.99]) {
    const p = new Play(field, () => rng); p.qb.setRatings({accuracy}); p.snap();
    const target = {x:1500, y:100}; const intended = p.aim(target).target; p.throw(target);
    (errors[accuracy] ||= []).push(distance(intended,p.ball.target));
  }
  assert.ok(Math.max(...errors[95]) < Math.min(...errors[15]) / 8);
  assert.ok(throwSpread({...base,accuracy:85,awareness:95},700,true,1) < throwSpread({...base,accuracy:85,awareness:10},700,true,1));
});

test('receivers with high catching make difficult catches; low catching drops them across all random seeds', () => {
  for (const catching of [10,95]) for (const rng of [0,.5,.999]) {
    const p = new Play(field, () => rng); p.snap(); p.defenders = [];
    const wr = p.receivers[0]; wr.setRatings({catching, awareness:60});
    p.ball.x = wr.x + 35; p.ball.y = wr.y; p.catchJitter = (rng - .5) * .04;
    assert.equal(p.resolveCatch(), catching === 95);
  }
});

test('receiver awareness improves release reaction and marginal catch tracking', () => {
  const positions = [];
  for (const awareness of [10,99]) {
    const p = makePlay(); p.receivers[0].setRatings({awareness}); p.snap();
    for (let i=0;i<6;i++) p.update(dt); positions.push(p.receivers[0].x);
  }
  assert.ok(positions[1] > positions[0]);
  const p=makePlay(), wr=p.receivers[0]; p.defenders=[]; wr.setRatings({catching:40,awareness:1});
  const low=p.catchMargin(wr,35); wr.setRatings({awareness:99}); assert.ok(low<0 && p.catchMargin(wr,35)>0);
});

test('route running tightens real cuts and lead prediction uses the same motion without mutating the receiver', () => {
  const turns=[];
  for (const routeRunning of [10,95]) {
    const p=entity({speed:80,acceleration:80,routeRunning}); p.vx=p.speed; p.route=[{x:500,y:900}]; p.routeIndex=0;
    const routes=new Routes([p]);
    for(let i=0;i<10;i++) routes.update(p,dt,field);
    turns.push({x:p.x,y:p.y}); const before={x:p.x,y:p.y,index:p.routeIndex}; const predicted=routes.predict(p,.5,field);
    assert.deepEqual({x:p.x,y:p.y,index:p.routeIndex},before);
    for(let i=0;i<30;i++) routes.update(p,dt,field);
    assert.ok(distance(p,predicted)<.001);
  }
  assert.ok(turns[1].x<turns[0].x); assert.ok(turns[1].y>turns[0].y);
});

test('OL strength, blocking and awareness each improve a deterministic engagement against the same rusher', () => {
  const defender={...base,passRush:70,strength:70,awareness:70};
  for(const key of ['blocking','strength','awareness']) {
    const low=blockDuration({...base,[key]:10},defender), high=blockDuration({...base,[key]:95},defender);
    assert.ok(high>low, key);
  }
  for(const key of ['passRush','strength','awareness']) {
    assert.ok(blockDuration(base,{...defender,[key]:95})<blockDuration(base,{...defender,[key]:10}), key);
  }
});

test('better lines buy more real pocket time; better pass rush gets to the QB sooner', () => {
  function sackTime(blocking,passRush) {
    const p=makePlay(); p.linemen.forEach(l=>l.setRatings({blocking})); p.defenders.forEach(d=>d.setRatings({passRush})); p.snap();
    for(let i=0;i<900&&p.live;i++)p.update(dt);
    assert.equal(p.result,'SACK'); return p.elapsed;
  }
  assert.ok(sackTime(95,60)>sackTime(10,60)+1);
  assert.ok(sackTime(70,95)<sackTime(70,10)-1);
});

test('coverage tightens positioning and improves interception ability', () => {
  const gaps=[];
  for(const coverage of [10,95]) {
    const p=makePlay(), d=p.defenders[0], wr=p.receivers[0]; d.setRatings({coverage}); p.snap();
    for(let i=0;i<180;i++)p.defense.update(p,dt);
    gaps.push(distance(d,wr));
  }
  assert.ok(gaps[1]<gaps[0]-30);
  for(const coverage of [10,95]) {
    const p=makePlay(), d=p.defenders[7]; p.receivers=[]; d.setRatings({coverage,awareness:60});
    p.ball.x=d.x+35;p.ball.y=d.y;assert.equal(p.resolveCatch(),coverage===95);
  }
});

test('defensive awareness shortens pass reaction and increases pursuit anticipation', () => {
  assert.ok(reactionTime({...base,awareness:95})<reactionTime({...base,awareness:10}));
  assert.ok(pursuitLead({...base,awareness:95})>pursuitLead({...base,awareness:10}));
  const reacted=[];
  for(const awareness of [10,95]) {
    const p=makePlay(), d=p.defenders[0]; d.setRatings({awareness}); p.snap();
    p.ball.throw(p.qb,{x:d.x+180,y:d.y+180},1);p.ball.elapsed=.3;
    p.defense.update(p,dt); reacted.push(d.vx);
  }
  assert.ok(reacted[1]>reacted[0]);
});

test('strength breaks weak tackles, tackling finishes contact, and repeated breaks lose effectiveness', () => {
  const defender={...base,tackling:35,strength:35,awareness:35};
  assert.equal(tackleResult(defender,{...base,strength:1,elusiveness:50,awareness:60}),'tackled');
  assert.equal(tackleResult(defender,{...base,strength:99,elusiveness:50,awareness:60}),'broken');
  assert.equal(tackleResult(defender,{...base,strength:99,elusiveness:50,awareness:60},{brokenTackles:3}),'tackled');
  for(const tackling of [10,99]) {
    const p=makePlay();p.snap();p.handoff();p.rb.setRatings({strength:80,elusiveness:70,awareness:60});
    const d=p.defenders[0];p.defenders=[d];d.setRatings({tackling,strength:50,awareness:50});d.x=p.rb.x+5;d.y=p.rb.y;
    p.update(dt);assert.equal(p.result,tackling===99?'TACKLED':'');assert.equal(p.rb.brokenTackles,tackling===99?0:1);
  }
});

test('elusiveness and runner awareness improve timed jukes without making every defender miss', () => {
  const d={...base,tackling:85,strength:85,awareness:85};
  assert.equal(tackleResult(d,{...base,elusiveness:10,awareness:60,strength:60},{juking:true}),'tackled');
  assert.equal(tackleResult(d,{...base,elusiveness:95,awareness:60,strength:60},{juking:true}),'evaded');
  const low=entity({elusiveness:10,awareness:10}), high=entity({elusiveness:95,awareness:95});
  low.juke({x:1,y:0});high.juke({x:1,y:0}); assert.ok(high.jukeTime>low.jukeTime);assert.ok(high.jukeCooldown<low.jukeCooldown);
});

test('QB awareness reads more receivers rather than randomly choosing a target', () => {
  const choices=[];
  for(const awareness of [10,99]) {
    const p=makePlay();p.qb.setRatings({awareness});p.snap();p.elapsed=2;
    p.defenders=p.defenders.slice(0,1);p.defenders[0].x=p.receivers[0].x;p.defenders[0].y=p.receivers[0].y;
    p.throw=target=>{choices.push(target);return true;};new Opponent(()=>.999).movement(p);
    assert.equal(choices.at(-1)===p.receivers[0],awareness===10);
  }
});
