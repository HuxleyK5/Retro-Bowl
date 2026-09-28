# Player data and rating effects

All ratings are integers from 1 to 99. Finite numeric inputs are rounded and clamped; nonnumeric/nonfinite values and unknown keys are rejected. Partial updates are validated before being applied. Rating maps are frozen; use `setRatings` to update them. Higher is always better for the relevant ability. No overall-score multiplier affects gameplay.

## Persistent data

`PlayerData` contains `schemaVersion`, `id`, `name`, `number`, `position`, `teamId`, and `ratings`. Its JSON representation has no coordinates, velocities, route progress, timers or DOM objects. `Player` is a temporary on-field entity that references a record. Persistent player IDs and jersey numbers are independent of playbook lineup slots.

Every record includes the full set of ratings, with position-specific defaults and primary ratings shown in the inspector. Supporting ratings allow a running back to catch, a quarterback to accelerate, and a lineman to move without separate incompatible models. The inspector shows the requested primary attributes for each position. Defense uses Coverage and Awareness for interception hands. Overall is the rounded average of the position's primary attributes.

```js
import { PlayerData } from './src/data/PlayerData.js';
import { createRosters, serializeRosters, deserializeRosters } from './src/data/Rosters.js';

const qb = new PlayerData({
  id: 'player-unique-001', name: 'Eli Mercer', number: '01',
  position: 'QB', teamId: 'home',
  ratings: { throwPower: 80, accuracy: 88, speed: 55, awareness: 84 },
});
qb.setRatings({ accuracy: 91 });
const samePlayer = PlayerData.fromJSON(JSON.stringify(qb));

const rosters = createRosters();
rosters.home[0].setRatings({ throwPower: 90 });
const json = serializeRosters(rosters);
const restored = deserializeRosters(json);
// new Play(field, random, restored) uses these exact records.
```

Team IDs and player IDs must match when loading a roster; duplicate IDs are rejected. Current lineup binding uses roster order within each position (1 QB, 1 RB, 4 WR, 5 OL, 8 DEF). A future franchise system can retain records and change lineup selection independently. Persistence to disk/local storage, development, contracts, aging and transactions are outside this phase.

## Movement and route running

The world uses 20 pixels per yard. Running speed is `90 + Speed` pixels/second; sprint multiplies by 1.5. Acceleration is `340 + 2 × Speed + 3.2 × Acceleration` pixels/second². Thus faster players also start faster, while the Acceleration rating separately improves time to top speed. Input remains immediate and directional movement stays normalized by the input system.

On routes, steering acceleration is multiplied by `0.45 + 0.007 × Route Running`. Higher route running allows sharper direction changes and less overshoot. Waypoint tolerance is `6 + (99 − Route Running) × 0.25` pixels: low-rated players round their breaks earlier. Awareness adds `(99 − Awareness) × 0.0015` seconds of release reaction, on top of a play's scripted delay. Led throws predict using the same rated acceleration and cuts as actual route movement, without mutating the receiver.

## Passing and receiving

- Maximum throw distance: `500 + 7 × Throw Power` pixels.
- Ball speed: `400 + 2.5 × Throw Power` pixels/second.
- Base dispersion: `(1 − Accuracy / 100) × (12 + distance × 0.14)` pixels.
- Movement adds 10 pixels, pressure adds 15, each reduced by `1 − Awareness × 0.007`.
- The final error magnitude is 85–100% of this budget in a sampled direction. A high-rated QB has consistently less error than a low-rated QB across seeds; a lucky roll cannot eliminate the low-rated QB's error budget.
- Awareness improves lead prediction from 86.14% to 99.86% of the anticipated flight time. For CPU QBs it also speeds the decision and increases the number of receivers read before choosing the most open available target.

Catch margin is based on Catching and Awareness, minus reach/stretch, nearby coverage and long-throw difficulty. Interception hands use 75% Coverage / 25% Awareness instead of Catching. A single shared execution adjustment in `[-0.02, +0.02)` is sampled at release and used for the whole pass. Nonnegative margins catch; negative margins drop. A failed attempt cannot be rerolled every frame. Comfortable catches are reliable; unreachable balls cannot be caught regardless of ratings. Ball position and user aim still matter.

## Protection and defense

Block skill is `0.55 × Blocking + 0.30 × Strength + 0.15 × Awareness`. Rush skill is `0.50 × Pass Rush + 0.30 × Strength + 0.20 × Awareness`. An engagement lasts `2.2 + (block skill − rush skill) × 0.035` seconds, clamped to 0.35–4.5. Higher-awareness linemen engage over a wider radius. Each defender/blocker pair has one timed engagement per play, preventing an expired block from restarting every frame.

Coverage reduces the defender's trailing and lateral cushion. Awareness reduces pass-read delay (`0.65 − 0.0045 × Awareness` seconds), expands the pass reaction radius, reduces susceptibility to the play-action fake and increases velocity-based pursuit anticipation. Defensive Speed uses the same movement formula as offense.

## Contact, strength and jukes

Tackle skill combines 60% Tackling, 25% Strength and 15% Awareness. Tackling also sets contact reach (`20 + 0.12 × Tackling` pixels). Runner resistance combines 55% Strength, 30% Elusiveness, 15% Awareness and a small momentum bonus. To break contact, resistance must exceed tackle skill plus 25. Each successful broken tackle subtracts 18 from future resistance that play and reduces the runner's current momentum. No tackle coin flip is used.

A well-timed active juke compares Elusiveness, Awareness and Strength against tackle skill. Better defenders can stop poor jukes. Elusiveness increases the effective dodge radius; it and Awareness extend the active window and shorten cooldown. Awareness also lets CPU carriers identify nearby threats earlier. User steering never depends on an AI reaction delay.

Formula definitions live in `src/football/RatingEffects.js`; live comparisons and serialization checks live in `tests/ratings.test.mjs`.
