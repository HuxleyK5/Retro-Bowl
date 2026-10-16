import { PLAYBOOK } from './Playbook.js';

// These describe route geometry and timing, never a promised gain or success rate.
export const PLAY_PROFILES = Object.freeze({
  slants: { primarySlot: '81', read: 'Y / inside cut', depth: 'QUICK · 5–16 YD', strength: 'Quick cuts create an inside throwing window.', quick: true },
  outs: { primarySlot: '08', read: 'X / sideline break', depth: 'SHORT · 4–6 YD', strength: 'A short sideline break gives you a boundary outlet.', quick: true },
  curls: { primarySlot: '81', read: 'Y / settle underneath', depth: 'MEDIUM · 6–12 YD', strength: 'Receivers turn back and settle below deep coverage.' },
  posts: { primarySlot: '08', read: 'X / deep middle', depth: 'DEEP · 20–35 YD', strength: 'Deep inside breaks attack the middle between safeties.', deep: true },
  go: { primarySlot: '19', read: 'Z / vertical lane', depth: 'DEEP · VERTICAL', strength: 'Four vertical routes spread the deep defenders.', deep: true },
  crosses: { primarySlot: '81', read: 'Y / shallow cross', depth: 'QUICK · CROSSING', strength: 'Crossing routes make trailing defenders change direction.', quick: true },
  screen: { primarySlot: '22', read: 'RB / screen outlet', depth: 'SHORT · RB OUTLET', strength: 'The back releases outside behind lead blockers.', quick: true },
  'play-action': { primarySlot: '08', read: 'X / post after fake', depth: 'DEEP · 0.9S FAKE', strength: 'A handoff fake delays the pass, then opens deeper routes.', deep: true },
  inside: { primarySlot: '22', read: 'RB / interior gap', depth: 'RUN · INSIDE', strength: 'A quick exchange sends the back through an interior gap.' },
  outside: { primarySlot: '22', read: 'RB / right edge', depth: 'RUN · RIGHT EDGE', strength: 'Follow the right-side blockers, then turn upfield.' },
  sweep: { primarySlot: '22', read: 'RB / left edge', depth: 'RUN · LEFT EDGE', strength: 'A lateral exchange attacks the left edge behind blockers.' },
  draw: { primarySlot: '22', read: 'RB / delayed gap', depth: 'RUN · 1.1S DELAY', strength: 'Show pass before a delayed handoff into the middle.' },
});
Object.values(PLAY_PROFILES).forEach(Object.freeze);

const coverageScores = {
  man: { slants: 20, outs: 14, crosses: 24, screen: 4, inside: 6, outside: 6, sweep: 6, draw: 6 },
  cover2: { posts: 24, 'play-action': 12, go: 10, inside: 10, outside: 8, sweep: 8, draw: 8 },
  cover3: { outs: 24, curls: 26, crosses: 15, screen: 14, inside: 6, outside: 6, sweep: 6, draw: 6, posts: -12, go: -16, 'play-action': -12 },
  blitz: { screen: 34, outs: 25, slants: 24, draw: 14, outside: 8, sweep: 5, curls: -4, posts: -18, go: -22, 'play-action': -24 },
};

