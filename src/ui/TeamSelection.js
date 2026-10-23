import { createLeague, LEAGUE_NAME } from '../data/League.js';
import { positionLabel, positionRole, teamStyleSummary } from '../data/FootballTerms.js';
import { playerStars } from '../data/PlayerStars.js';
import { isBeginnerMode } from './BeginnerMode.js';
export class TeamSelection {
  constructor(league, saved, onStart) {
    this.saved=saved; this.league=league; this.selected=league.find(t=>t.id===saved?.teamId)||league[0];
    this.root=document.querySelector('#league-screen');
    const grid=document.querySelector('#team-grid');
    for(const team of league) {
      const button=document.createElement('button'); button.type='button'; button.className='club-card'; button.dataset.team=team.id;
      button.style.setProperty('--club',team.primaryColor); button.style.setProperty('--trim',team.secondaryColor);
      const city=document.createElement('small'); city.textContent=team.city;
      const name=document.createElement('strong'); name.textContent=team.name;
      button.append(city,name); button.addEventListener('click',()=>{this.selected=team;this.render();});grid.append(button);
    }
    document.querySelector('#league-name').textContent=LEAGUE_NAME;
    document.querySelector('#start-franchise').addEventListener('click',()=>onStart(createLeague(),this.selected.id));
    const resume=document.querySelector('#continue-franchise');resume.hidden=!saved;
    resume.addEventListener('click',()=>onStart(this.saved.league,this.saved.teamId,this.saved.mode));
    this.render();
  }
  render() {
    const t=this.selected, beginner=isBeginnerMode();
    this.root.querySelectorAll('[data-team]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.team===t.id)));
    document.querySelector('#selected-club').textContent=`${t.city} ${t.name}`;
    const details=document.querySelector('#club-details');
    details.textContent=beginner?`${t.stadium} · ${teamStyleSummary(t)}`:`${t.stadium} · ${t.offensiveIdentity} offense · ${t.defensiveIdentity} defense`;
    details.title=`${t.offensiveIdentity} offense · ${t.defensiveIdentity} defense`;
    const overall=Math.round(t.roster.reduce((n,p)=>n+p.overall,0)/Math.max(1,t.roster.length));
    document.querySelector('#club-summary').textContent=beginner
      ?`${t.roster.length} players · Team ability ${playerStars(overall)} / 5 stars · You coach the team: choose plays and control the action. The game picks your best healthy players.`
      :`${t.roster.length} players · Average OVR ${overall} · Annual payroll $${(t.roster.reduce((n,p)=>n+p.contract.annualSalary,0)/1000000).toFixed(1)}M`;
    const headers=this.root.querySelectorAll('.club-table th');
    const labels=beginner?['PLAYER','POSITION','AGE','ABILITY','COULD REACH','COST / SEASON','GUARANTEED']:['PLAYER','POS','AGE','OVR','POT','CONTRACT / YEAR','GUARANTEED'];
    headers.forEach((header,index)=>{
      header.textContent=labels[index];
      header.title=["Player's name and jersey number",'Position and role on the team','Age in years',beginner?'Current ability out of 5 stars':'Overall ability out of 99',beginner?'Future ability the player could reach through development':'Potential ability ceiling out of 99','Annual salary; only this amount uses the yearly team budget','Money the team still owes even if the player is released'][index];
    });
    const rosterDetails=this.root.querySelector('.club-detail details');
    const rosterSummary=rosterDetails?.querySelector('summary');
    if(rosterSummary)rosterSummary.textContent=beginner?`OPTIONAL: MEET ALL ${t.roster.length} PLAYERS`:`EXPLORE ALL ${t.roster.length} PLAYERS`;
    const body=document.querySelector('#club-roster');body.replaceChildren();
    for(const p of t.roster) {
      const row=document.createElement('tr');
      for(const [index,value] of [`#${p.number} ${p.name}`,beginner?positionLabel(p):p.specialty,p.age,beginner?`${playerStars(p.overall)} / 5 stars`:p.overall,beginner?`${playerStars(p.potential)} / 5 stars`:p.potential,beginner?`$${(p.contract.annualSalary/1000000).toFixed(2)}M / season`:`${p.contract.yearsRemaining} yr / $${(p.contract.annualSalary/1000000).toFixed(2)}M`, `$${(p.contract.guaranteed/1000000).toFixed(2)}M`].entries()) {const cell=document.createElement('td');cell.textContent=value;if(index===1)cell.title=positionRole(p);row.append(cell);}
      body.append(row);
    }
  }
}
