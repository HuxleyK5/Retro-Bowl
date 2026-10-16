const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const COVERAGES = Object.freeze({
  man: Object.freeze({ name: 'Man coverage', description: 'Five defenders follow receivers with a deep middle helper. Crossing routes can create separation.' }),
  cover2: Object.freeze({ name: 'Cover 2', description: 'Two deep safeties and four underneath zones protect the sidelines. Attack the gap between the safeties.' }),
  cover3: Object.freeze({ name: 'Cover 3', description: 'Three deep defenders protect vertical routes. Short outs and underneath curls can find space.' }),
  blitz: Object.freeze({ name: 'Blitz', description: 'Four rushers attack the pocket with four isolated defenders. The back is a quick outlet.' }),
});
export const DEFENSIVE_ADJUSTMENTS = Object.freeze({
  balanced: Object.freeze({ name: 'Balanced', description: 'Normal coverage depth and run recognition.' }),
  press: Object.freeze({ name: 'Press', description: 'Crowd releases and disrupt nearby receivers; deep routes can get behind the coverage.' }),
  cushion: Object.freeze({ name: 'Cushion', description: 'Align deeper to protect long throws; concede more room underneath.' }),
  box: Object.freeze({ name: 'Load the box', description: 'Bring support close to the middle and recognize handoffs quickly; leave more room outside and deep.' }),
});
export const THROW_DEPTHS = Object.freeze({
  auto: Object.freeze({ name: 'Manual aim', yards: null, description: 'Use the full pull-back aim and receiver lead.' }),
  short: Object.freeze({ name: 'Short', yards: 5, description: 'Quick throw five yards beyond scrimmage.' }),
  medium: Object.freeze({ name: 'Medium', yards: 14, description: 'Intermediate throw fourteen yards beyond scrimmage.' }),
  deep: Object.freeze({ name: 'Deep', yards: 28, description: 'Long throw twenty-eight yards beyond scrimmage; needs time in the pocket.' }),
});

// Alignment and responsibilities are chosen before the snap. No route or future
// offensive play is read: zones react to actual receiver motion in Defense.
export function configureDefense(play, coverage = 'man', adjustment = 'balanced') {
  if (!COVERAGES[coverage] || !DEFENSIVE_ADJUSTMENTS[adjustment]) return false;
  play.coverage = coverage; play.defensiveAdjustment = adjustment;
  const { field, lineOfScrimmage: line, defenders, receivers } = play;
  const yard = field.yard, center = field.height / 2;
  const depthShift = adjustment === 'cushion' ? 3 : adjustment === 'press' ? -2 : adjustment === 'box' ? -2 : 0;
  const zone = (depth, low, high, deep = false) => ({ type: 'zone', depth, low, high, deep });
  const man = receiverIndex => ({ type: 'man', receiverIndex });
  const rush = lane => ({ type: 'rush', lane });
  let roles;
  if (coverage === 'cover2') roles = [zone(5, 0, .24), zone(8, .16, .52), zone(8, .48, .84), zone(5, .76, 1), rush(-3), rush(3), zone(21, 0, .5, true), zone(21, .5, 1, true)];
  else if (coverage === 'cover3') roles = [zone(20, 0, .33, true), zone(6, 0, .35), zone(6, .65, 1), zone(20, .67, 1, true), zone(8, .28, .72), rush(-3), rush(3), zone(22, .33, .67, true)];
  else if (coverage === 'blitz') roles = [man(0), man(1), man(2), man(3), rush(-13), rush(-3), rush(3), rush(13)];
  else roles = [man(0), man(1), man(2), man(3), man(4), rush(-3), rush(3), zone(25, .12, .88, true)];
  // Bringing the safety down gives the run real extra support and sacrifices a
  // deep zone, rather than adding a hidden outcome multiplier.
  if (adjustment === 'box' && coverage !== 'blitz') {
    const support = roles.findLastIndex(role => role.deep);
    if (support >= 0) roles[support] = zone(3, .3, .7);
  }
  defenders.forEach((defender, index) => {
    const role = roles[index] || rush((index % 2 ? 1 : -1) * 5);
    let x, y;
    if (role.type === 'man') {
      const receiver = receivers[role.receiverIndex];
      const spawn = receiver?.spawn || { x: line, y: center };
      const cushion = adjustment === 'press' ? 1.2 : adjustment === 'cushion' ? 9 : 5;
      x = Math.max(line + yard * .4, spawn.x + yard * cushion);
      y = spawn.y + Math.sign(center - spawn.y) * yard * .6;
      defender.assignment = role.receiverIndex;
    } else if (role.type === 'zone') {
      x = line + Math.max(1.5, role.depth + depthShift) * yard;
      y = (role.low + role.high) / 2 * field.height;
      if (adjustment === 'box' && !role.deep) y = center + (y - center) * .82;
      defender.assignment = 0;
    } else {
      x = line + yard * (Math.abs(role.lane) > 5 ? 2 : 1.2);
      y = center + role.lane * yard;
      defender.assignment = -1;
    }
    defender.spawn = { x: clamp(x, defender.radius, field.width - defender.radius), y: clamp(y, defender.radius, field.height - defender.radius) };
    defender.coverageRole = { ...role, anchor: { ...defender.spawn } };
  });
  play.defense.reset();
  return true;
}