export function assessPlay(call, rules = {}, coverage = 'man', adjustment = 'balanced') {
  const profile = PLAY_PROFILES[call.id];
  if (!profile) throw new Error(`Unknown play: ${call.id}`);
  const distance = Math.max(1, rules.yardsToGo ?? 10), spot = rules.spot ?? 25, down = rules.down ?? 1;
  const run = call.type === 'run';
  const reasons = [];
  let score = 30;
  const add = (weight, text) => { score += weight; if (weight > 0 && text) reasons.push({ weight, text }); };
  const coverageWeight = (coverageScores[coverage] || coverageScores.man)[call.id] || 0;
  const coverageReason = coverage === 'blitz' ? (run ? 'An aggressive rush can leave a lane behind it.' : 'A quick outlet gets the ball out before extra rushers arrive.') :
    coverage === 'cover3' ? (run ? 'Three deep defenders leave fewer underneath.' : 'Work underneath the three deep zones.') :
    coverage === 'cover2' ? (run ? 'Two deep safeties leave fewer defenders near the run.' : call.id === 'go' ? 'Four verticals give two deep safeties several lanes to protect.' : 'An inside vertical route can split the two safeties.') :
    run ? 'Receivers can carry their man defenders away from the run.' : 'Cuts and crossing routes change the angle against man coverage.';
  add(coverageWeight, coverageReason);

  if (distance <= 3) {
    const short = { inside: 28, outside: 16, draw: 10, slants: 14, outs: 12, screen: 8, curls: 4, crosses: 3 };
    add(short[call.id] || (profile.deep ? -24 : 0), run ? `Only ${Math.ceil(distance)} yards needed; attack a nearby gap.` : `Only ${Math.ceil(distance)} yards needed; a short release is enough to challenge the line.`);
  } else if (distance <= 7) {
    add(profile.deep ? -10 : ({ slants: 14, outs: 14, curls: 14, crosses: 12, inside: 5, outside: 5, screen: 5 }[call.id] || 0), 'The underneath breaks match this manageable distance.');
  } else if (distance >= 12) {
    add(({ curls: -12, outs: -18, screen: -14, slants: 8, crosses: 5, posts: 22, go: 20, 'play-action': 18 }[call.id] || (run ? -16 : 0)), `${Math.ceil(distance)} yards needed; deeper stems can reach beyond the sticks.`);
  } else {
    add(({ curls: 8, slants: 12, crosses: 14, outs: -4 }[call.id] || (profile.deep ? 8 : 0)), 'The intermediate routes can develop near the first-down line.');
  }
  if (down >= 3 && distance >= 8) add(profile.deep ? 8 : ['outs', 'screen'].includes(call.id) ? -10 : 0, 'On a late down, send a route beyond the first-down line.');
  if (spot >= 88) add(profile.deep ? -28 : call.id === 'inside' ? 16 : ['slants', 'outs', 'screen'].includes(call.id) ? 12 : run ? 6 : 0, 'A compressed red zone favors quick breaks and nearby gaps.');
  if (spot <= 10) add(['inside', 'slants', 'outs'].includes(call.id) ? 8 : ['draw', 'play-action'].includes(call.id) ? -12 : profile.deep ? -8 : 0, 'Backed up near your goal, favor a quick release or exchange.');
  if (adjustment === 'box') add(run ? (call.id === 'inside' ? -22 : -14) : 14, 'Extra run support leaves more space in the passing lanes.');
  if (adjustment === 'cushion') add(profile.quick || call.id === 'curls' ? 16 : profile.deep ? -8 : 0, 'The deep cushion concedes room underneath.');
  if (adjustment === 'press') add(profile.deep ? 9 : call.id === 'crosses' ? 8 : 0, profile.deep ? 'A deep release can get behind tight press alignment.' : 'Crossing releases change the angle against tight alignment.');

  const offense = rules.possession || 'home', defense = offense === 'home' ? 'away' : 'home';
  const margin = (rules.score?.[offense] || 0) - (rules.score?.[defense] || 0);
  const late = [2, 4].includes(rules.quarter) && rules.clock <= Math.min(45, (rules.quarterSeconds || 120) / 2);
  if (late && margin <= 0) add(call.id === 'outs' ? 30 : call.id === 'curls' ? 10 : profile.deep ? (rules.clock > 10 ? 10 : -10) : run ? -24 : call.id === 'screen' ? -8 : 4,
    call.id === 'outs' ? 'Late in the half, a sideline break offers a chance to stop the clock.' : profile.deep ? 'When chasing points, deeper routes can cover more field on one throw.' : 'A quick release leaves more time to manage the next snap.');
  if (rules.quarter === 4 && margin > 0 && rules.clock <= Math.min(90, (rules.quarterSeconds || 120) * .75)) add(run ? 32 : call.id === 'screen' ? 5 : call.id === 'outs' ? -12 : 0, 'Protecting a late lead favors keeping the ball in bounds.');
  reasons.sort((a, b) => b.weight - a.weight);
  return { id: call.id, call, score, profile, reason: reasons[0]?.text || profile.strength, reasons: reasons.map(reason => reason.text) };
}

export function recommendPlays(rules = {}, coverage = 'man', adjustment = 'balanced', limit = 3) {
  return PLAYBOOK.map(call => assessPlay(call, rules, coverage, adjustment))
    .sort((a, b) => b.score - a.score || PLAYBOOK.indexOf(a.call) - PLAYBOOK.indexOf(b.call))
    .slice(0, Math.max(0, Math.min(PLAYBOOK.length, limit)));
}
