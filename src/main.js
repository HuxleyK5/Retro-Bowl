import { AttractMode } from './game/AttractMode.js';
import { KickMeterPanel } from './ui/KickMeterPanel.js';
import { pullTarget } from './input/PullPass.js';
import { createLeague } from './data/League.js';
import { saveFranchise, loadFranchise } from './data/Franchise.js';
import { FranchiseMode } from './data/FranchiseMode.js';
import { availableRoster } from './data/PlayerLifecycle.js';
import { FranchisePanel } from './ui/FranchisePanel.js';
import { StrategyPanel } from './ui/StrategyPanel.js';
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
import { StadiumAudio } from './audio/StadiumAudio.js';
import { initializeBeginnerMode, isBeginnerMode } from './ui/BeginnerMode.js';

initializeBeginnerMode();

const canvas = document.querySelector('#game');
const viewport = document.querySelector('#viewport');
const overlay = document.querySelector('#overlay');
const pauseButton = document.querySelector('#pause');
const resumeButton = document.querySelector('#resume');
const field = new Field();
const camera = new Camera(field);
const renderer = new Renderer(canvas, camera, field);
const audio = new StadiumAudio();
const soundButton = document.querySelector('#sound-toggle');
const conditions = document.querySelector('#stadium-conditions');
let league = createLeague();
let selecting = true;
let inHub = false;
let franchise = null;
let activeGameId = null;
let resultRecorded = false;
let saveWarning = '';
const play = new Play(field, Math.random, { home: league[0].roster, away: league[1].roster });
const match = new MatchController(play);
const hud = new GameHUD(match);
play.configure(25);
const state = new GameState(mode => {
  input.clear();
  audio.setPaused(mode === 'paused' || selecting || inHub);
  overlay.hidden = mode !== 'paused';
  pauseButton.querySelector('span').textContent = mode === 'paused' ? 'RESUME' : 'PAUSE';
  if (mode === 'paused') resumeButton.focus({ preventScroll: true });
  else if (['pregame', 'halftime', 'quarterBreak', 'final'].includes(match.rules.phase)) document.querySelector('#screen-action').focus({ preventScroll: true });
  else canvas.focus({ preventScroll: true });
});
const action = name => {
  if (selecting || inHub || !state.playing) return;
  if (audio.enabled) audio.unlock();
  if (name === 'aimStart') {
    if (match.rules.phase === 'kickMeter') { match.lockKick(); return false; }
    if (!match.humanTurn) return false;
    if (match.rules.phase === 'ready') match.snap();
    return match.rules.phase === 'live' && play.phase === 'passing' && play.call?.type !== 'run';
  }
  const target = name === 'throw' ? pullTarget(play.qb, input.drag, input.pointer) : camera.screenToWorld(input.pointer);
  if (name === 'throw' && !target) return;
  match.action(name, input.movement, target);
  canvas.focus({ preventScroll: true });
};
const input = new Input(canvas, name => {
  if (selecting || inHub) return;
  if (name === 'pause') { state.togglePause(); return; }
  return action(name);
}, () => { if (!selecting && !inHub) state.set('paused'); });
const ratings = new RatingsPanel(play, state, () => {
  const screen = ['pregame', 'halftime', 'quarterBreak', 'final'].includes(match.rules.phase);
  document.querySelector(screen ? '#screen-action' : '#game').focus({ preventScroll: true });
});
const kickMeter = new KickMeterPanel(match, () => action('snap'));
const playbook = new PlaybookPanel(match, id => {
  if (!state.playing || !match.selectPlay(id)) return;
  input.clear(); camera.followPlay(play, 0); canvas.focus({ preventScroll: true });
}, () => action('snap'));
const strategy = new StrategyPanel(document.querySelector('#strategy-panel'), match, (name, value) => {
  if (selecting || inHub || !state.playing) return;
  if (match.tactic(name, value)) {
    if (['formation', 'motion', 'kneel', 'spike'].includes(name)) input.clear();
    camera.followPlay(play, 0);
  }
  strategy.update(!state.playing);
});
pauseButton.addEventListener('click', () => state.togglePause());
resumeButton.addEventListener('click', () => state.set('playing'));
soundButton.addEventListener('click', () => {
  audio.toggle();
  if (audio.enabled) audio.unlock();
  soundButton.setAttribute('aria-pressed', String(audio.enabled));
  soundButton.setAttribute('aria-label', audio.enabled ? 'Mute stadium sound' : 'Enable stadium sound');
  soundButton.textContent = !audio.supported ? 'SOUND UNAVAILABLE' : audio.enabled ? 'SOUND ON' : 'SOUND OFF';
});
document.querySelector('#stadium-weather').addEventListener('change', event => {
  renderer.stadium.weather = event.target.value;
});
document.querySelector('#stadium-lighting').addEventListener('change', event => {
  renderer.stadium.cycle = event.target.value;
});
document.querySelector('#snap').addEventListener('click', () => action('snap'));
document.querySelector('#field-goal').addEventListener('click', () => action('fieldGoal'));
document.querySelector('#punt').addEventListener('click', () => action('punt'));
document.querySelector('#screen-action').addEventListener('click', () => {
  if (selecting || inHub || !state.playing) return;
  if (audio.enabled) audio.unlock();
  if (match.rules.phase === 'pregame') {
    match.start(Number(document.querySelector('#quarter-length').value));
    renderer.resetPresentation(); audio.reset(play, match.rules);
  }
  else if (match.rules.phase === 'final') {
    commitFinal(); showHub(); return;
  }
  else match.advance();
  input.clear(); camera.followPlay(play, 0);
  canvas.focus({ preventScroll: true });
});
const resize = () => {
  const { width, height } = viewport.getBoundingClientRect();
  renderer.resize(width, height); camera.followPlay(play, 0);
};
new ResizeObserver(resize).observe(viewport);
window.addEventListener('resize', resize);
resize();
const attract = new AttractMode({
  onStart() { input.clear(); audio.setPaused(true); },
  onEnd() { input.clear(); audio.setPaused(!state.playing || selecting || inHub); },
});
const loop = new GameLoop(dt => {
  if (!attract.active && (input.keys.size || input.drag)) attract.activity();
  attract.update(dt);
  if (attract.active) return;
  if (selecting || inHub || !state.playing) return;
  match.update(dt, input.movement);
  renderer.updateEffects(dt, play, match.rules);
  audio.update(dt, play, match.rules);
  camera.followPlay(play, dt);
}, () => {
  if (attract.active) { attract.render(); return; }
  const canHold = input.drag && state.playing && match.humanTurn && match.rules.phase === 'live' && play.phase === 'passing' && play.call?.type !== 'run';
  if (!canHold) input.cancelDrag();
  const canAim = canHold && play.canThrow;
  const target = canAim ? pullTarget(play.qb, input.drag, input.pointer) : null;
  const aim = target ? play.aim(target, match.throwDepth) : null;
  const selected = match.humanTurn && play.phase !== 'flight' && match.rules.phase !== 'kick' ? play.controlled : null;
  renderer.render(play.players, selected, play, aim);
  if (selecting || inHub) return;
  const conditionText = renderer.stadium.label || `${renderer.stadium.cycle.toUpperCase()} / ${renderer.stadium.weather.toUpperCase()}`;
  if (conditions.textContent !== conditionText) conditions.textContent = conditionText;
  document.querySelector('#viewport').classList.toggle('celebrating', renderer.effects.effects.some(effect => effect.type === 'touchdown'));
  if (match.rules.phase === 'final') commitFinal();
  hud.update(!state.playing);
  playbook.update(!state.playing);
  strategy.update(!state.playing);
  kickMeter.update(!state.playing);
  if (match.rules.phase === 'final') {
    hud.text('screen-action', 'FRANCHISE HUB');
    hud.text('screen-copy', match.rules.detail);
    hud.text('play-notice', `${match.rules.detail || 'Final result recorded.'} Return to your franchise to prepare for next week.`);
  }
});
let saved = null;
try { saved = loadFranchise(localStorage); } catch { /* Storage may be disabled. */ }
const selection = new TeamSelection(league, saved, (chosenLeague, teamId, restoredMode) => {
  franchise = restoredMode || new FranchiseMode(chosenLeague, teamId);
  league = franchise.league;
  activeGameId = null; resultRecorded = false;
  franchisePanel.setFranchise(franchise);
  persistFranchise();
  showHub();
});

