import { createLeague } from './League.js';
import { PlayerData } from './PlayerData.js';
const KEY = 'pocket-field.franchise.v1';
export function saveFranchise(storage, league, teamId) {
  storage.setItem(KEY, JSON.stringify({version:1,teamId,rosters:league.map(t=>({id:t.id,players:t.roster.map(p=>p.toJSON())}))}));
}
export function loadFranchise(storage) {
  try {
    const value=JSON.parse(storage.getItem(KEY));
    const league=createLeague();
    if(value?.version!==1 || !league.some(t=>t.id===value.teamId) || value.rosters?.length!==24) return null;
    const ids=new Set();
    for(const team of league) {
      const records=value.rosters.find(r=>r.id===team.id)?.players;
      if(records?.length!==53) return null;
      const expected=new Map(team.roster.map(p=>[p.id,p]));
      team.roster=records.map(r=>{
        const p=PlayerData.fromJSON(r), original=expected.get(p.id);
        if(!original || p.teamId!==team.id || ids.has(p.id) || p.position!==original.position || p.specialty!==original.specialty) throw new Error('Invalid roster');
        ids.add(p.id);return p;
      });
    }
    return {league,teamId:value.teamId};
  } catch { return null; }
}
