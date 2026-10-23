import assert from 'node:assert/strict';
import { MatchRules } from '../src/game/MatchRules.js';
import { BEGINNER_PLAYS, getBeginnerGuide, recommendBeginnerAction } from '../src/game/BeginnerGuide.js';

const rules = new MatchRules(() => .5);
rules.start(120);
const match = { rules, play: { phase: 'presnap', coverage: 'man', defensiveAdjustment: 'balanced' } };
const before = JSON.stringify(rules);
let guide = getBeginnerGuide(match);
assert.equal(guide.goal, 'Gain 10 yards to the yellow line. Try 1 of 4.');
assert.match(guide.tip, /four new tries/);
assert.ok(BEGINNER_PLAYS.includes(guide.suggestedPlayId));
assert.equal(JSON.stringify(rules), before, 'Guidance must not change the match or select a play');

rules.down = 4;
guide = getBeginnerGuide(match);
assert.match(guide.tip, /Last try/);
assert.equal(guide.suggestedAction, 'punt', 'Fourth and long outside sensible scoring range should explain punting');
assert.match(guide.recommendation, /give up the ball/i);
rules.spot = 78; rules.firstDownLine = 85;
assert.equal(recommendBeginnerAction(rules).action, 'fieldGoal');
assert.match(getBeginnerGuide(match).recommendation, /3 points/);

rules.quarter = 4; rules.clock = 15; rules.score = { home: 0, away: 7 };
assert.equal(recommendBeginnerAction(rules).action, 'play', 'Do not advise a kick worth 3 when a touchdown is needed late');
rules.spot = 25; rules.firstDownLine = 35;
assert.equal(recommendBeginnerAction(rules).action, 'play', 'Do not advise giving up the ball when trailing late');
rules.score = { home: 7, away: 0 };
assert.equal(recommendBeginnerAction(rules).action, 'punt', 'A late lead does not prevent the fourth-down punt suggestion');

rules.down = 2; rules.spot = 96; rules.firstDownLine = 100;
guide = getBeginnerGuide(match);
assert.equal(guide.goal, 'Gain 4 yards to the end zone. Try 2 of 4.');
assert.match(guide.tip, /touchdown worth 6 points/);

rules.phase = 'live'; match.play.phase = 'passing'; match.play.canThrow = true;
assert.match(getBeginnerGuide(match).tip, /opposite the throw direction/);
match.play.canThrow = false; match.play.call = { type: 'run' };
assert.match(getBeginnerGuide(match).tip, /handed to the runner automatically/);
match.play.phase = 'flight';
assert.match(getBeginnerGuide(match).tip, /Catching happens automatically/);
match.play.phase = 'loose';
assert.match(getBeginnerGuide(match).tip, /recover it/);

rules.possession = 'away'; rules.phase = 'ready';
assert.match(getBeginnerGuide(match).tip, /defense plays automatically/);
rules.phase = 'result'; rules.result = 'FIRST DOWN';
assert.match(getBeginnerGuide(match).tip, /^The other team reached/);
rules.result = 'TURNOVER ON DOWNS';
assert.match(getBeginnerGuide(match).tip, /four tries/);
rules.result = 'INTERCEPTION';
assert.match(getBeginnerGuide(match).tip, /defender caught/);
rules.possession = 'home';
assert.match(getBeginnerGuide(match).tip, /Your team now has the ball/);
rules.next = 'extraPoint'; rules.result = 'INTERCEPTION · DEFENSIVE TOUCHDOWN';
assert.match(getBeginnerGuide(match).tip, /Your team scored 6 points/);
rules.next = null;

rules.phase = 'extraPoint'; rules.possession = 'home';
assert.match(getBeginnerGuide(match).tip, /adds 1 point/);
rules.phase = 'kickMeter'; match.meter = { kind: 'fieldGoal', stage: 'power' };
assert.match(getBeginnerGuide(match).goal, /3 points/);
assert.match(getBeginnerGuide(match).tip, /Step 1 of 2.*right edge/);
match.meter.stage = 'accuracy';
assert.match(getBeginnerGuide(match).tip, /Step 2 of 2.*center/);
console.log('PASS: beginner down/distance, goal line, four tries, safe fourth-down suggestions, late scoring needs, possession, real controls, kicking and immutable match rules.');