const matchActive = () => !!activeGameId && !resultRecorded && !['pregame', 'final'].includes(match.rules.phase);

function persistFranchise() {
  if (!franchise) return;
  try {
    saveFranchise(localStorage, league, franchise.teamId, franchise);
    selection.saved = loadFranchise(localStorage);
    if (!selection.saved) throw new Error('The saved franchise could not be restored.');
    document.querySelector('#continue-franchise').hidden = !selection.saved;
    saveWarning = '';
  } catch {
    saveWarning = 'Your franchise could not be saved in this browser. You can keep playing for this session.';
    selection.saved = { league, teamId: franchise.teamId, mode: franchise };
    document.querySelector('#continue-franchise').hidden = false;
  }
}

function commitFinal() {
  if (!franchise || !activeGameId || resultRecorded || match.rules.phase !== 'final') return;
  const result = franchise.recordGame(match.rules.score.home, match.rules.score.away, activeGameId);
  resultRecorded = true;
  match.rules.detail = `Season ${franchise.year} result saved. Standings, development and player health updated.`;
  if (result?.overtime) {
    const userIsHome = result.homeId === franchise.teamId;
    const home = userIsHome ? result.homeScore : result.awayScore;
    const away = userIsHome ? result.awayScore : result.homeScore;
    match.rules.byQuarter.home[3] += home - match.rules.score.home;
    match.rules.byQuarter.away[3] += away - match.rules.score.away;
    match.rules.score = { home, away };
    match.rules.detail = 'Playoff tie resolved in simulated overtime. Final result saved.';
    hud.screenPhase = null;
  }
  persistFranchise();
  if (saveWarning) match.rules.detail = saveWarning;
}

