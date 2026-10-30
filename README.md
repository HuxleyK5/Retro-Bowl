# Pocket Field — Phase 6

A retro football franchise game with complete four-quarter matches and a twelve-play offensive playbook. Build one of 32 NFL teams across multiple seasons, manage generated player careers and contracts, and chase the championship. You control your club's offense; opponents use the same passing, catching, running and defensive AI.

## Run

To play from another computer on the same network, keep `npm start` running on this computer and open the network address printed in the terminal (for example, `http://10.1.1.164:5173`) on the other computer. The server listens on port 5173 on all IPv4 interfaces. Each browser keeps its own saved franchise.

Run `npm start` and open http://localhost:5173. Node.js is required. There are no runtime dependencies or build steps. Choose a club and click **Start Franchise** to enter the opening draft. Make your two rookie picks and click **Start Season** (unused picks are chosen automatically). Then choose **Play Game**, select a quarter length, and click **Start Game**. **Franchise Hub** opens management before kickoff or pauses an ongoing game. **Continue Saved Club** restores your franchise, including a draft in progress.

## Idle exhibition

After 45 seconds without keyboard, pointer, or scroll activity, a full-screen CPU-versus-CPU exhibition starts automatically. Both teams play, kick, and continue through all four quarters; another matchup follows the final score. Move the mouse, tap, scroll, or press any key to return. That first input only dismisses the exhibition. Your franchise, draft, and current game stay where you left them, including a paused game. Exhibitions use separate rosters and never write to your save.

## Beginner help

**Beginner help** is on by default and remembers your choice in this browser. The **How to play** guide explains scoring, four tries to gain ten yards, passing, and running. During a game, the coach explains your next step and suggests a play or kick. Start with **Short pass**, **Run through the middle**, or **Long pass**; **More plays** and **More football options** reveal the full controls. You can turn Beginner help off at any time without restarting your game.

Team and draft screens explain player positions, star ratings, and the annual spending limit. Detailed league tables, player ratings, contracts, and trades remain available in expandable sections. Beginner help changes the interface and instructions; the same match rules and player abilities apply.

## NFL teams

Choose from all 32 NFL teams, with their cities, names, abbreviations, team colors, home stadiums, conferences and divisions. Player names, ratings, contracts and careers are generated for the game; these are not current NFL player rosters. Select any club to see its full roster, overall ratings, ages, potential, annual salaries, remaining contract years, and guaranteed money. Actual club names, uniforms, stadium labels, player names, ratings, and special-team specialists carry into the game. The next club in league order is the opening opponent.

Each initial 53-player roster has 3 QB, 4 RB, 6 WR, 3 TE, 9 OL, 8 DL, 7 LB, 10 DB, a kicker, a punter, and a long snapper. All 1,696 players have distinct rating profiles and position strengths. `position` is the rating/gameplay group; `specialty` is the depth position (TE uses WR ratings, DL/LB/DB use DEF, LS uses OL). The arcade field lineup remains 11 offensive and 8 defensive entities, selected from healthy depth using effective abilities. Fatigue lowers actual movement and execution ratings without changing permanent skills.

- `src/data/League.js`: club catalog and deterministic full roster generation.
- `src/data/PlayerData.js`: validated persistent player records; optional metadata defaults preserve older records.
- `src/data/Franchise.js`: versioned browser snapshot, validation, and safe recovery from corrupt or unavailable storage.
- `src/ui/TeamSelection.js`: club picker and complete roster preview.

**Continue Saved Club** restores season progress, player careers, transactions, markets, and championship history. **Start Franchise** starts fresh and replaces the saved franchise. **League / New Franchise** returns to selection. Unfinished matches restart at kickoff after a reload; completed results are saved once, including all CPU games that week. Older roster-only saves migrate into a new season, and malformed saves recover safely. Existing 24-team saves keep their current season and player progress, use NFL team identities, and expand to all 32 teams when the next season starts.

## Franchise mode

The **Overview** shows the 12-week schedule, all 32 NFL teams' standings, results, championship history, and an eight-team playoff bracket. Play your game or simulate the full week. Wins, losses and ties determine seeds, followed by head-to-head results, point differential, points scored, and club ID. Playoff winners advance through quarterfinals, semifinals and a championship. Tied playoff games resolve in simulated overtime; regular-season ties stand.

