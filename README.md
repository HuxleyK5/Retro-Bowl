# Pocket Field — Phase 6

A complete four-quarter retro football exhibition with a twelve-play offensive playbook. You control your selected club's offense; its opponent chooses calls from the same playbook and uses the same passing, catching, running and defensive AI. Choose 1-, 2-, 5- or 15-minute quarters, play through halftime, and finish with a score and a quarter-by-quarter line score.

## Run

Run `npm start` and open http://localhost:5173. Node.js is required. There are no runtime dependencies or build steps. Choose one of 24 clubs and click **Start Franchise** (or **Continue Saved Club**), then select a quarter length and click **Start Game**.

## Fictional league (Phase 6)

The Continental Gridiron League has 24 original clubs, each with a city, nickname, two colors, stadium, and offensive/defensive identity. Select any club to see its full roster, overall ratings, ages, potential, annual salaries, remaining contract years, and guaranteed money. Actual club names, uniforms, stadium labels, player names, ratings, and special-team specialists carry into the game. The next club in league order is the opening opponent.

Each deterministic 53-player roster has 3 QB, 4 RB, 6 WR, 3 TE, 9 OL, 8 DL, 7 LB, 10 DB, a kicker, a punter, and a long snapper. `position` is the rating/gameplay group; `specialty` is the displayed depth position (TE uses WR ratings, DL/LB/DB use DEF, LS uses OL). The existing arcade field lineup remains 11 offensive and 8 defensive entities. Remaining players are roster depth; substitutions and injuries are future work. Overall is derived from attributes; potential and contracts are stored development/economy data.

- `src/data/League.js`: club catalog and deterministic full roster generation.
- `src/data/PlayerData.js`: validated persistent player records; optional metadata defaults preserve older records.
- `src/data/Franchise.js`: versioned browser snapshot, validation, and safe recovery from corrupt or unavailable storage.
- `src/ui/TeamSelection.js`: club picker and complete roster preview.

**Continue Saved Club** restores the selected club and league rosters. **Start Franchise** replaces that snapshot. **League / New Franchise** returns to selection and stops the current game. These are franchise foundations, not a season simulator: schedules, trades, contract negotiations, and match-progress saves are not implemented. Identity labels describe clubs; they do not replace the existing coach AI.

## Controls

| Input | Action |
| --- | --- |
| Space / contextual button | Snap, continue after a play, or kick the extra point |
| Play buttons / Q and E | Choose a play or cycle audibles before the snap |
| Roster / Ratings button | Inspect both teams; pauses the game and restores the previous pause state on close |
| Mouse + left click | Aim and throw one pass from behind the blue line of scrimmage |
| WASD / arrow keys | Move QB or ball carrier |
| Shift | Sprint |
| J + direction | Juke; duration and cooldown depend on elusiveness and awareness (J alone dodges upward) |
| H | Hand off to the nearby running back within 1.8 seconds of the snap |
| F / Field Goal button | Attempt a field goal before the snap; distance and success chance shown |
| K / Punt button | Punt before the snap |
| Escape / P / Pause button | Pause or resume the game and both clocks |
| R | Continue after a whistle; cannot erase or replay an active down |

Click the field to focus keyboard controls. Window focus loss and hidden tabs pause automatically. CPU possessions run automatically; movement and play calls cannot control the opponent. Quarter breaks and halftime wait for your confirmation.

## Player ratings (Phase 5)

Every player has a stable ID, name, jersey number, team, position and validated **1–99 ratings**. The league contains 24 complete 53-player rosters; the active matchup uses those persistent player records. Open **Roster / Ratings** in the control bar to inspect the ratings for each position and derived movement or arm abilities. Inspection pauses both clocks and live action. Overall is a display-only average; individual ratings drive gameplay.

| Position | Ratings and gameplay effects |
| --- | --- |
| QB | Throw Power controls range and flight speed; Accuracy controls dispersion; Speed controls movement; Awareness improves pressure handling, lead prediction and CPU reads |
| RB | Speed and Acceleration control movement; Strength resists tackles; Elusiveness improves timed jukes; Awareness improves juke timing and CPU running reads |
| WR | Speed and Acceleration control movement; Catching improves difficult receptions; Route Running tightens cuts; Awareness improves release reaction and ball tracking |
| OL | Strength, Blocking and Awareness determine pocket protection; Awareness also expands engagement reach |
| DEF | Speed controls pursuit; Strength helps shed blocks and finish tackles; Tackling controls reach and contact; Coverage tightens marking and improves interceptions; Pass Rush sheds blocks faster; Awareness improves reaction and pursuit angles |

Blocking and tackling are deterministic rating contests. Repeated broken tackles become harder so powerful runners are not invulnerable. Passing has bounded dispersion; catches use a skill-versus-difficulty margin with only ±0.02 execution variation, sampled once per pass. Clear catches and clear failures do not flip with a random roll. Kicker accuracy and power modify distance-based odds; punter power affects distance.