function showHub() {
  inHub = true; selecting = false;
  input.clear(); audio.setPaused(true);
  selection.root.hidden = true;
  document.querySelector('.game-shell').hidden = true;
  document.querySelector('.intro').textContent = `${franchise.team.city} ${franchise.team.name} / Franchise headquarters`;
  franchisePanel.setFranchise(franchise);
  franchisePanel.setMatchActive(matchActive());
  franchisePanel.show();
  if (saveWarning) franchisePanel.setNotice(saveWarning, true);
}

function openFranchiseGame() {
  if (matchActive()) {
    inHub = false; franchisePanel.hide();
    document.querySelector('.game-shell').hidden = false;
    state.set('playing'); audio.setPaused(false); resize();
    canvas.focus({ preventScroll: true });
    return;
  }
  try { franchise.assertReady(); }
  catch (error) { showHub(); franchisePanel.setNotice(error.message, true); return; }
  const game = franchise.nextGame;
  if (!game) { showHub(); return; }
  activeGameId = game.id; resultRecorded = false;
  const home = franchise.team;
  const away = league.find(t => t.id === (game.homeId === home.id ? game.awayId : game.homeId));
  const venue = league.find(t => t.id === game.homeId).stadium;
  play.rosters = { home: home.roster, away: away.roster };
  match.rules.teams = { home: `${home.city} ${home.name}`, away: `${away.city} ${away.name}` };
  match.rules.reset(); match.meter = null; match.phaseAge = 0; play.configure(25); hud.screenPhase = null;
  renderer.teams = { home, away };
  renderer.resetPresentation(); audio.reset(play, match.rules);
  match.rules.specialists = Object.fromEntries(Object.entries({ home, away }).map(([side,t]) => {
    const healthy = availableRoster(t);
    return [side, { kicker:healthy.find(p=>p.position==='K'), punter:healthy.find(p=>p.position==='P') }];
  }));
  for (const [side, team] of Object.entries({ home, away })) {
    document.querySelector(`#${side}-team small`).textContent = `${game.homeId === team.id ? 'HOME' : 'AWAY'} / ${side === 'home' ? 'YOU' : 'CPU'}`;
    document.querySelector(`#${side}-name`).textContent = team.name.toUpperCase();
    const icon = document.querySelector(`#${side}-team .team-icon`);
    icon.textContent = team.abbreviation; icon.style.background = team.primaryColor; icon.style.color = team.secondaryColor;
    document.querySelector(`#ratings-team option[value="${side}"]`).textContent = `${team.city} ${team.name}`;
  }
  document.querySelector('.intro').textContent = `${home.city} ${home.name} vs ${away.city} ${away.name} / ${venue}`;
  document.querySelector('.session div').textContent = `SEASON ${franchise.year} / ${franchise.phase === 'playoffs' ? 'PLAYOFFS' : `WEEK ${franchise.week}`}`;
  if (saveWarning) document.querySelector('.intro').textContent += ` / ${saveWarning}`;
  selecting = false; inHub = false; selection.root.hidden = true; franchisePanel.hide(); document.querySelector('.game-shell').hidden = false;
  state.set('playing'); audio.setPaused(false); input.clear(); resize();
}