export function targetForDepth(play, point, depth = 'auto') {
  const option = THROW_DEPTHS[depth];
  if (!option || option.yards === null) return point;
  return { ...point, x: clamp(play.lineOfScrimmage + option.yards * play.field.yard, 20, play.field.width - 25),
    y: clamp(point.y, play.qb.radius, play.field.height - play.qb.radius), manual: true, throwDepth: depth };
}

export function chooseCpuCoverage(rules, random = Math.random) {
  const distance = rules.yardsToGo ?? 10, down = rules.down ?? 1, spot = rules.spot ?? 25;
  // Situation only: this deliberately takes rules rather than the selected call.
  let weights = { man: .34, cover2: .23, cover3: .25, blitz: .18 };
  if (distance <= 3 || spot >= 88) weights = { man: .35, cover2: .12, cover3: .12, blitz: .41 };
  else if (distance >= 12 || down >= 3 && distance >= 7) weights = { man: .15, cover2: .32, cover3: .41, blitz: .12 };
  const offense = rules.possession || 'home', defense = offense === 'home' ? 'away' : 'home';
  if (rules.quarter === 4 && rules.clock < 45 && (rules.score?.[offense] ?? 0) < (rules.score?.[defense] ?? 0))
    weights = { man: .12, cover2: .36, cover3: .46, blitz: .06 };
  let roll = clamp(random(), 0, .999999);
  for (const [coverage, weight] of Object.entries(weights)) { roll -= weight; if (roll < 0) return coverage; }
  return 'cover3';
}

export function matchupAdvice(call, coverage = 'man', adjustment = 'balanced') {
  const id = call?.id, run = call?.type === 'run';
  let strength, risk;
  if (coverage === 'blitz') {
    strength = ['screen', 'slants', 'outs'].includes(id) ? 'Quick routes and the back outlet can beat the extra rushers.' : run ? 'A draw or an outside lane can get behind an aggressive rush.' : 'The four receivers face isolated coverage; look for a quick release.';
    risk = 'Four rushers shorten the pocket. Deep routes and play action take time.';
  } else if (coverage === 'cover2') {
    strength = ['posts', 'go', 'play-action'].includes(id) ? 'A deep middle route can split the two safeties after the underneath zones clear.' : run ? 'Two safeties stay deep, leaving fewer defenders near the run.' : 'Find the space behind the flat defender and in front of a safety.';
    risk = 'The flat defenders sit on short sideline throws; two safeties cover the deep sidelines.';
  } else if (coverage === 'cover3') {
    strength = ['outs', 'curls', 'crosses', 'screen'].includes(id) ? 'Underneath routes can settle in the space below the three deep zones.' : run ? 'A patient run can attack the lighter underneath front.' : 'Stretch an underneath zone with two receivers and take the shorter opening.';
    risk = 'Three deep defenders protect vertical routes; forcing a long throw invites help.';
  } else {
    strength = ['crosses', 'slants', 'outs'].includes(id) ? 'Cuts and crossing routes force trailing defenders to change direction.' : run ? 'Receivers can carry their man coverage away from the run lane.' : 'Use a receiver’s speed or a sharp break to separate from their assigned defender.';
    risk = 'Each receiver has a defender following them, with a helper protecting the deep middle.';
  }
  if (adjustment === 'press') risk += ' Press alignment can jam a nearby release, but leaves less protection over the top.';
  else if (adjustment === 'cushion') strength += ' The extra cushion leaves more room for a quick underneath throw.';
  else if (adjustment === 'box') risk += ' Extra support is near the run lane; the vacated deep zone leaves passing space.';
  return { strength, risk };
}
