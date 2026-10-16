import { createLeague } from './League.js';
import { PlayerData } from './PlayerData.js';
import { FranchiseMode, ROSTER_LIMIT } from './FranchiseMode.js';
const KEY = 'pocket-field.franchise.v1';
export function saveFranchise(storage, league, teamId, mode = null) {
  if (league instanceof FranchiseMode) { mode = league; teamId = mode.teamId; league = mode.league; }
  const snapshot = mode?.toJSON ? mode.toJSON() : mode;
  storage.setItem(KEY, JSON.stringify({version:snapshot?2:1,teamId,rosters:league.map(t=>({id:t.id,players:t.roster.map(p=>p.toJSON())})),...(snapshot ? {mode:snapshot} : {})}));
}
export function loadFranchise(storage) {
  try {
    const value=JSON.parse(storage.getItem(KEY));
    const league=createLeague();
    if(![1,2].includes(value?.version) || !league.some(t=>t.id===value.teamId) || !Array.isArray(value.rosters) || value.rosters.length!==24 || new Set(value.rosters.map(r=>r.id)).size!==24) return null;
    const ids=new Set();
    for(const team of league) {
      const records=value.rosters.find(r=>r.id===team.id)?.players;
      if(!Array.isArray(records) || (value.version===1 ? records.length!==53 : records.length>ROSTER_LIMIT)) return null;
      const expected=new Map(team.roster.map(p=>[p.id,p]));
      team.roster=records.map(r=>{
        const p=PlayerData.fromJSON(r), original=expected.get(p.id);
        if(p.teamId!==team.id || ids.has(p.id) || value.version===1 && (!original || p.position!==original.position || p.specialty!==original.specialty)) throw new Error('Invalid roster');
        ids.add(p.id);return p;
      });
    }
    if(value.version===2) {
      if(!value.mode || typeof value.mode!=='object') return null;
      return {league,teamId:value.teamId,mode:new FranchiseMode(league,value.teamId,value.mode)};
    }
    return {league,teamId:value.teamId};
  } catch { return null; }
}
