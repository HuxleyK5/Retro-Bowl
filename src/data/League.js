import { PlayerData } from './PlayerData.js';

export const LEAGUE_NAME = 'Continental Gridiron League';
const clubs = [
  ['Alder Bay','Lanterns','#185b57','#f2cc74','Lantern Park'],
  ['Copper Ridge','Prospectors','#87472f','#f3d29a','Foundry Stadium'],
  ['Silverport','Tides','#244b77','#b9e3eb','Harbor Grounds'],
  ['Red Mesa','Sunstones','#a43635','#f6c86b','Mesa Bowl'],
  ['Briar Glen','Thorns','#335b36','#dbe6b0','Briar Grounds'],
  ['Ironvale','Riveters','#414b61','#e8a053','Rivet Field'],
  ['Northhaven','Auroras','#464780','#9de2d0','Northern Lights Stadium'],
  ['Cinder Falls','Embers','#9c3e23','#ffda92','Caldera Park'],
  ['Lakewood Reach','Ospreys','#216878','#e2e9db','Lakefront Stadium'],
  ['Glass Harbor','Prisms','#603a84','#d9b8eb','Glassworks Field'],
  ['Golden Prairie','Bison','#745d20','#f4e29d','Prairie Bowl'],
  ['Stormford','Tempests','#343e69','#b9c8f0','Thunderhead Stadium'],
  ['Juniper City','Roadrunners','#41786a','#eddaab','Juniper Field'],
  ['Westmere','Sentinels','#6c3546','#e0bd88','Citadel Stadium'],
  ['Highcrest','Summits','#35637f','#e0edf2','Alpine Grounds'],
  ['Ashwater','Forge','#62382f','#f3a778','Anvil Park'],
  ['Saffron Coast','Sails','#99611b','#fff0bb','Seabreeze Stadium'],
  ['Pine Hollow','Timbermen','#305444','#cfb68c','Pinewood Field'],
  ['Dusk Valley','Nightjars','#4a3565','#c9a7d7','Twilight Bowl'],
  ['Stonebridge','Keystones','#5f6570','#e8d9bd','Archway Stadium'],
  ['Frosthaven','Glaciers','#236784','#b8edf1','Icefield Park'],
  ['Marigold','Comets','#854b24','#f3d586','Observatory Grounds'],
  ['Windward','Kestrels','#52642f','#e0e7a5','Updraft Stadium'],
  ['Verdant Falls','Cascades','#216457','#a9dec8','Waterfall Field'],
];
const offense = ['Spread passing','Power running','Vertical passing','West coast timing','Play-action balance','Outside zone'];
const defense = ['Zone coverage','Pressure front','Man coverage','Run containment'];
export const TEAMS = Object.freeze(clubs.map(([city,name,primaryColor,secondaryColor,stadium], i) => Object.freeze({
  id: `cgl-${String(i+1).padStart(2,'0')}`, city, name, primaryColor, secondaryColor, stadium,
  abbreviation: city.split(' ').map(w=>w[0]).join('') + name[0],
  offensiveIdentity: offense[i % offense.length], defensiveIdentity: defense[i % defense.length],
})));
const first = 'Adrian Bennett Callum Darius Ellis Felix Graham Holden Isaiah Jasper Kieran Lionel Marcus Nolan Orion Preston Quincy Rafael Silas Tobias Uriah Vaughn Wesley Xavier Yusuf Zeke Alden Brennan Cyrus Dalton Emmett Forrest Gideon Heath Idris Jonas Keaton Landon Micah Noel Oscar Pierce Remy Sterling Tristan Victor Warren Zander'.split(' ');
const last = 'Abbott Bell Calder Drake Ellison Finch Garner Hollis Iverson Jarrett Keller Langford Maddox Norwood Oakley Palmer Quill Ramsey Sutter Talbot Underwood Voss Whitaker York Arden Beckett Corbin Dempsey Easton Farrow Granger Harlan Ingram Kenner Lennox Merritt Niles Osborn Prescott Ridley'.split(' ');
// Gameplay groups stay compatible with the arcade lineup; specialty is the depth-chart position.
const depth = [['QB','QB',3],['RB','RB',4],['WR','WR',6],['WR','TE',3],['OL','OL',9],['DEF','DL',8],['DEF','LB',7],['DEF','DB',10],['K','K',1],['P','P',1],['OL','LS',1]];
function seededRating(serial, key) {
  let value = (serial + 1) * 2654435761;
  for (const letter of key) value = Math.imul(value ^ letter.charCodeAt(0), 16777619);
  value ^= value >>> 16;
  return (value >>> 0) % 7 - 3;
}
const profiles = {
  QB: [['accuracy','awareness'], ['throwPower','accuracy'], ['speed','throwPower']],
  RB: [['speed','elusiveness'], ['strength','awareness'], ['acceleration','catching']],
  WR: [['speed','acceleration'], ['catching','awareness'], ['routeRunning','catching']],
  TE: [['strength','blocking'], ['catching','awareness'], ['routeRunning','catching']],
  OL: [['strength','blocking'], ['blocking','awareness']], LS: [['blocking','awareness']],
  DL: [['passRush','strength'], ['tackling','awareness']], LB: [['tackling','awareness'], ['passRush','strength'], ['coverage','speed']],
  DB: [['coverage','awareness'], ['speed','tackling'], ['coverage','tackling']],
  K: [['kickAccuracy','awareness'], ['kickPower','kickAccuracy']], P: [['kickPower','awareness'], ['kickAccuracy','kickPower']],
};
const market = { QB: 2.1, RB: .85, WR: 1.05, TE: .85, OL: 1.05, DL: 1.15, LB: .95, DB: 1, K: .45, P: .35, LS: .25 };
export function createLeague() {
  return TEAMS.map((team, ti) => {
    let index = 0;
    const roster = depth.flatMap(([position,specialty,count]) => Array.from({length:count}, (_,rank) => {
      const n = index++, serial = ti*53+n;
      const nameIndex = (serial * 37) % (first.length * last.length);
      const base = 84-Math.min(rank,7)*4+(seededRating(ti,'team') % 2);
      const ratings = Object.fromEntries(['kickPower','kickAccuracy','throwPower','accuracy','speed','acceleration','strength','elusiveness','catching','routeRunning','blocking','tackling','coverage','passRush','awareness'].map(key => [key, base + seededRating(serial,key)]));
      ratings.speed = (position==='DEF'?45:position==='OL'?47:position==='QB'?55:84) + seededRating(serial,'speed');
      ratings.acceleration = (position==='OL'?62:position==='DEF'?70:80) + seededRating(serial,'acceleration');
      if (specialty==='DL') { ratings.speed=32+seededRating(serial,'speed'); ratings.passRush+=5; ratings.coverage=45+seededRating(serial,'coverage'); }
      if (specialty==='TE') { ratings.speed-=6; ratings.blocking+=4; }
      const profile = profiles[specialty][(ti+rank)%profiles[specialty].length];
      for (const key of profile) ratings[key]+=5;
      const yearsRemaining=1+(serial%4), annualSalary=Math.round((.65+Math.max(0,base-60)*.24)*market[specialty]*1000000/10000)*10000;
      const player = new PlayerData({ id:`${team.id}-p${n+1}`, teamId:team.id, name:`${first[nameIndex%first.length]} ${last[Math.floor(nameIndex/first.length)]}`, number:String(n+1), position, specialty, age:21+(serial%14), ratings, potential:99, contract:{yearsRemaining,annualSalary,guaranteed:Math.round(annualSalary*yearsRemaining*.45)} });
      player.potential=Math.min(99,player.overall+2+(serial%10));
      return player;
    }).sort((a,b)=>b.overall-a.overall));
    // Coverage players first, followed by the front: these eight occupy the arcade defense.
    const starters = [roster.filter(p=>p.specialty==='DB').slice(0,4),roster.filter(p=>p.specialty==='LB').slice(0,1),roster.filter(p=>p.specialty==='DL').slice(0,2),roster.filter(p=>p.specialty==='LB').slice(1,2)].flat();
    return {...team, roster:[...roster.filter(p=>p.position!=='DEF'),...starters,...roster.filter(p=>p.position==='DEF'&&!starters.includes(p))]};
  });
}