The **Roster** shows ratings, strengths, potential, age, fatigue, injuries and contracts. Train a player once per week in a position skill or balanced development; training raises a rating and adds fatigue. Starters earn experience through games, and experience improves skills toward potential. Use the weekly team recovery session to reduce fatigue. Injuries keep players out for one or more games, healthy backups take over automatically, and minimum-salary emergency players fill necessary depth when cap space permits. Players develop, age, decline and retire in the offseason.

The **Market & trades** tab offers free agents, player-for-player trades, contract renewals and releases. Salary quotes appear before signing. Both clubs must keep playable depth and fit under the salary cap; CPU clubs can decline uneven trades. The starting cap is **$260M**, increasing $5M per season. Guaranteed contracts can leave dead money after release. Rosters can hold up to 75 players, and an over-cap team must clear room before playing. CPU clubs renew useful players and acquire replacements over successive seasons.

Every season begins with a two-round rookie **Draft**, including the first season of a new franchise. The blue draft screen shows ten player cards per page, with original pixel portraits, position names, stars and yearly prices. Use the page arrows to browse. Select a card to see the player's role and full three-year cost, then press **Draft Player** to confirm. Selecting or browsing cards never spends a pick. The budget bar and picks counter update after each signing; unaffordable signings are disabled. **My Team** opens your roster, and **Auto-pick & Start** chooses any remaining players for you. Stars measure current ability: 50 overall earns one star, every five overall adds half a star, and 90+ earns five stars. The opening draft gives your club the first pick; later drafts follow reverse regular-season standings, with CPU clubs selecting between your picks.

After the championship, contracts lose a year and expiring players enter free agency, then the next season's draft opens automatically. **Start Season** resets standings while preserving rosters and championship history. Confirmed draft picks autosave. Roster moves and week advancement are locked during an unfinished match; the hub can still be browsed and the game resumed.

- `src/data/FranchiseMode.js`: schedule, standings, playoffs, transactions, cap, CPU roster management and offseason.
- `src/data/PlayerLifecycle.js`: healthy depth, fatigue, training, experience, injuries, development and aging.
- `src/ui/FranchisePanel.js` / `franchise.css`: responsive management hub with keyboard-accessible tabs.
- `tests/franchise.test.mjs`, `tests/lifecycle.test.mjs`, `tests/browser-franchise.mjs`: domain, persistence, live lineup and full season browser checks.

## Matchday presentation

The field sits inside a club-colored stadium with animated supporters, sideline substitutes, benches, chain crew and floodlights. The **LIGHTING** selector defaults to a gradual day-to-dusk-to-night transition across the four quarters; choose Day, Dusk or Night to hold the lighting. **WEATHER** switches between clear skies, rain and snow. These settings affect presentation only.

Home shirts use club colors and away shirts use white with club trim. Outlined sprites, readable receiver numbers, a **YOU** marker, ball-carrier rings, bright yard lines and separate club end zones keep the action easy to follow. Touchdowns trigger a score band, confetti and a jumping celebration. Interceptions, defensive recoveries, fourth-down turnovers, fumbles and forceful hits have distinct feedback.

Click **SOUND OFF** to enable locally synthesized stadium sound: crowd ambience and reactions, snap/pass/catch cues, impacts, whistles, kicking and a touchdown fanfare. Sound starts muted and requires a browser gesture. Pause freezes weather, lighting and celebrations and silences audio; new games clear old cues. Reduced-motion preferences replace confetti and jumps with static feedback and keep precipitation still. No external audio or image downloads are required.

Run `node tests/browser-presentation.mjs` with the server running for presentation checks, including actual audio activation/suspension, weather and lighting rendering, touchdown/turnover effects, paused animation and desktop/mobile layouts.

## Controls