const franchisePanel = new FranchisePanel(document.querySelector('#franchise-screen'), {
  onPlay: openFranchiseGame,
  onClubSelection: showClubSelection,
  onAction(method, ...args) {
    if (matchActive()) throw new Error('Finish your current game before making roster moves or advancing the week.');
    const allowed = ['simulateWeek', 'train', 'rest', 'sign', 'renew', 'release', 'trade', 'draft', 'advanceOffseason'];
    if (!allowed.includes(method)) throw new Error('Unknown franchise action.');
    const result = franchise[method](...args);
    activeGameId = null; resultRecorded = false;
    persistFranchise();
    franchisePanel.setFranchise(franchise);
    if (saveWarning) franchisePanel.setNotice(saveWarning, true);
    return result;
  },
});

function showClubSelection() {
  if (match.rules.phase === 'final') commitFinal();
  selecting = true; input.clear(); selection.root.hidden = false; document.querySelector('.game-shell').hidden = true;
  inHub = false; franchisePanel.hide();
  audio.setPaused(true);
  document.querySelector('#start-franchise').focus({ preventScroll: true });
}
document.querySelector('#change-club').addEventListener('click', showClubSelection);
const hubButton = document.createElement('button');
hubButton.id = 'franchise-toggle'; hubButton.type = 'button'; hubButton.textContent = isBeginnerMode() ? 'MY TEAM' : 'FRANCHISE HUB';
hubButton.addEventListener('click', () => { if (match.rules.phase === 'final') commitFinal(); showHub(); });
document.querySelector('.controls').prepend(hubButton);
document.querySelector('#football-basics').addEventListener('toggle', event => {
  if (event.currentTarget.open && !selecting && !inHub && state.playing) {
    const focus = document.activeElement;
    const readingGuide = event.currentTarget.contains(focus);
    state.set('paused');
    if (readingGuide) focus.focus({ preventScroll: true });
  }
});
document.addEventListener('beginner-mode-change', () => {
  input.clear();
  hud.screenPhase = null;
  hubButton.textContent = isBeginnerMode() ? 'MY TEAM' : 'FRANCHISE HUB';
  selection.render();
  franchisePanel.render();
  if (!selecting && !inHub) {
    const paused = !state.playing;
    hud.update(paused); playbook.update(paused); strategy.update(paused); kickMeter.update(paused);
  }
  resize();
});
loop.start();
export { play, camera, state, loop, match, league, renderer, audio, franchise, franchisePanel, strategy, attract };
