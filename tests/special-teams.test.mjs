import test from 'node:test';
import assert from 'node:assert/strict';
import {KickMeter,kickExecution} from '../src/game/KickMeter.js';
import {MatchController} from '../src/game/MatchController.js';
import {Play} from '../src/football/Play.js';
import {Field} from '../src/world/Field.js';
import {createLeague} from '../src/data/League.js';
const still={x:0,y:0}, step=1/60;
function make(){const league=createLeague(),m=new MatchController(new Play(new Field(),()=>.4,{home:league[0].roster,away:league[1].roster}),()=>.4);m.rules.specialists=Object.fromEntries(['home','away'].map((s,i)=>[s,{kicker:league[i].roster.find(p=>p.position==='K'),punter:league[i].roster.find(p=>p.position==='P')}]));return m;}
function until(m,phase,max=2400){for(let i=0;i<max&&m.rules.phase!==phase;i++)m.update(step,still);assert.equal(m.rules.phase,phase);}
function lock(m,power=1,accuracy=0){m.meter.elapsed=power/.85;m.lockKick();assert.equal(m.meter.stage,'accuracy');m.meter.elapsed=(accuracy+1)/2/1.15;m.lockKick();}
test('meter locks power and accuracy separately, timeout completes poor kick',()=>{
 const m=new KickMeter('fieldGoal','ready');m.update(1/.85);assert.equal(m.lock(),null);assert.equal(m.power,1);m.update(.5/1.15);assert.deepEqual(m.lock(),{power:1,accuracy:0});
 const expired=new KickMeter('punt','ready');assert.equal(expired.update(5),null);assert.deepEqual(expired.update(5),{power:.15,accuracy:1});
});
test('kick power, aim, distance and ratings determine outcomes without a random roll',()=>{
 const ratings={kickPower:80,kickAccuracy:80};assert.ok(kickExecution('fieldGoal',ratings,45,{power:1,accuracy:0}).good);
 assert.ok(!kickExecution('fieldGoal',ratings,45,{power:.1,accuracy:0}).good);assert.ok(!kickExecution('fieldGoal',ratings,45,{power:1,accuracy:1}).good);assert.ok(!kickExecution('fieldGoal',ratings,80,{power:1,accuracy:0}).good);
 assert.ok(kickExecution('punt',ratings,0,{power:1,accuracy:0}).yards>kickExecution('punt',ratings,0,{power:.2,accuracy:0}).yards);
 assert.ok(kickExecution('fieldGoal',{kickPower:99,kickAccuracy:99},65,{power:1,accuracy:0}).good);assert.ok(!kickExecution('fieldGoal',{kickPower:40,kickAccuracy:40},65,{power:1,accuracy:0}).good);
});
test('opening kickoff is caught, auto-run and steering work, tackle starts a fresh series without using a down',()=>{
 const m=make();m.start(120);assert.equal(m.rules.phase,'kickoff');const clock=m.rules.clock;until(m,'return');assert.equal(m.rules.clock,clock);assert.equal(m.play.controlled,m.play.rb);assert.equal(m.play.ball.mode,'held');
 const x=m.play.rb.x;m.update(step,still);assert.ok(m.play.rb.x>x);assert.ok(m.rules.clock<clock);
 until(m,'result');assert.match(m.rules.result,/KICK RETURN/);const spot=m.rules.spot;assert.ok(spot>0&&spot<100);assert.equal(m.rules.down,1);assert.equal(m.rules.yardsToGo,10);m.advance();assert.equal(m.rules.phase,'ready');assert.equal(m.rules.spot,spot);assert.equal(m.play.qb.data.position,'QB');
});
test('return touchdown, out-of-bounds, and expired quarter resolve correctly',()=>{
 for(const kind of ['TOUCHDOWN','OUT OF BOUNDS']){const m=make();m.start(60);until(m,'return');m.play.rb.x=m.play.field.endZone+(kind==='TOUCHDOWN'?100:28)*20;m.play.finish(kind);m.update(step,still);assert.equal(m.rules.phase,'result');if(kind==='TOUCHDOWN'){assert.equal(m.rules.score.home,6);m.advance();assert.equal(m.rules.phase,'extraPoint')}else{assert.equal(m.rules.spot,28);assert.equal(m.rules.down,1)}}
 const m=make();m.start(10);until(m,'return');m.rules.quarter=4;m.rules.clock=.001;m.update(step,still);assert.equal(m.rules.phase,'return');m.play.finish('TACKLED');m.update(step,still);m.advance();assert.equal(m.rules.phase,'final');
});
test('human FG and PAT use meters; successful scoring schedules a kickoff and missed FG does not',()=>{
 for(const kind of ['fieldGoal','extraPoint']){const m=make();m.start(60,false);m.rules.newSeries(75);m.prepare();if(kind==='extraPoint')m.rules.phase='extraPoint';const clock=m.rules.clock;m.kick(kind);assert.equal(m.rules.phase,'kickMeter');assert.equal(m.play.qb.data.position,'K');m.update(.2,still);assert.equal(m.rules.clock,clock);lock(m);until(m,'result');assert.equal(m.rules.score.home,kind==='fieldGoal'?3:1);assert.ok(m.rules.kickoffPending);assert.equal(m.rules.possession,'away');m.advance();assert.equal(m.rules.phase,'kickMeter');assert.equal(m.meter.kind,'kickoff');lock(m,.5,0);until(m,'return');assert.equal(m.rules.possession,'away');until(m,'result');}
 const m=make();m.start(60,false);m.rules.newSeries(75);m.prepare();m.kick('fieldGoal');lock(m,1,1);until(m,'result');assert.equal(m.rules.score.home,0);assert.equal(m.rules.kickoffPending,false);m.advance();assert.equal(m.rules.phase,'ready');
});
test('punt meter controls landing; long kickoff is a touchback and short kickoff can be returned',()=>{
 const m=make();m.start(60,false);m.kick('punt');assert.equal(m.play.qb.data.position,'P');lock(m,.5,0);const landing=m.rules.kick.landing;until(m,'result');assert.equal(m.rules.spot,100-landing);assert.equal(m.rules.kickoffPending,false);
 for(const power of [1,.3]){m.start(60,false);m.rules.possession='away';m.rules.kickoffPending=true;m.prepare();lock(m,power,0);until(m,power===1?'result':'return');if(power===1){assert.equal(m.rules.result,'TOUCHBACK');assert.equal(m.rules.spot,25);assert.equal(m.rules.clock,60)}}
});
test('halftime kicks to away, buzzer scoring reaches final without an extra kickoff, and Q1 kickoff carries to Q2',()=>{
 const half=make();half.start(60,false);half.rules.phase='halftime';half.advance();assert.equal(half.rules.quarter,3);assert.equal(half.rules.possession,'away');assert.equal(half.meter.kind,'kickoff');
 for(const quarter of [1,4]){const m=make();m.start(60,false);m.rules.quarter=quarter;m.rules.clock=.01;m.rules.newSeries(80);m.prepare();m.kick('fieldGoal');lock(m);until(m,'result');assert.equal(m.rules.clock,0);m.advance();assert.equal(m.rules.phase,quarter===4?'final':'quarterBreak');if(quarter===1){m.advance();assert.equal(m.rules.quarter,2);assert.equal(m.meter.kind,'kickoff')}else assert.equal(m.rules.kickoffPending,false);}
});