| Input | Action |
| --- | --- |
| Space / contextual button | Snap, continue after a play, or kick the extra point |
| Play buttons / Q and E | Choose a play or cycle audibles before the snap |
| 0 / 1 / 2 / 3 | Manual aim / short / medium / deep passing depth |
| M | Cycle receiver motion before the snap |
| T / Timeout button | Spend one of three timeouts per half to stop the clock between scrimmage plays |
| Roster / Ratings button | Inspect both teams; pauses the game and restores the previous pause state on close |
| Mouse + left click | Hold, pull opposite your intended throw, then release behind the blue line of scrimmage |
| WASD / arrow keys | Move QB or ball carrier |
| Shift | Sprint |
| J + direction | Juke; duration and cooldown depend on elusiveness and awareness (J alone dodges upward) |
| H | Hand off to the nearby running back within 1.8 seconds of the snap |
| F / Field Goal button | Open the field-goal meter before the snap; distance is shown |
| K / Punt button | Punt before the snap |
| Escape / P / Pause button | Pause or resume the game and both clocks |
| R | Continue after a whistle; cannot erase or replay an active down |

Click the field to focus keyboard controls. Window focus loss and hidden tabs pause automatically. CPU possessions run automatically; movement and play calls cannot control the opponent. Quarter breaks and halftime wait for your confirmation.

## Player ratings (Phase 5)

Every player has a stable ID, name, jersey number, team, position and validated **1–99 ratings**. The league contains 32 complete 53-player rosters; the active matchup uses those persistent player records. Open **Roster / Ratings** in the control bar to inspect the ratings for each position and derived movement or arm abilities. Inspection pauses both clocks and live action. Overall is a display-only average; individual ratings drive gameplay.

| Position | Ratings and gameplay effects |
| --- | --- |
| QB | Throw Power controls range and flight speed; Accuracy controls dispersion; Speed controls movement; Awareness improves pressure handling, lead prediction and CPU reads |
| RB | Speed and Acceleration control movement; Strength resists tackles; Elusiveness improves timed jukes; Awareness improves juke timing and CPU running reads |
| WR | Speed and Acceleration control movement; Catching improves difficult receptions; Route Running tightens cuts; Awareness improves release reaction and ball tracking |
| OL | Strength, Blocking and Awareness determine pocket protection; Awareness also expands engagement reach |
| DEF | Speed controls pursuit; Strength helps shed blocks and finish tackles; Tackling controls reach and contact; Coverage tightens marking and improves interceptions; Pass Rush sheds blocks faster; Awareness improves reaction and pursuit angles |

Blocking and tackling are deterministic rating contests. Repeated broken tackles become harder so powerful runners are not invulnerable. Passing has bounded dispersion; catches use a skill-versus-difficulty margin with only ±0.02 execution variation, sampled once per pass. Clear catches and clear failures do not flip with a random roll. Human kicks use power and accuracy timing, with specialist ratings affecting distance and the accuracy window. CPU field goals and extra points retain distance-based odds.

`src/data/PlayerData.js` stores persistent data separately from `Player` field state. `src/data/Rosters.js` provides versioned JSON serialization and reconstruction. Ratings survive play resets, audibles and possession swaps; each team keeps its own records. The franchise save stores seasons and all player records locally; unfinished match state is not persisted. See [the rating model and formulas](docs/ratings.md).

## Offensive playbook (Phase 4)

Before every user offensive snap, the selector shows all available calls, the formation, a route diagram and a short read. The full field previews the same routes. The gold path belongs to the running back. Click a call or use **Q/E** while the field has focus to audible, then press **Space** or **Snap Ball**. Your choice persists for the next human down. Audibles cannot change a live play, CPU possession, score, down, field position or either clock. The play clock continues while selecting; Pause freezes it.

The **Sideline / Play Calling** panel adds formation overrides, lateral motion, defensive calls, passing depths and clock management. Choose Shotgun spread, Bunch right, Singleback tight or Offset left independently of the play, or keep its default formation. Routes move with the receiver alignments. Motion sends the slot receiver behind scrimmage toward either sideline; snap at any point to release from the actual moving position. Man defenders follow motion while zone defenders hold their landmarks. Formation changes, motion and audibles preserve the score, down, field position and both clocks.

