import { LEAGUE_NAME } from '../data/League.js';
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
    document.querySelector('#start-franchise').addEventListener('click',()=>onStart(this.league,this.selected.id));
    const resume=document.querySelector('#continue-franchise');resume.hidden=!saved;
    resume.addEventListener('click',()=>onStart(this.saved.league,this.saved.teamId));
    this.render();
  }
  render() {
    const t=this.selected;
    this.root.querySelectorAll('[data-team]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.team===t.id)));
    document.querySelector('#selected-club').textContent=`${t.city} ${t.name}`;
    document.querySelector('#club-details').textContent=`${t.stadium} · ${t.offensiveIdentity} offense · ${t.defensiveIdentity} defense`;
    document.querySelector('#club-summary').textContent=`53 players · Average OVR ${Math.round(t.roster.reduce((n,p)=>n+p.overall,0)/53)} · Annual payroll $${(t.roster.reduce((n,p)=>n+p.contract.annualSalary,0)/1000000).toFixed(1)}M`;
    const body=document.querySelector('#club-roster');body.replaceChildren();
    for(const p of t.roster) {
      const row=document.createElement('tr');
      for(const value of [`#${p.number} ${p.name}`,p.specialty,p.age,p.overall,p.potential,`${p.contract.yearsRemaining} yr / $${(p.contract.annualSalary/1000000).toFixed(2)}M`, `$${(p.contract.guaranteed/1000000).toFixed(2)}M`]) {const cell=document.createElement('td');cell.textContent=value;row.append(cell);}
      body.append(row);
    }
  }
}
