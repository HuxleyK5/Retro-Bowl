import test from 'node:test';
import assert from 'node:assert/strict';
import { Play } from '../src/football/Play.js';
import { Field } from '../src/world/Field.js';
import { PlayEffects } from '../src/rendering/PlayEffects.js';

function contact({ missed = false, direction = 1 } = {}) {
  const play = new Play(new Field(), () => .99);
  play.snap(); play.handoff();
  const runner = play.rb, defender = play.defenders[0]; play.defenders = [defender];
  Object.assign(runner, { x: 1200, y: 500, vx: 0, vy: 0 });
  runner.setRatings({ strength: missed ? 99 : 1, elusiveness: missed ? 99 : 1, awareness: missed ? 99 : 1 });
  Object.assign(defender, { x: runner.x - direction * 18, y: 500, vx: 0, vy: 0 });
  defender.setRatings({ tackling: missed ? 10 : 99, strength: missed ? 10 : 99, awareness: missed ? 10 : 99 });
  play.ball.attach(runner); play.update(1 / 60);
  return { play, runner, defender };
}

test('real tackles and broken tackles emit one directional defender dive without changing the outcome', () => {
  for (const missed of [false, true]) for (const direction of [-1, 1]) {
    const { play, runner, defender } = contact({ missed, direction });
    const dives = play.events.filter(e => e.type === 'dive');
    assert.equal(dives.length, 1);
    assert.equal(dives[0].team, defender.team);
    assert.equal(dives[0].number, defender.number);
    assert.equal(dives[0].missed, missed);
    assert.ok(Math.sign(dives[0].targetX - dives[0].x) === direction);
    assert.equal(play.result, missed ? '' : 'TACKLED');
    assert.equal(runner.brokenTackles, missed ? 1 : 0);
    const effects = new PlayEffects(); effects.sync(play);
    const initial = effects.reaction(defender);
    assert.equal(initial.facing, direction); assert.equal(initial.diving, true);
    assert.ok(Math.abs(initial.tilt) < .001);
    effects.update(.1, play); effects.update(.1, play);
    const air = effects.reaction(defender);
    assert.ok(Math.abs(air.tilt) > .7 && air.lift > 5, 'defender pitches forward and leaves the ground');
    assert.ok(Math.sign(air.offsetX) === direction, 'lunge moves toward contact');
    effects.update(.1, play); effects.update(.1, play);
    const landed = effects.reaction(defender);
    assert.ok(Math.abs(landed.tilt) > 1.3 && landed.lift < .001, 'defender lands horizontally');
    assert.equal(play.result, missed ? '' : 'TACKLED');
    const ages = effects.effects.map(e => e.age); effects.sync(play); effects.sync(play);
    assert.deepEqual(effects.effects.map(e => e.age), ages, 'redraws never restart or advance a dive');
    for (let i = 0; i < 6; i++) effects.update(.1, play);
    assert.equal(effects.reaction(defender), null, 'pose recovers after landing');
    play.reset(); effects.sync(play);
    assert.equal(effects.effects.length, 0, 'new downs remove old dives');
  }
});

test('reduced motion keeps tackle feedback without diving motion', () => {
  const { play, defender } = contact();
  const effects = new PlayEffects(); effects.reducedMotion = true; effects.update(.1, play);
  assert.equal(effects.reaction(defender), null);
  assert.ok(effects.effects.some(e => e.type === 'tackle'));
});