On CPU possessions, choose **Man**, **Cover 2**, **Cover 3** or **Blitz**, then use Balanced, Press, Cushion or Load the box. Calls lock at the snap. Zone defenders pass crossing receivers between lanes and protect their assigned depths. A blitz sends four actual rushers and leaves the back outlet open. Press disrupts nearby releases but can be beaten deep; cushion concedes short space; loading the box brings a safety toward the run and gives up deep help. The CPU chooses its defense from down, distance, field position and score, and its offense considers coverage and conversion distance. The panel explains the current matchup.

| Defensive look | Opportunities and tradeoffs |
| --- | --- |
| Man | Slants and crosses force trailing defenders to turn; deep middle help remains |
| Cover 2 | Posts can split the safeties; flat zones contest quick sideline throws |
| Cover 3 | Curls, outs and crosses can find underneath space; three deep defenders contain vertical routes |
| Blitz | Quick throws, screens and the back outlet exploit fewer cover defenders; deep calls need protection |

**Short**, **Medium** and **Deep** lock the aim point to 5, 14 and 28 yards beyond scrimmage. Move the mouse across the field to choose the lane; the dotted preview uses the same selected depth as the released pass. QB range, pressure, accuracy, receiver timing and coverage still matter. **Manual aim / 0** retains full pull distance and direction. Depth can change before the snap or while the QB can still throw; a released pass cannot be redirected.

Each club has **three timeouts per half**, shown beside down, distance and field position. A timeout stops the game clock and gives a 25-second play clock; it cannot interrupt a live play, kick, scoring sequence or break. Timeouts carry between quarters within a half and reset at halftime. **Spike** consumes a down and two seconds to stop the clock; **Kneel** consumes a down and one yard while keeping it running, including fourth-down turnover and own-end-zone safety risks.

**Hurry-up** lines up automatically 0.35 seconds after an ordinary whistle, leaving the snap to you. **Chew clock** advances both running clocks at six times speed between plays until five seconds remain on the play clock; live football stays at normal speed. CPU coaches use their own charged timeouts, hurry when behind late, and run the clock or kneel when protecting a lead. Pause freezes motion, action and both clocks.

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

Your club returns the opening kickoff before its first offensive drive. Before each snap, dashed routes show where your receivers will run. The blue line marks scrimmage; the gold line marks the first down or goal line. Watch the route develop, hold the mouse and pull opposite the intended throw direction. Use the dotted arc to aim ahead of a receiver, then release. Quick outs open early; curls and slants reward throwing after the break; deep routes need time and an open pocket. The aiming guide turns green, gold or red to show an open, contested or tight landing window. On a catch, control transfers automatically. Run, sprint and juke to gain yards.

Accuracy, pressure and QB movement affect throw dispersion. Receivers sell their release, plant at route breaks and track a nearby descending pass. Difficult/contested catches depend on catching ratings and defensive leverage; defenders can intercept a reachable pass before it lands. Coverage reacts to observed movement with an awareness delay, while deep help protects the middle and pursuit aims to cut runners off. The opponent reads the same passing windows. Both offenses are displayed moving right so the controls and camera remain consistent; possession changes correctly reverse field position in the match rules.

Hard tackles can cause fumbles. Ball security depends on Awareness, Strength and Catching; fast side hits increase the risk. The loose ball bounces and rolls while both teams race to recover it. WASD or arrows steer your player during the scramble. An offensive recovery restores control and the run continues; a defensive recovery changes possession. Sideline fumbles cannot advance the original loss spot, and end-zone losses resolve as safeties, defensive scores or touchbacks. Catches, hits, jukes, recoveries and big plays have brief on-field feedback that freezes when paused and respects reduced-motion settings.

## Match rules