`src/data/PlayerData.js` stores persistent data separately from `Player` field state. `src/data/Rosters.js` provides versioned JSON serialization and reconstruction. Ratings survive play resets, audibles and possession swaps; each team keeps its own records. The league snapshot saves club choice and all player records locally; in-progress matches and season management are not yet persisted. See [the rating model and formulas](docs/ratings.md).

## Offensive playbook (Phase 4)

Before every user offensive snap, the selector shows all available calls, the formation, a route diagram and a short read. The full field previews the same routes. The gold path belongs to the running back. Click a call or use **Q/E** while the field has focus to audible, then press **Space** or **Snap Ball**. Your choice persists for the next human down. Audibles cannot change a live play, CPU possession, score, down, field position or either clock. The play clock continues while selecting; Pause freezes it.

| Call | Behavior |
| --- | --- |
| Slants | Short stems followed by diagonal inside cuts |
| Quick outs | Short stems, then sharp sideline breaks and stops |
| Curls | Upfield stems, turn back toward the QB, then settle |
| Posts | Deeper stems followed by inside breaks toward the posts |
| Go routes | Four straight vertical routes |
| Crosses | Bunch formation with shallow routes crossing the middle |
| Screens | Delayed RB release behind scrimmage; linemen release toward the right screen lane |
| Play action | Singleback fake locks passing for 0.9 seconds, moves QB/RB, and precedes deeper routes |
| Inside run | Fast 0.28-second handoff and an interior lane with straight-ahead blocking |
| Outside run | 0.42-second exchange toward the right tackle, then an outside cut |
| Sweep | 0.65-second lateral exchange left with pulling blockers and a wide edge path |
| Draw | Hold the back in pass formation for 0.75 seconds; hand off at 1.1 seconds and release interior blockers |

Run calls exchange automatically; you do not need H. The RB initially follows the drawn lane. Press any movement direction to take over permanently for that play; Shift boosts speed, and J still jukes. Pass calls retain mouse aiming and automatic control transfer on a catch. H remains an optional early handoff on ordinary pass calls. Play action locks handoffs and jukes during its fake. CPU offenses also execute their selected routes/exchanges.

### Adding a play

Add an immutable definition to `src/football/Playbook.js`, with a unique `id`, name, type, formation, description and routes keyed by receiver numbers `08`, `81`, `11`, `19`, `22`. Coordinates are yards ahead of scrimmage and yards from the field center. Formation positions use the same coordinates. New entries automatically appear in the selector, audible cycle and CPU choice pool. Optional `releaseDelay`, `fakeDuration`, `exchange`, `exchangeStart`, `exchangeTime` and `blocking` fields customize execution. Tests assert the current twelve-call catalog; update those expectations when extending it.

## Playing

Your club receives the opening touchback at its own 25. Before each snap, dashed routes show where your receivers will run. The blue line marks scrimmage; the gold line marks the first down or goal line. Wait roughly a second after snapping for receivers to separate, point at a receiver to preview a led pass, and click to throw. Point at open grass for manual targeting. On a catch, control transfers automatically. Run, sprint and juke to gain yards.

Accuracy, pressure and QB movement affect throw dispersion. Difficult/contested catches depend on receiver catching ratings. Defenders cover, rush, pursue, tackle and intercept. The opponent uses those same systems when it has the ball. Both offenses are displayed moving right so the controls and camera remain consistent; possession changes correctly reverse field position in the match rules.

## Match rules

- Four downs to gain ten yards. First downs reset the series. Inside the opponent's ten, the series is goal-to-go; a loss does not move the goal line.
- Four failed downs or an interception switch possession and reverse the yard-line reference. End-zone interceptions are touchbacks; interceptions in the throwing team's own end zone score for the defense. Interception returns are not simulated.
- Touchdowns score six. An untimed extra-point kick follows, worth one. Field goals score three. Safeties score two for the defense and give it the next possession.
- Field-goal distance includes the end zone and a seven-yard hold. Misses give the opponent the kick spot or its own 20, whichever is better for the receiving team. Long kicks have a lower success chance.
- Punts travel 36–51 yards. No returns; a punt into the end zone is a touchback at the 20.
- Kickoffs after scores and at the start of each half are automatic touchbacks at the 25. Safety free kicks also give the receiver its own 25.
- The game clock runs during ordinary live plays and kicks, and continues between in-bounds plays. It stops for incompletions, out-of-bounds plays, possession changes, scores and breaks. It never runs on an extra point.
- The 40-second play clock counts down before the snap and on the result screen. Delay of game costs five yards or half the distance to the goal; the down and line to gain remain unchanged. The play clock resets to 25 after the penalty.
- A live play or kick finishes even if the game clock reaches 0:00. A touchdown's extra point is resolved in the same quarter before the period ends.
- Quarter one/three transitions preserve possession, ball position and downs. Halftime stops both clocks; the opponent receives the second-half kickoff with a fresh series.
- The fourth quarter ends in a final-score screen. Regulation ties stand. New Game clears all scores and returns to setup.

