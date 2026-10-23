// Plain-language descriptions shared by the team, roster and draft screens.
const POSITIONS = Object.freeze({
  QB: ['Quarterback', 'Throws passes and starts each attacking play.'],
  RB: ['Running back', 'Carries the ball and can catch short passes.'],
  WR: ['Wide receiver', 'Runs into space to catch passes.'],
  TE: ['Tight end', 'Catches passes and helps block defenders.'],
  OL: ['Offensive lineman', 'Blocks defenders to protect your thrower and runner.'],
  LS: ['Long snapper', 'Sends the ball back to the kicker or punter.'],
  DEF: ['Defender', 'Stops the other team from moving the ball and scoring.'],
  DL: ['Defensive lineman', 'Stops runners and pressures the other team\'s thrower.'],
  LB: ['Linebacker', 'A defender who stops runners and covers pass catchers.'],
  DB: ['Defensive back', 'A defender who follows receivers and stops passes.'],
  K: ['Kicker', 'Kicks field goals and extra points to score.'],
  P: ['Punter', 'Kicks the ball far away when your team gives up possession.'],
});

export function positionLabel(value) {
  const code = typeof value === 'string' ? value : value?.specialty || value?.position || '';
  return POSITIONS[code] ? `${POSITIONS[code][0]} (${code})` : code;
}

export function positionRole(value) {
  const code = typeof value === 'string' ? value : value?.specialty || value?.position || '';
  return POSITIONS[code]?.[1] || 'Helps your team on the field.';
}

export function teamStyleSummary(team) {
  const attack = {
    'Spread passing': 'Spreads pass catchers across the field',
    'Power running': 'Favors strong runs with the ball',
    'Vertical passing': 'Looks for long passes',
    'West coast timing': 'Favors quick, short passes',
    'Play-action balance': 'Mixes running and passing',
    'Outside zone': 'Favors runs toward the sideline',
  }[team?.offensiveIdentity] || 'Mixes running and passing';
  const defense = {
    'Zone coverage': 'defenders protect areas of the field',
    'Pressure front': 'defenders pressure the thrower',
    'Man coverage': 'defenders follow individual pass catchers',
    'Run containment': 'defenders focus on stopping runs',
  }[team?.defensiveIdentity] || 'defenders try to stop the other team';
  return `${attack}; ${defense}.`;
}