- Four downs to gain ten yards. First downs reset the series. Inside the opponent's ten, the series is goal-to-go; a loss does not move the goal line.
- Four failed downs or an interception switch possession and reverse the yard-line reference. End-zone interceptions are touchbacks; interceptions in the throwing team's own end zone score for the defense. Interception returns are not simulated.
- Touchdowns score six. An untimed extra-point kick follows, worth one. Field goals score three. Safeties score two for the defense and give it the next possession.
- Field-goal distance includes the end zone and a seven-yard hold. Misses give the opponent the kick spot or its own 20, whichever is better for the receiving team. Long kicks require more power and tighter accuracy timing.
- Punt distance depends on power timing, accuracy, and punter ratings. Punt returns are not simulated; a punt into the end zone is a touchback at the 20.
- Kickoffs at the start of each half, after scores, and following safeties enter a return phase. A kickoff reaching the end zone is an automatic touchback at the 25. In-field kicks are caught by the returner; the game clock starts at the catch.
- The game clock runs during ordinary live plays and kicks, and continues between in-bounds plays. It stops for incompletions, out-of-bounds plays, possession changes, scores and breaks. It never runs on an extra point.
- The 40-second play clock counts down before the snap and on the result screen. Delay of game costs five yards or half the distance to the goal; the down and line to gain remain unchanged. The play clock resets to 25 after the penalty.
- A live play or kick finishes even if the game clock reaches 0:00. A touchdown's extra point is resolved in the same quarter before the period ends.
- Quarter one/three transitions preserve possession, ball position and downs. Halftime stops both clocks; the opponent receives the second-half kickoff with a fresh series.
- The fourth quarter ends in a final-score screen and records the franchise result. Regular-season ties stand; a tied playoff game resolves in simulated overtime. Return to the hub to prepare for the next scheduled game.

This is an intentionally simplified match ruleset, not a specific league's full rulebook. Playable overtime, two-minute warnings, two-point conversions, punt returns and a full penalty catalog are not included. Out-of-bounds plays always stop the game clock. A 35-second live-play limit prevents endless individual plays.

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
- `src/ui/StrategyPanel.js` / `strategy.css`: formations, motion, depth, defensive calls, matchup reads and clock controls.
- `src/football/Tactics.js`: defensive responsibilities, alignments, situational coverage selection and passing-depth targets.
- `src/game/ClockStrategy.js`: CPU timeout and tempo decisions using the same match clocks and timeout limits.
- `src/football/Playbook.js`: immutable play and formation definitions, coordinate conversion.
- `src/football/PlayExecution.js`: per-play exchange timing, fake, release delays, run guidance and blocking assignments.
- `src/football/Play.js`: snap-to-whistle gameplay, ratings, possession, catches and tackles; configurable formation at the current yard line.
- `src/football/Routes.js` / `Defense.js`: route following, lead prediction, coverage, rush and pursuit.
- `src/entities/Player.js` / `Football.js`: movement, acceleration, sprint/juke and airborne trajectory.
- `src/world/Field.js` / `Camera.js`: dimensions, following, bounds and world/screen conversion.
- `src/rendering/Renderer.js` / `PlayRenderer.js`: club field, readable uniforms, routes, markers, goalposts and football.
- `src/rendering/Stadium.js` / `PlayEffects.js`: cached crowds, weather, lighting and event animations, advanced only with simulation time.
- `src/audio/StadiumAudio.js`: browser-gesture audio activation, procedural effects/crowd, touchdown music and pause/mute cleanup.
- `src/core/GameLoop.js` / `GameState.js`: fixed 60 Hz simulation and global pause.
- `src/input/Input.js`: keyboard, mouse and focus handling.
- `src/main.js`: composition and lifecycle.

Rules store yards from the possessing team's own goal. Rendering maps that onto the existing field coordinates. No DOM dependency exists in the match simulation.

## Verification

Run `npm test` for the simulation and match-rules suites. These cover the existing play mechanics plus first downs, losses, goal-to-go, fourth-down turnovers, interceptions, touchdowns/PATs, made/missed field goals, punts/touchbacks, safeties, delay of game, clock stopping/running, quarter transitions, halftime possession, buzzer scores, duplicate-score prevention and frozen final state. A seeded full-match test plays all four quarters using real physics and both teams' AI.

The playbook suite additionally verifies distinct live route trajectories, open-field completions for all passing concepts, all run exchange timings and lanes, the delayed draw, screen blocking, play-action lockout, steering overrides, audibles without clock resets, CPU execution and boundary-safe routes. `tests/browser-playbook.mjs` checks all twelve UI choices, formation previews, keyboard audibles, run handoffs, a mouse screen completion, pause/live/CPU restrictions and desktop/narrow layouts.

