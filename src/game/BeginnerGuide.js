import { getPlay } from '../football/Playbook.js';
import { assessPlay } from '../football/PlayRecommendations.js';

export const BEGINNER_PLAYS = Object.freeze(['slants', 'inside', 'go']);
export const SIMPLE_PLAY_NAMES = Object.freeze({ slants: 'Short pass', inside: 'Run through the middle', go: 'Long pass' });
const simpleReasons = {
  slants: 'Try a short pass to a teammate with space around them.',
  inside: 'The ball is handed to your runner automatically. Move right and avoid defenders.',
  go: 'A long pass can cover more ground, but gives defenders more time to reach the ball.',
};
const yards = value => Math.max(1, Math.ceil(value - .001));

/** Suggestions explain the choice; they never select a play or change football rules. */
export function recommendBeginnerAction(rules, play = {}) {
  const distance = yards(rules.yardsToGo ?? 10);
  const margin = (rules.score?.home || 0) - (rules.score?.away || 0);
  const late = rules.quarter === 4 && rules.clock <= Math.min(45, (rules.quarterSeconds || 120) / 2);
  const needsTouchdown = late && margin < -3;
  const needsBall = late && margin <= 0;
  const kickDistance = rules.fieldGoalDistance ?? Math.round(117 - (rules.spot ?? 25));
  if (rules.down === 4 && kickDistance <= 45 && !needsTouchdown) {
    return { action: 'fieldGoal', label: 'Try a kick for 3 points', reason: `This is a ${kickDistance}-yard kick. A miss gives the other team the ball.` };
  }
  if (rules.down === 4 && distance > 2 && kickDistance > 45 && !needsBall) {
    return { action: 'punt', label: 'Kick the ball farther away (punt)', reason: 'You give up the ball, but the other team usually starts farther from your end zone.' };
  }
  const ranked = BEGINNER_PLAYS.map(id => assessPlay(getPlay(id), rules, play.coverage, play.defensiveAdjustment));
  ranked.sort((a, b) => b.score - a.score || BEGINNER_PLAYS.indexOf(a.id) - BEGINNER_PLAYS.indexOf(b.id));
  const id = ranked[0].id;
  return { action: 'play', playId: id, label: SIMPLE_PLAY_NAMES[id], reason: simpleReasons[id] };
}

