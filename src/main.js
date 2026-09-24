import { GameLoop } from './core/GameLoop.js';
import { GameState } from './core/GameState.js';
import { Input } from './input/Input.js';
import { Field } from './world/Field.js';
import { Camera } from './world/Camera.js';
import { Renderer } from './rendering/Renderer.js';
import { Play } from './football/Play.js';

const canvas = document.querySelector('#game');
const viewport = document.querySelector('#viewport');
const overlay = document.querySelector('#overlay');
const pauseButton = document.querySelector('#pause');
const resumeButton = document.querySelector('#resume');
const field = new Field();
const camera = new Camera(field);
const renderer = new Renderer(canvas, camera, field);
const play = new Play(field);
const state = new GameState(mode => {
  input.clear();
  overlay.hidden = mode !== 'paused';
  pauseButton.querySelector('span').textContent = mode === 'paused' ? 'RESUME' : 'PAUSE';
  if (mode === 'paused') resumeButton.focus({ preventScroll: true });
  else canvas.focus({ preventScroll: true });
});
const reset = () => { play.reset(); input.clear(); camera.follow(play.controlled, 0, true); };
const input = new Input(canvas, action => {
  if (action === 'pause') { state.togglePause(); return; }
  if (!state.playing) return;
  if (action === 'reset') reset();
  if (action === 'snap') { if (play.phase === 'dead') reset(); else play.snap(); }
  if (action === 'throw') play.throw(camera.screenToWorld(input.pointer));
  if (action === 'handoff') play.handoff();
  if (action === 'juke') play.juke(input.movement);
}, () => state.set('paused'));
pauseButton.addEventListener('click', () => state.togglePause());
resumeButton.addEventListener('click', () => state.set('playing'));
const snapButton = document.querySelector('#snap');
snapButton.addEventListener('click', () => {
  if (!state.playing) return;
  if (play.phase === 'dead') reset(); else play.snap();
  canvas.focus({ preventScroll: true });
});
const resize = () => {
  const { width, height } = viewport.getBoundingClientRect();
  renderer.resize(width, height); camera.follow(play.controlled, 0, true);
};
new ResizeObserver(resize).observe(viewport);
window.addEventListener('resize', resize);
resize();
const playerLabel = document.querySelector('#player-label');
const positionLabel = document.querySelector('#position-label');
const stateLabel = document.querySelector('#state-label');
const notice = document.querySelector('#play-notice');
const result = document.querySelector('#play-result');
const jukeLabel = document.querySelector('#juke-label');
const phaseNames = { presnap: 'PRE-SNAP', passing: 'FIND YOUR RECEIVER', flight: 'PASS IN FLIGHT', running: 'BALL CARRIER', dead: 'PLAY COMPLETE' };
const loop = new GameLoop(dt => {
  if (!state.playing) return;
  play.update(dt, input.movement);
  camera.follow(play.ball.mode === 'flight' ? play.ball : play.controlled, dt);
}, () => {
  const aim = input.pointer.active && state.playing && play.canThrow ? play.aim(camera.screenToWorld(input.pointer)) : null;
  renderer.render(play.players, play.phase === 'flight' ? null : play.controlled, play, aim);
  playerLabel.textContent = `${play.controlled.number} / ${play.controlled.role}`;
  positionLabel.textContent = field.positionLabel(play.ball.x);
  stateLabel.textContent = state.playing ? phaseNames[play.phase] : 'PRACTICE PAUSED';
  notice.textContent = play.notice;
  result.textContent = play.result;
  result.hidden = play.phase !== 'dead';
  snapButton.hidden = play.live;
  snapButton.disabled = !state.playing;
  snapButton.textContent = play.phase === 'dead' ? 'NEXT PLAY →' : 'SNAP BALL →';
  jukeLabel.textContent = play.controlled.jukeCooldown > 0 ? `JUKE ${play.controlled.jukeCooldown.toFixed(1)}s` : 'JUKE READY';
});
canvas.focus({ preventScroll: true });
loop.start();

// Export composition for integration checks without adding global debug state.
export { play, camera, state, loop };