The ratings suite compares low/high ratings under identical conditions: speed/acceleration, throw power, accuracy across seeds, awareness, cuts, difficult catches, interceptions, real pocket time, broken tackles and jukes. It also verifies data validation, independent teams, persistent changes and serialization. `tests/browser-ratings.mjs` checks both rosters, every required displayed stat, pause/resume and keyboard focus, plus responsive layouts. The suites include simulation/data checks and ten browser suites. Gameplay checks cover route windows, pursuit angles, contested catches, loose-ball physics, both recovery sides and fumble scoring. Franchise checks cover season progression, playoff seeding, championships, contracts, draft, cap enforcement, aging, fatigue, injuries, CPU roster continuity and saved-state validation.

The tactics, clock and strategy-controller suites verify actual pocket pressure, coverage handoffs and route windows, continuous exchanges in all formations, motion releases, range-limited throw depths, charged timeouts, halftime resets, spikes/kneels, and CPU clock decisions. `tests/browser-strategy.mjs` verifies the same choices through the actual UI, mouse pass previews and releases, keyboard controls, paused clocks, and all match phases from 320 to 1440 pixels wide.

For browser verification, run `npm install`, keep the server running, and run `npm run test:browser`. Playwright uses installed Microsoft Edge. Checks include actual mouse/keyboard touchdown and PAT, CPU possessions, special teams, penalty UI, pause/focus loss, scoreboard, resizing and passing at four viewport sizes, halftime/final/next-game screens, and zero console/network errors. Full-match browser tests accelerate tick delivery with ten-second test quarters while preserving the real rules and gameplay; isolated scenarios set starting field position for edge-case checks. The franchise browser suite exercises management, autosave/reload, injuries in the live lineup, a complete season, the playoffs, the draft and year two. Screenshots are saved in `test-results/`.

Passing: hold the left mouse button anywhere on the field after the snap, pull back, and release. A longer pull adds distance (full power at 180 screen pixels). Dots preview the flight arc and a ring marks the landing point. Aim ahead of moving receivers; QB accuracy still adds dispersion. Tiny clicks do not throw. Pause, focus loss, or window resizing cancels the gesture.

After a reception, the ball carrier automatically runs toward the right end zone. WASD or arrows override the direction while held; releasing them resumes forward running. Shift still sprints and J still jukes. Auto-run ends at the whistle and resets before the next play.

The catch immediately sets forward running velocity, including on curls and crossing routes. Movement keys already held at the catch are ignored until released; press a direction again to steer. Computer-controlled runners continue using their normal pursuit-avoidance AI.

Starting a mouse pull on the field now snaps your selected play automatically. Keep holding to aim, then release to throw. Space still snaps. Run calls execute their handoff; play-action throws unlock after the fake.

## Kicking meters and kickoff returns

Choose **F** for a field goal, **K** for a punt, or **Space** for an extra point. Press **Space** (or click the meter button) to lock power, then press again when the needle crosses the center line to kick straight. More power means more distance. Each stage allows five seconds; letting it expire produces a weak or inaccurate kick. Pause freezes the meter and both clocks. Human kick results use timing and player attributes rather than a random roll.

After a successful field goal or any extra-point attempt, continue to the kickoff. Your team's kickoffs also use the meter. Short kicks allow returns; deep kicks reaching the end zone produce touchbacks. Opening and CPU kickoffs are automatic. The returner catches and runs immediately; **WASD/arrows** steer, **Shift** sprints, and **J** jukes. A tackle or sideline exit sets up first down at the return spot; a return touchdown scores six and leads to a PAT. CPU returns use the existing runner AI. Punt returns, onside kicks, fair catches and selectable end-zone returns are not included.

`KickMeter.js` holds timing and kick formulas; `KickoffReturn.js` manages the kick flight and return setup; `KickMeterPanel.js` draws the timing controls. Tests cover meters, missed/made kicks, opening/halftime/scoring kickoffs, return outcomes, touchbacks, quarter-end scoring, and actual browser controls.

Team metadata references: [NFL team directory](https://www.nfl.com/teams/), [Houston Texans stadium](https://www.houstontexans.com/stadium/), [Kansas City Chiefs schedule](https://www.chiefs.com/schedule/), [Washington Commanders stadium](https://www.commanders.com/stadium/game-day).
