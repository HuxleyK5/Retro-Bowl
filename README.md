# Pocket Field — Phase 2

An original HTML5 Canvas offensive football practice game. Start at your own 35, snap the ball, read the defense, throw to a receiver or hand off, then control the ball carrier until the whistle. The existing fixed-step loop, game state, input, field, camera, and rendering modules remain separate.

## Run

Run `npm start` and open http://localhost:5173. Node.js is required; the game has no runtime dependencies or build step. Keep the server running while playing.

## Controls

| Input | Action |
| --- | --- |
| Space / Snap Ball button | Snap; after the whistle, reset for the next play |
| Mouse + left click | Aim and throw one pass from behind the blue line of scrimmage |
| WASD / arrow keys | Move QB or current ball carrier |
| Shift | Sprint |
| J + direction | Juke; 1.5-second cooldown (J alone dodges upward) |
| H | Hand off to the running back within 1.8 seconds of the snap while nearby |
| Escape / P / Pause button | Pause or resume |
| R | Reset to the original formation at any time during unpaused play |

Click the field to focus keyboard controls. Window focus loss and hidden tabs pause automatically. Tab uses normal browser focus navigation.

## Playing a down

1. Before the snap, dashed lines show the four receiver routes and the running back's outlet route. Attack the right end zone.
2. Snap with Space. Give receivers roughly a second to separate; the line buys a short pocket before pass rushers break through.
3. Point at a receiver to highlight them and preview a led pass. Click to throw. Aim at open grass for an unassisted pass to that location. The reticle marks the intended landing point; accuracy scatter can move the actual landing spot.
4. The ball arcs through the air. Receivers and defenders can attempt a catch during descent. A completion transfers control automatically; use movement immediately, hold Shift, and juke with J to evade nearby defenders.
5. Tackle, sack, touchdown, interception, incompletion, out of bounds, safety, or the 35-second practice limit ends the play. Space or Next Play restores the formation; press Space again to snap.

QB accuracy controls throw dispersion, with added error while moving or under pressure. Receiver catching matters most on stretched, long, or contested catches. Defenders cover assigned receivers, react to nearby airborne passes, pursue runners, and tackle on contact. A brief catch transition gives you time to take control. Juking briefly stuns nearby tacklers; it cannot be spammed.

You can also scramble with the QB or hand off with H. Crossing the line of scrimmage commits the QB to running. There is only one pass per play. Players use acceleration, so starting and reversing direction take a moment.

## Architecture

- `src/core/GameLoop.js`: fixed 60 Hz simulation and animation-frame rendering.
- `src/core/GameState.js`: global playing/paused state.
- `src/input/Input.js`: keyboard, mouse, and focus handling.
- `src/entities/Player.js`: acceleration, movement, sprint, juke, ratings, reset.
- `src/entities/Football.js`: possession and timed airborne trajectory.
- `src/football/Play.js`: roster, pre-snap/live/dead play flow, throws, catches, possession, tackles, outcomes.
- `src/football/Routes.js`: route following and lead prediction.
- `src/football/Defense.js`: simple coverage, pass reaction, rush, and pursuit.
- `src/world/Field.js`: dimensions, boundaries, yard coordinates.
- `src/world/Camera.js`: smooth follow, viewport scale, world/screen conversion.
- `src/rendering/Renderer.js`: field and player drawing.
- `src/rendering/PlayRenderer.js`: routes, line of scrimmage, aiming, football.
- `src/main.js`: system composition and HUD bindings.

## Verification

`npm test` runs deterministic simulation checks for movement/acceleration, sprinting, normalized movement, juke/cooldown, routes, coverage, pursuit, possession, accuracy, catch ratings, catches, drops, interceptions, incompletions, tackling, sacks, touchdowns, handoffs, boundary outcomes, reset, state transitions, and camera coordinates.

For browser checks, run `npm install`, keep the server running, and run `npm run test:browser`. This uses Playwright with installed Microsoft Edge. The tests exercise actual keyboard and mouse controls, complete plays, automatic control transfer, airborne pause, focus-loss pause, rendering and coordinate mapping at four window sizes, and console/network errors. Screenshots are saved under `test-results/`. Randomness is fixed only in tests to make outcomes repeatable.

## Scope

Single-play offensive practice with placeholder graphics and simple AI. Each play restarts at the same spot; there is no drive/down progression, scoreboard accumulation, franchise management, playbook selection, special teams, fumbles, interception returns, or detailed blocking/football physics yet.
