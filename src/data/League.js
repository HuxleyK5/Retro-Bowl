import { PlayerData } from './PlayerData.js';

export const LEAGUE_NAME = 'National Football League';
// Stable slot IDs preserve existing player records and saved franchises.
// Team directory: https://www.nfl.com/teams/
const clubs = [
  ['Arizona','Cardinals','#97233f','#ffb612','State Farm Stadium','ARI','NFC','West'],
  ['Atlanta','Falcons','#a71930','#a5acaf','Mercedes-Benz Stadium','ATL','NFC','South'],
  ['Baltimore','Ravens','#241773','#9e7c0c','M&T Bank Stadium','BAL','AFC','North'],
  ['Buffalo','Bills','#00338d','#c60c30','Highmark Stadium','BUF','AFC','East'],
  ['Carolina','Panthers','#0085ca','#bfc0bf','Bank of America Stadium','CAR','NFC','South'],
  ['Chicago','Bears','#0b162a','#c83803','Soldier Field','CHI','NFC','North'],
  ['Cincinnati','Bengals','#fb4f14','#000000','Paycor Stadium','CIN','AFC','North'],
  ['Cleveland','Browns','#311d00','#ff3c00','Huntington Bank Field','CLE','AFC','North'],
  ['Dallas','Cowboys','#003594','#869397','AT&T Stadium','DAL','NFC','East'],
  ['Denver','Broncos','#fb4f14','#002244','Empower Field at Mile High','DEN','AFC','West'],
  ['Detroit','Lions','#0076b6','#b0b7bc','Ford Field','DET','NFC','North'],
  ['Green Bay','Packers','#203731','#ffb612','Lambeau Field','GB','NFC','North'],
  ['Houston','Texans','#03202f','#a71930','Reliant Stadium','HOU','AFC','South'],
  ['Indianapolis','Colts','#002c5f','#a2aaad','Lucas Oil Stadium','IND','AFC','South'],
  ['Jacksonville','Jaguars','#006778','#d7a22a','EverBank Stadium','JAX','AFC','South'],
  ['Kansas City','Chiefs','#e31837','#ffb81c','Arrowhead Stadium','KC','AFC','West'],
  ['Las Vegas','Raiders','#000000','#a5acaf','Allegiant Stadium','LV','AFC','West'],
  ['Los Angeles','Chargers','#0080c6','#ffc20e','SoFi Stadium','LAC','AFC','West'],
  ['Los Angeles','Rams','#003594','#ffa300','SoFi Stadium','LAR','NFC','West'],
  ['Miami','Dolphins','#008e97','#fc4c02','Hard Rock Stadium','MIA','AFC','East'],
  ['Minnesota','Vikings','#4f2683','#ffc62f','U.S. Bank Stadium','MIN','NFC','North'],
  ['New England','Patriots','#002244','#c60c30','Gillette Stadium','NE','AFC','East'],
  ['New Orleans','Saints','#101820','#d3bc8d','Caesars Superdome','NO','NFC','South'],
  ['New York','Giants','#0b2265','#a71930','MetLife Stadium','NYG','NFC','East'],
  ['New York','Jets','#125740','#ffffff','MetLife Stadium','NYJ','AFC','East'],
  ['Philadelphia','Eagles','#004c54','#a5acaf','Lincoln Financial Field','PHI','NFC','East'],
  ['Pittsburgh','Steelers','#101820','#ffb612','Acrisure Stadium','PIT','AFC','North'],
  ['San Francisco','49ers','#aa0000','#b3995d',"Levi's Stadium",'SF','NFC','West'],
  ['Seattle','Seahawks','#002244','#69be28','Lumen Field','SEA','NFC','West'],
  ['Tampa Bay','Buccaneers','#d50a0a','#ff7900','Raymond James Stadium','TB','NFC','South'],
  ['Tennessee','Titans','#0c2340','#4b92db','Nissan Stadium','TEN','AFC','South'],
  ['Washington','Commanders','#5a1414','#ffb612','Northwest Stadium','WAS','NFC','East'],
];
const offense = ['Spread passing','Power running','Vertical passing','West coast timing','Play-action balance','Outside zone'];
const defense = ['Zone coverage','Pressure front','Man coverage','Run containment'];
export const TEAMS = Object.freeze(clubs.map(([city,name,primaryColor,secondaryColor,stadium,abbreviation,conference,division], i) => Object.freeze({
  id: `cgl-${String(i+1).padStart(2,'0')}`, city, name, primaryColor, secondaryColor, stadium, abbreviation, conference, division,
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