This is an intentionally simplified exhibition ruleset, not a specific league's full rulebook. No overtime, timeouts, two-minute warning, two-point conversions, kick returns, fumbles, penalty catalog or franchise management yet. Out-of-bounds plays always stop the game clock. A 35-second live-play limit prevents endless individual plays.

## Architecture

The original loop, state, field, input, camera, player and render modules remain in place.

- `src/game/MatchRules.js`: clock/quarter state, downs, yard lines, scoring, kicks, turnovers and game end; independent of browser rendering.
- `src/game/MatchController.js`: connects the match to individual plays and handles CPU turns and kick animation.
- `src/game/Opponent.js`: basic CPU play calls and offensive decisions using existing gameplay.
- `src/ui/GameHUD.js`: scoreboard, controls and start/period/halftime/final screens.
- `src/ui/RatingsPanel.js`: read-only team/player inspection with pause-state preservation.
- `src/data/PlayerData.js` / `Rosters.js`: reusable identity, rating validation, independent rosters and JSON round-trips.
- `src/football/RatingEffects.js`: shared rating-to-ability formulas and deterministic contests.
- `src/football/Blocking.js`: timed lineman/rusher engagements.
- `src/ui/PlaybookPanel.js`: generated play buttons and the selected formation/route preview.
- `src/football/Playbook.js`: immutable play and formation definitions, coordinate conversion.
- `src/football/PlayExecution.js`: per-play exchange timing, fake, release delays, run guidance and blocking assignments.
- `src/football/Play.js`: snap-to-whistle gameplay, ratings, possession, catches and tackles; configurable formation at the current yard line.
- `src/football/Routes.js` / `Defense.js`: route following, lead prediction, coverage, rush and pursuit.
- `src/entities/Player.js` / `Football.js`: movement, acceleration, sprint/juke and airborne trajectory.
- `src/world/Field.js` / `Camera.js`: dimensions, following, bounds and world/screen conversion.
- `src/rendering/Renderer.js` / `PlayRenderer.js`: placeholder field/players, routes, markers, goalposts and football.
- `src/core/GameLoop.js` / `GameState.js`: fixed 60 Hz simulation and global pause.
- `src/input/Input.js`: keyboard, mouse and focus handling.
- `src/main.js`: composition and lifecycle.

Rules store yards from the possessing team's own goal. Rendering maps that onto the existing field coordinates. No DOM dependency exists in the match simulation.

## Verification

Run `npm test` for the simulation and match-rules suites. These cover the existing play mechanics plus first downs, losses, goal-to-go, fourth-down turnovers, interceptions, touchdowns/PATs, made/missed field goals, punts/touchbacks, safeties, delay of game, clock stopping/running, quarter transitions, halftime possession, buzzer scores, duplicate-score prevention and frozen final state. A seeded full-match test plays all four quarters using real physics and both teams' AI.

The playbook suite additionally verifies distinct live route trajectories, open-field completions for all passing concepts, all run exchange timings and lanes, the delayed draw, screen blocking, play-action lockout, steering overrides, audibles without clock resets, CPU execution and boundary-safe routes. `tests/browser-playbook.mjs` checks all twelve UI choices, formation previews, keyboard audibles, run handoffs, a mouse screen completion, pause/live/CPU restrictions and desktop/narrow layouts.

The ratings suite compares low/high ratings under identical conditions: speed/acceleration, throw power, accuracy across seeds, awareness, cuts, difficult catches, interceptions, real pocket time, broken tackles and jukes. It also verifies data validation, independent teams, persistent changes and serialization. `tests/browser-ratings.mjs` checks both rosters, every required displayed stat, pause/resume and keyboard focus, plus responsive layouts. The suite includes 67 simulation/data checks and four browser suites. The league checks cover 24 rosters, unique identities, metadata, actual lineup binding, saved snapshots, malformed saves, and specialist abilities.

For browser verification, run `npm install`, keep the server running, and run `npm run test:browser`. Playwright uses installed Microsoft Edge. Checks include actual mouse/keyboard touchdown and PAT, CPU possessions, special teams, penalty UI, pause/focus loss, scoreboard, resizing and passing at four viewport sizes, halftime/final/new-game screens, and zero console/network errors. Full-match browser tests accelerate tick delivery with ten-second test quarters while preserving the real rules and gameplay; isolated scenarios set starting field position for edge-case checks. Screenshots are saved in `test-results/`.
