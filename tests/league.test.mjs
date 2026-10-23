import test from 'node:test';
import assert from 'node:assert/strict';
import {createLeague,TEAMS} from '../src/data/League.js';
import {saveFranchise,loadFranchise} from '../src/data/Franchise.js';
import {PlayerData} from '../src/data/PlayerData.js';
import {Play} from '../src/football/Play.js';
import {Field} from '../src/world/Field.js';
import {MatchRules} from '../src/game/MatchRules.js';
const memory=()=>({value:null,getItem(){return this.value},setItem(k,v){this.value=v}});
test('32 unique NFL teams have complete, deterministic 53-player rosters',()=>{
 const league=createLeague(), names=new Set(),ids=new Set();assert.equal(league.length,32);
 assert.deepEqual(league,createLeague());assert.equal(new Set(TEAMS.map(t=>t.name)).size,32);
 assert.equal(new Set(TEAMS.map(t=>t.abbreviation)).size,32);
 assert.deepEqual(TEAMS.map(t=>`${t.city} ${t.name}`), [
  'Arizona Cardinals','Atlanta Falcons','Baltimore Ravens','Buffalo Bills','Carolina Panthers','Chicago Bears','Cincinnati Bengals','Cleveland Browns',
  'Dallas Cowboys','Denver Broncos','Detroit Lions','Green Bay Packers','Houston Texans','Indianapolis Colts','Jacksonville Jaguars','Kansas City Chiefs',
  'Las Vegas Raiders','Los Angeles Chargers','Los Angeles Rams','Miami Dolphins','Minnesota Vikings','New England Patriots','New Orleans Saints','New York Giants',
  'New York Jets','Philadelphia Eagles','Pittsburgh Steelers','San Francisco 49ers','Seattle Seahawks','Tampa Bay Buccaneers','Tennessee Titans','Washington Commanders',
 ]);
 for(const conference of ['AFC','NFC'])for(const division of ['East','North','South','West'])assert.equal(TEAMS.filter(t=>t.conference===conference&&t.division===division).length,4);
 for(const t of league){
  for(const key of ['city','name','stadium','offensiveIdentity','defensiveIdentity'])assert.ok(t[key]);
  assert.match(t.primaryColor,/^#[0-9a-f]{6}$/i);assert.match(t.secondaryColor,/^#[0-9a-f]{6}$/i);
  assert.equal(t.roster.length,53);assert.equal(new Set(t.roster.map(p=>p.number)).size,53);
  for(const [specialty,count] of Object.entries({QB:3,RB:4,WR:6,TE:3,OL:9,DL:8,LB:7,DB:10,K:1,P:1,LS:1}))assert.equal(t.roster.filter(p=>p.specialty===specialty).length,count);
  for(const p of t.roster){ids.add(p.id);names.add(p.name);assert.equal(p.teamId,t.id);assert.ok(p.overall<=p.potential&&p.potential<=99);assert.ok(p.age>=21&&p.age<=34);assert.ok(p.contract.annualSalary>0);assert.ok(Object.values(p.ratings).every(n=>Number.isInteger(n)&&n>=1&&n<=99));assert.deepEqual(PlayerData.fromJSON(JSON.stringify(p)),p);}
 }assert.equal(ids.size,1696);assert.equal(names.size,1696);
});
test('all clubs bind actual starters on either possession without losing identities',()=>{
 const league=createLeague();for(let i=0;i<league.length;i++){
 const home=league[i],away=league[(i+1)%league.length],play=new Play(new Field(),()=>.4,{home:home.roster,away:away.roster});
 for(const side of ['home','away']){play.configure(25,side);const offense=side==='home'?home:away,defense=side==='home'?away:home;assert.equal(play.qb.data,offense.roster.find(p=>p.specialty==='QB'));assert.equal(play.rb.data,offense.roster.find(p=>p.specialty==='RB'));for(const d of play.defenders)assert.equal(d.data.teamId,defense.id);assert.ok(play.linemen.every(p=>p.data.teamId===offense.id));}
 }
});
test('franchise snapshot preserves club, ratings, age, potential and contracts; malformed saves recover',()=>{
 const store=memory(),league=createLeague();league[7].roster[0].setRatings({accuracy:95});saveFranchise(store,league,league[7].id);
 const restored=loadFranchise(store);assert.equal(restored.teamId,league[7].id);assert.deepEqual(restored.league,league);
 const good=store.value;for(const mutate of [v=>v.version=9,v=>v.teamId='missing',v=>v.rosters.pop(),v=>v.rosters[0].players[0].age=-1,v=>v.rosters[0].players[0].contract.annualSalary=-4,v=>v.rosters[0].players[0].position='WR',v=>v.rosters[0].players[1]=v.rosters[0].players[0]]){let v=JSON.parse(good);mutate(v);store.value=JSON.stringify(v);assert.equal(loadFranchise(store),null);}
 store.value='{';assert.equal(loadFranchise(store),null);assert.equal(loadFranchise({getItem(){throw Error('denied')}}),null);
});
test('league kicker and punter abilities influence special teams',()=>{
 const league=createLeague(),r=new MatchRules(()=>.5),k=league[0].roster.find(p=>p.position==='K'),p=league[0].roster.find(p=>p.position==='P');r.specialists={home:{kicker:k,punter:p}};r.start();r.spot=60;k.setRatings({kickAccuracy:40,kickPower:40});const low=r.fieldGoalChance;k.setRatings({kickAccuracy:99,kickPower:99});assert.ok(r.fieldGoalChance>low);
 p.setRatings({kickPower:40});r.beginKick('punt');const short=r.kick.landing;r.start();r.spot=60;p.setRatings({kickPower:99});r.beginKick('punt');assert.ok(r.kick.landing>short);
});