export function getBeginnerGuide(match) {
  const r = match.rules, p = match.play || {}, human = r.possession === 'home';
  const scoring = 'Reach the right end zone for 6 points. A successful field goal kick is worth 3.';
  if (r.phase === 'pregame') return { goal: 'Score more points than the other team.', tip: scoring, recommendation: 'Start the game. Your defense plays automatically.' };
  if (r.phase === 'final') return { goal: 'Game finished.', tip: `Your score: ${r.score.home}. Opponent: ${r.score.away}.`, recommendation: 'Return to your team to prepare for the next game.' };
  if (r.phase === 'halftime' || r.phase === 'quarterBreak') return { goal: r.phase === 'halftime' ? 'Halfway through the game.' : 'This part of the game is over.', tip: 'There are four quarters. The game continues after this break.', recommendation: 'Press the continue button when you are ready.' };
  if (r.phase === 'kickMeter') {
    const power = match.meter?.stage === 'power';
    return { goal: match.meter?.kind === 'extraPoint' ? 'Kick through the posts for 1 bonus point.' : match.meter?.kind === 'fieldGoal' ? 'Kick through the posts for 3 points.' : match.meter?.kind === 'punt' ? 'Kick the ball away from your end zone.' : 'Kick the ball to the other team to restart play.', tip: power ? 'Step 1 of 2: press Space or the kick button near the right edge for power.' : 'Step 2 of 2: press Space or the kick button when the marker reaches the center.', recommendation: 'Each step lasts up to 5 seconds, so watch the moving marker.' };
  }
  if (r.phase === 'kick') return { goal: r.kick?.kind === 'punt' ? 'Your punt gives the ball to the other team.' : `Watch the kick: ${r.kick?.kind === 'extraPoint' ? '1 bonus point' : '3 points'} if it goes through.`, tip: 'The kick is already in the air.', recommendation: 'Wait for the result.' };
  if (r.phase === 'extraPoint') return { goal: human ? 'You scored a touchdown: 6 points!' : 'The other team scored a touchdown: 6 points.', tip: 'After a touchdown, a successful bonus kick adds 1 point.', recommendation: human ? 'Press the bonus kick button, then time the two presses.' : 'The other team takes its bonus kick automatically.' };
  if (r.phase === 'kickoff') return { goal: human ? 'Get ready to catch the kickoff.' : 'The other team is receiving the kickoff.', tip: human ? 'The catch happens automatically. Then run right and avoid defenders.' : 'Your defense handles this automatically.', recommendation: 'Wait for the ball to land.' };
  if (r.phase === 'return') return { goal: human ? 'Run right to give your team a better starting position.' : 'Your defense is stopping the return.', tip: human ? 'Use WASD or arrow keys to move. Hold Shift to run faster.' : 'No controls are needed while the other team has the ball.', recommendation: human ? 'Avoid opponents and stay inside the sidelines.' : 'Watch until your team gets the ball.' };
  if (r.phase === 'result') {
    let tip = r.next === 'extraPoint' ? 'A touchdown is worth 6 points. A bonus kick comes next.' : r.kickoffPending ? 'The next kickoff restarts play.' : !human ? 'The other team has the ball. Your defense plays automatically.' : `Next: try ${r.down} of 4, with ${yards(r.yardsToGo)} yards to the ${r.firstDownLine >= 100 ? 'end zone' : 'yellow line'}.`;
    if (/TURNOVER ON DOWNS/.test(r.result)) tip = `The offense used all four tries without reaching its target. ${human ? 'Your team' : 'The other team'} now has the ball.`;
    if (/INTERCEPTION/.test(r.result)) tip = `A defender caught the pass. ${human ? 'Your team' : 'The other team'} now has the ball.`;
    if (/FIRST DOWN/.test(r.result)) tip = `${human ? 'You' : 'The other team'} reached the yellow line and earned four new tries.`;
    if (/INCOMPLETE/.test(r.result)) tip = 'The pass was not caught. No yards gained, and one try was used.';
    if (/DELAY OF GAME/.test(r.result)) tip = 'The play clock ran out before the play started. The offense moves backward.';
    if (r.next === 'extraPoint') tip = `${human ? 'Your team' : 'The other team'} scored 6 points. A bonus kick for 1 point comes next.`;
    return { goal: r.result || 'That play is over.', tip, recommendation: human ? 'Press Continue or Space for the next step.' : 'The game continues automatically while the opponent has the ball.' };
  }
  if (!human) return { goal: 'The other team has the ball.', tip: 'Your defense plays automatically. No controls are needed.', recommendation: 'Watch until your team gets the ball back.' };
  const distance = yards(r.yardsToGo ?? 10), target = r.firstDownLine >= 100 ? 'end zone' : 'yellow line';
  const goal = `Gain ${distance} ${distance === 1 ? 'yard' : 'yards'} to the ${target}. Try ${r.down} of 4.`;
  if (r.phase === 'live') {
    if (p.phase === 'loose') return { goal: 'The ball came loose!', tip: 'Move toward the loose ball with WASD or arrow keys to try to recover it.', recommendation: 'Either team can pick up a fumble.' };
    if (p.phase === 'flight') return { goal, tip: 'Your pass is in the air. Catching happens automatically.', recommendation: 'After the catch, release movement keys, then use WASD or arrows to steer.' };
    if (p.call?.type === 'run' && p.phase === 'passing') return { goal, tip: 'The ball will be handed to the runner automatically.', recommendation: 'Then use WASD or arrow keys to steer toward the right end zone.' };
    if (p.canThrow) return { goal, tip: 'Hold the mouse on the field, pull back opposite the throw direction, then release to pass.', recommendation: 'Look for a teammate with space around them. Pull farther for a longer throw.' };
    if (p.phase === 'passing') return { goal, tip: 'Wait for the handoff fake to finish before throwing.', recommendation: 'Keep an eye on open teammates.' };
    return { goal, tip: 'Move right with WASD or arrow keys. Hold Shift to run faster.', recommendation: r.firstDownLine >= 100 ? 'Avoid opponents. Reach the end zone for a touchdown worth 6 points.' : 'Avoid opponents. Reaching the yellow line gives you four new tries.' };
  }
  const action = recommendBeginnerAction(r, p);
  return { goal, tip: r.down === 4 ? `Last try! If you do not reach the ${target}, the other team gets the ball.` : `Reach the ${target} before using all four tries. ${r.firstDownLine >= 100 ? 'Cross it for a touchdown worth 6 points.' : 'Then you get four new tries.'}`, recommendation: `Coach suggests: ${action.label}. ${action.reason}`, suggestedAction: action.action, suggestedPlayId: action.playId };
}
