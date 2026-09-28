// Coordinates are yards from scrimmage (x) and the field's center (y).
// Receiver keys are jersey numbers. Definitions are immutable; each snap gets new world paths.
const wide = { '01': [-5.5, 0], '22': [-10, 5], '08': [-.75, -17.4], '81': [-.75, -8.65], '11': [-.75, 12.85], '19': [-.75, 19.35] };
export const FORMATIONS = {
  spread: { name: 'Shotgun spread', positions: wide },
  bunch: { name: 'Bunch right', positions: { ...wide, '81': [-2, 8], '11': [-.75, 11], '19': [-2, 14], '22': [-9, -5] } },
  tight: { name: 'Singleback tight', positions: { ...wide, '01': [-3, 0], '22': [-9, 0], '81': [-1, -6], '11': [-1, 6] } },
  offset: { name: 'Offset left', positions: { ...wide, '01': [-4, 0], '22': [-9, -6], '81': [-1, -7], '11': [-1, 7] } },
};
const outlet = [[-2, 10], [8, 17], [22, 17]];
const routes = (a, b, c, d, rb = outlet) => ({ '08': a, '81': b, '11': c, '19': d, '22': rb });
const runRoutes = rb => routes([[8, -17.4], [18, -14]], [[5, -6], [12, -3]], [[5, 6], [12, 9]], [[8, 19.35], [18, 17]], rb);
const definitions = [
  { id: 'slants', name: 'Slants', type: 'pass', formation: 'spread', description: 'Quick inside cuts. Hit a receiver as they cross the linebackers.',
    routes: routes([[3, -17.4], [20, -2]], [[2, -8.65], [16, 4]], [[3, 12.85], [20, -3]], [[4, 19.35], [22, 5]]) },
  { id: 'outs', name: 'Quick outs', type: 'pass', formation: 'spread', description: 'Short stems, sharp sideline breaks. Throw before the corner closes.',
    routes: routes([[5, -17.4], [5, -24]], [[4, -8.65], [4, -18]], [[4, 12.85], [4, 21]], [[6, 19.35], [6, 24]]) },
  { id: 'curls', name: 'Curls', type: 'pass', formation: 'spread', description: 'Push upfield, turn back and settle. Wait for the receivers to stop.',
    routes: routes([[12, -17.4], [8, -17.4]], [[10, -8.65], [6, -8.65]], [[10, 12.85], [6, 12.85]], [[12, 19.35], [8, 19.35]]) },
  { id: 'posts', name: 'Posts', type: 'pass', formation: 'spread', description: 'Deep stems break toward the goalposts. Let the route develop.',
    routes: routes([[12, -17.4], [35, -1]], [[9, -8.65], [28, 4]], [[10, 12.85], [32, -4]], [[14, 19.35], [38, 2]]) },
  { id: 'go', name: 'Go routes', type: 'pass', formation: 'spread', description: 'Four vertical routes stretch the defense. Lead your fastest receiver.',
    routes: routes([[60, -17.4]], [[58, -8.65]], [[58, 12.85]], [[60, 19.35]]) },
  { id: 'crosses', name: 'Crosses', type: 'pass', formation: 'bunch', description: 'Shallow crossing routes from a bunch. Find separation over the middle.',
    routes: routes([[12, -17.4], [28, -5]], [[4, 8], [6, -18]], [[7, 11], [9, -12]], [[11, 14], [15, -5]]) },
  { id: 'screen', name: 'Screens', type: 'pass', formation: 'bunch', description: 'Look for #22 behind scrimmage. Linemen release right to lead the screen.',
    releaseDelay: { '22': .45 }, blocking: { release: .6, lane: 16 },
    routes: routes([[30, -17.4]], [[18, 8]], [[22, 11]], [[28, 14]], [[-5, 8], [-3, 17], [1, 19]]) },
  { id: 'play-action', name: 'Play action', type: 'pass', formation: 'tight', description: 'Fake the handoff, then throw deep. Passing unlocks after the 0.9s fake.',
    fakeDuration: .9, releaseDelay: { '22': 0 },
    routes: routes([[10, -17.4], [36, 0]], [[8, -6], [18, -18]], [[7, 6], [20, 19]], [[40, 19.35]], [[-3, 0], [2, 4], [15, 12]]) },
  { id: 'inside', name: 'Inside run', type: 'run', formation: 'tight', description: 'Fast handoff straight through the interior. Steer to choose your gap.',
    exchange: [-4, 0], exchangeTime: .28, blocking: { release: 0, lane: 0 }, routes: runRoutes([[-4, 0], [3, 0], [12, -2], [55, -2]]) },
  { id: 'outside', name: 'Outside run', type: 'run', formation: 'tight', description: 'Handoff right, then cut upfield outside the tackle. Follow your blockers.',
    exchange: [-4, 5], exchangeTime: .42, blocking: { release: .1, lane: 12 }, routes: runRoutes([[-4, 5], [-1, 12], [8, 17], [55, 17]]) },
  { id: 'sweep', name: 'Sweep', type: 'run', formation: 'offset', description: 'Lateral handoff left. Race around the edge behind pulling linemen.',
    exchange: [-5, -10], exchangeTime: .65, blocking: { release: 0, lane: -18 }, routes: runRoutes([[-5, -10], [-4, -19], [6, -22], [55, -22]]) },
  { id: 'draw', name: 'Draw', type: 'run', formation: 'spread', description: 'Show pass for 1.1s, then hand off inside as the rush comes upfield.',
    exchange: [-5, 0], exchangeStart: .75, exchangeTime: 1.1, blocking: { release: 1.1, lane: 4 }, routes: runRoutes([[-5, 0], [2, 0], [10, 5], [55, 5]]) },
];
function freeze(value) { Object.values(value).forEach(v => { if (v && typeof v === 'object') freeze(v); }); return Object.freeze(value); }
freeze(FORMATIONS);
export const PLAYBOOK = freeze(definitions);
export const DEFAULT_PLAY = 'slants';
export function getPlay(id) { return PLAYBOOK.find(play => play.id === id); }
export function worldPoint(point, field, lineOfScrimmage) {
  return { x: Math.max(20, Math.min(field.width - 25, lineOfScrimmage + point[0] * field.yard)), y: Math.max(30, Math.min(field.height - 30, field.height / 2 + point[1] * field.yard)) };
}
