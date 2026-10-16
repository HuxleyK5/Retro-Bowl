// The CPU uses the same clocks and charged timeouts as the player. Thresholds
// shrink for accelerated quarters so a ten-second game still has a late drive.
export function clockDecision(rules, team = 'away') {
  const opponent = team === 'home' ? 'away' : 'home';
  const margin = rules.score[team] - rules.score[opponent];
  const offense = rules.possession === team;
  const endOfHalf = rules.quarter === 2 || rules.quarter === 4;
  const late = endOfHalf && rules.clock <= Math.min(45, rules.quarterSeconds / 2);
  const urgent = endOfHalf && rules.clock <= Math.min(20, rules.quarterSeconds / 4);
  const protectingLead = rules.quarter === 4 && margin > 0;
  const tempo = offense && late && margin <= 0 ? 'hurry' : offense && protectingLead ? 'chew' : 'normal';
  const canStop = rules.clockRunning && rules.canTimeout(team);
  const defensiveStop = !offense && late && margin < 0;
  const offensiveStop = offense && urgent && margin <= 0 && rules.phase === 'result';
  const timeout = canStop && (defensiveStop || offensiveStop);
  return { tempo, timeout, reason: timeout ? (offense ? 'Preserve time for the next snap.' : 'Stop the opponent from running out the clock.') : '' };
}
