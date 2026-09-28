import { createLeague } from './data/League.js';
import { saveFranchise, loadFranchise } from './data/Franchise.js';
import { TeamSelection } from './ui/TeamSelection.js';
import { GameLoop } from './core/GameLoop.js';
import { GameState } from './core/GameState.js';
import { Input } from './input/Input.js';
import { Field } from './world/Field.js';
import { Camera } from './world/Camera.js';
import { Renderer } from './rendering/Renderer.js';
import { Play } from './football/Play.js';
import { MatchController } from './game/MatchController.js';
import { GameHUD } from './ui/GameHUD.js';
import { PlaybookPanel } from './ui/PlaybookPanel.js';
import { RatingsPanel } from './ui/RatingsPanel.js';

const canvas = document.querySelector('#game');
const viewport = document.querySelector('#viewport');
const overlay = document.querySelector('#overlay');
const pauseButton = document.querySelector('#pause');
const resumeButton = document.querySelector('#resume');
const field = new Field();
const camera = new Camera(field);
const renderer = new Renderer(canvas, camera, field);
let league = createLeague();
let selecting = true;
const play = new Play(field, Math.random, { home: league[0].roster, away: league[1].roster });
const match = new MatchController(play);
const hud = new GameHUD(match);
play.configure(25);
const state = new GameState(mode => {
  input.clear();
  overlay.hidden = mode !== 'paused';
  pauseButton.querySelector('span').textContent = mode === 'paused' ? 'RESUME' : 'PAUSE';
  if (mode === 'paused') resumeButton.focus({ preventScroll: true });
  else if (['pregame', 'halftime', 'quarterBreak', 'final'].includes(match.rules.phase)) document.querySelector('#screen-action').focus({ preventScroll: true });
  else canvas.focus({ preventScroll: true });
});
const action = name => {
  if (selecting || !state.playing) return;
  match.action(name, input.movement, camera.screenToWorld(input.pointer));
  canvas.focus({ preventScroll: true });
};
const input = new Input(canvas, name => {
  if (selecting) return;
  if (name === 'pause') { state.togglePause(); return; }
  action(name);
}, () => { if (!selecting) state.set('paused'); });
const ratings = new RatingsPanel(play, state, () => {
  const screen = ['pregame', 'halftime', 'quarterBreak', 'final'].includes(match.rules.phase);
  document.querySelector(screen ? '#screen-action' : '#game').focus({ preventScroll: true });
});
const playbook = new PlaybookPanel(match, id => {
  if (!state.playing || !match.selectPlay(id)) return;
  input.clear(); camera.follow(play.controlled, 0, true); canvas.focus({ preventScroll: true });
}, () => action('snap'));
pauseButton.addEventListener('click', () => state.togglePause());
resumeButton.addEventListener('click', () => state.set('playing'));
document.querySelector('#snap').addEventListener('click', () => action('snap'));
document.querySelector('#field-goal').addEventListener('click', () => action('fieldGoal'));
document.querySelector('#punt').addEventListener('click', () => action('punt'));
document.querySelector('#screen-action').addEventListener('click', () => {
  if (selecting || !state.playing) return;
  if (match.rules.phase === 'pregame') match.start(Number(document.querySelector('#quarter-length').value));
  else if (match.rules.phase === 'final') { match.rules.reset(); play.configure(25); }
  else match.advance();
  input.clear(); camera.follow(play.controlled, 0, true);
  canvas.focus({ preventScroll: true });
});
const resize = () => {
  const { width, height } = viewport.getBoundingClientRect();
  renderer.resize(width, height); camera.follow(play.controlled, 0, true);
};
new ResizeObserver(resize).observe(viewport);
window.addEventListener('resize', resize);
resize();
const loop = new GameLoop(dt => {
  if (selecting || !state.playing) return;
  match.update(dt, input.movement);
  camera.follow(play.ball.mode === 'flight' ? play.ball : play.controlled, dt);
}, () => {
  const canAim = input.pointer.active && state.playing && match.humanTurn && match.rules.phase === 'live' && play.canThrow;
  const aim = canAim ? play.aim(camera.screenToWorld(input.pointer)) : null;
  const selected = match.humanTurn && play.phase !== 'flight' && match.rules.phase !== 'kick' ? play.controlled : null;
  renderer.render(play.players, selected, play, aim);
  if (selecting) return;
  hud.update(!state.playing);
  playbook.update(!state.playing);
});
let saved = null;
try { saved = loadFranchise(localStorage); } catch { /* Storage may be disabled. */ }
const selection = new TeamSelection(league, saved, (chosenLeague, teamId) => {
  league = chosenLeague;
  const home = league.find(t => t.id === teamId);
  const away = league[(league.indexOf(home) + 1) % league.length];
  play.rosters = { home: home.roster, away: away.roster };
  match.rules.teams = { home: `${home.city} ${home.name}`, away: `${away.city} ${away.name}` };
  match.rules.reset(); match.phaseAge = 0; play.configure(25); hud.screenPhase = null;
  renderer.teams = { home, away };
  match.rules.specialists = Object.fromEntries(Object.entries({ home, away }).map(([side,t]) => [side, { kicker:t.roster.find(p=>p.position==='K'), punter:t.roster.find(p=>p.position==='P') }]));
  for (const [side, team] of Object.entries({ home, away })) {
    document.querySelector(`#${side}-name`).textContent = team.name.toUpperCase();
    const icon = document.querySelector(`#${side}-team .team-icon`);
    icon.textContent = team.abbreviation; icon.style.background = team.primaryColor; icon.style.color = team.secondaryColor;
    document.querySelector(`#ratings-team option[value="${side}"]`).textContent = `${team.city} ${team.name}`;
  }
  document.querySelector('.intro').textContent = `${home.city} ${home.name} vs ${away.city} ${away.name} / ${home.stadium}`;
  document.querySelector('.session div').textContent = 'FRANCHISE OPENING MATCH';
  try { saveFranchise(localStorage, league, teamId); selection.saved = {league,teamId}; document.querySelector('#continue-franchise').hidden = false; }
  catch { document.querySelector('.intro').textContent += ' / Storage unavailable: this session will not be saved.'; }
  selecting = false; selection.root.hidden = true; document.querySelector('.game-shell').hidden = false;
  state.set('playing'); input.clear(); resize();
});
document.querySelector('#change-club').addEventListener('click', () => {
  selecting = true; input.clear(); selection.root.hidden = false; document.querySelector('.game-shell').hidden = true;
  document.querySelector('#start-franchise').focus({ preventScroll: true });
});
loop.start();
export { play, camera, state, loop, match, league };
