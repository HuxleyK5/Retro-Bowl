import test from 'node:test';
import assert from 'node:assert/strict';
import { getPlay, PLAYBOOK } from '../src/football/Playbook.js';
import { PLAY_PROFILES, assessPlay, recommendPlays } from '../src/football/PlayRecommendations.js';

const rules = (overrides = {}) => ({ down: 1, yardsToGo: 10, spot: 25, quarter: 1, clock: 120, quarterSeconds: 120, possession: 'home', score: { home: 0, away: 0 }, ...overrides });
const score = (id, situation, coverage, adjustment) => assessPlay(getPlay(id), rules(situation), coverage, adjustment).score;

test('every recommendation has an eligible primary route and stable, descriptive metadata', () => {
  for (const call of PLAYBOOK) {
    assert.ok(call.routes[PLAY_PROFILES[call.id].primarySlot]);
    assert.ok(PLAY_PROFILES[call.id].strength.length > 25);
    assert.ok(Object.isFrozen(PLAY_PROFILES[call.id]));
  }
  const before = rules();
  assert.deepEqual(recommendPlays(before), recommendPlays(before));
  assert.equal(recommendPlays(before).length, 3);
  assert.equal(new Set(recommendPlays(before).map(play => play.id)).size, 3);
  assert.equal(before.yardsToGo, 10);
});

test('short yardage improves an immediate interior exchange while long yardage favors deeper stems', () => {
  assert.ok(score('inside', { yardsToGo: 2 }, 'man') > score('inside', { yardsToGo: 16 }, 'man'));
  assert.ok(recommendPlays(rules({ yardsToGo: 2 }), 'man').some(play => play.id === 'inside'));
  assert.ok(score('posts', { down: 3, yardsToGo: 16 }, 'cover2') > score('outs', { down: 3, yardsToGo: 16 }, 'cover2'));
  assert.match(assessPlay(getPlay('posts'), rules({ down: 3, yardsToGo: 16 }), 'cover2').reasons.join(' '), /16 yards|late down/);
});

test('coverage reads favor quick blitz answers, underneath zone breaks and a deep Cover 2 split', () => {
  assert.ok(recommendPlays(rules({ yardsToGo: 5 }), 'blitz').some(play => play.id === 'screen'));
  assert.ok(score('screen', {}, 'blitz') > score('go', {}, 'blitz'));
  assert.ok(score('curls', {}, 'cover3') > score('go', {}, 'cover3'));
  assert.ok(score('posts', {}, 'cover2') > score('posts', {}, 'cover3'));
  assert.ok(score('crosses', {}, 'man') > score('crosses', {}, 'cover2'));
});

test('actual alignment tradeoffs change recommendations without promising a successful play', () => {
  assert.ok(score('inside', {}, 'man', 'box') < score('inside', {}, 'man', 'balanced'));
  assert.ok(score('slants', {}, 'man', 'box') > score('slants', {}, 'man', 'balanced'));
  assert.ok(score('outs', {}, 'cover3', 'cushion') > score('outs', {}, 'cover3', 'balanced'));
  assert.ok(score('go', {}, 'man', 'press') > score('go', {}, 'man', 'balanced'));
  assert.match(assessPlay(getPlay('slants'), rules(), 'man', 'box').reasons.join(' '), /Extra run support/);
});

test('a compressed red zone and backed-up field position discourage slow deep calls', () => {
  assert.ok(score('go', { spot: 93 }, 'cover2') < score('go', { spot: 25 }, 'cover2'));
  assert.ok(score('inside', { spot: 93 }, 'cover2') > score('inside', { spot: 25 }, 'cover2'));
  assert.ok(score('play-action', { spot: 4 }, 'man') < score('play-action', { spot: 25 }, 'man'));
});

test('late clock situations favor a sideline outlet when chasing and an in-bounds run when leading', () => {
  const trailing = rules({ quarter: 4, clock: 25, score: { home: 7, away: 14 }, yardsToGo: 6 });
  assert.equal(recommendPlays(trailing, 'cover3')[0].id, 'outs');
  assert.match(recommendPlays(trailing, 'cover3')[0].reason, /sideline|clock/);
  const leading = rules({ quarter: 4, clock: 50, score: { home: 14, away: 7 }, yardsToGo: 2 });
  assert.equal(recommendPlays(leading, 'man')[0].call.type, 'run');
  assert.match(recommendPlays(leading, 'man')[0].reason, /late lead|in bounds/);
});

test('unknown coverage falls back to man; recommendation limit is bounded', () => {
  assert.deepEqual(recommendPlays(rules(), 'unknown'), recommendPlays(rules(), 'man'));
  assert.equal(recommendPlays(rules(), 'man', 'balanced', 0).length, 0);
  assert.equal(recommendPlays(rules(), 'man', 'balanced', 50).length, PLAYBOOK.length);
});
