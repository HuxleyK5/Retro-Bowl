import { POSITION_RATINGS, RATING_LABELS } from '../data/PlayerData.js';
import { playerStars } from '../data/PlayerStars.js';
import { ROSTER_LIMIT } from '../data/FranchiseMode.js';
import { positionLabel, positionRole, teamStyleSummary } from '../data/FootballTerms.js';
import { isBeginnerMode } from './BeginnerMode.js';
import { renderDraftCards } from './DraftCards.js';

const TABS = [['overview', 'Overview'], ['roster', 'Roster'], ['market', 'Market & trades'], ['draft', 'Draft']];
const money = (value, decimals = 1) => `$${(Number(value || 0) / 1000000).toFixed(decimals)}M`;
const fullName = team => team ? `${team.city} ${team.name}` : 'To be determined';
const element = (tag, className = '', text = null) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== null) node.textContent = String(text);
  return node;
};
const isFinal = game => Number.isFinite(game.homeScore) && Number.isFinite(game.awayScore);
const stageName = stage => ({ regular: 'Regular season', quarterfinal: 'Quarterfinal', semifinal: 'Semifinal', championship: 'Championship' }[stage] || stage);

/** Persistent franchise management. All game mutations go through the host callback. */
export class FranchisePanel {
  constructor(root, { onAction, onPlay, onClubSelection } = {}) {
    this.root = root;
    this.onAction = onAction;
    this.onPlay = onPlay;
    this.onClubSelection = onClubSelection;
    this.tab = 'overview';
    this.rosterFilter = 'all';
    this.selectedPlayerId = null;
    this.trainFocus = 'balanced';
    this.contractYears = 2;
    this.marketYears = 2;
    this.tradeTeamId = null;
    this.tradeOwnId = null;
    this.tradeTargetId = null;
    this.notice = '';
    this.noticeError = false;
    this.matchActive = false;
    this.busy = false;
    this.draftSessionKey = null;
    this.openDetails = new Set();
    this.draftPage = 0;
    this.draftSelectedId = null;
    root.classList.add('franchise-screen');
    root.setAttribute('aria-label', 'Franchise management');
  }

  get visible() { return !this.root.hidden; }
  setFranchise(franchise) {
    if (this.franchise !== franchise) {
      this.tab = 'overview'; this.rosterFilter = 'all'; this.selectedPlayerId = null;
      this.tradeTeamId = null; this.tradeOwnId = null; this.tradeTargetId = null;
      this.trainFocus = 'balanced'; this.notice = ''; this.noticeError = false; this.matchActive = false;
      this.draftSessionKey = null;
      this.draftPage = 0; this.draftSelectedId = null;
    }
    this.franchise = franchise; this.render();
  }
  setMatchActive(active) { this.matchActive = Boolean(active); if (this.visible) this.render(); }
  setNotice(message, error = false) {
    this.notice = String(message || ''); this.noticeError = error; this.render();
  }
  show() {
    this.root.hidden = false; this.render();
    this.root.querySelector('.fr-draft-title, .fr-header h2')?.focus({ preventScroll: true });
  }
  hide() { this.root.hidden = true; }

  button(label, callback, className = '', disabled = false, focusKey = '') {
    const button = element('button', `fr-button ${className}`, label);
    button.type = 'button'; button.disabled = disabled;
    if (focusKey) button.dataset.focus = focusKey;
    button.addEventListener('click', callback);
    return button;
  }

  action(label, method, args = [], className = '', disabled = false) {
    return this.button(label, () => this.run(method, ...args), className, disabled || this.matchActive || this.busy, `${method}-${args[0] || ''}`);
  }

  async run(method, ...args) {
    if (this.matchActive || this.busy) return;
    this.notice = ''; this.noticeError = false;
    try {
      const result = this.onAction ? this.onAction(method, ...args) : this.franchise[method](...args);
      if (result && typeof result.then === 'function') {
        this.busy = true; this.render();
        const resolved = await result;
        if (typeof resolved === 'string' && !this.noticeError) this.notice = resolved;
      } else if (typeof result === 'string' && !this.noticeError) this.notice = result;
    } catch (error) {
      this.notice = error?.message || 'This move could not be completed.'; this.noticeError = true;
    } finally { this.busy = false; this.render(); }
  }

  select(labelText, choices, value, callback, focusKey = '') {
    const label = element('label', 'fr-field');
    label.append(element('span', '', labelText));
    const select = element('select');
    if (focusKey) select.dataset.focus = focusKey;
    for (const [id, name] of choices) {
      const option = element('option', '', name); option.value = id; select.append(option);
    }
    select.value = String(value);
    select.addEventListener('change', () => callback(select.value));
    label.append(select); return label;
  }

  card(title, subtitle = '') {
    const card = element('section', 'fr-card');
    const head = element('div', 'fr-card-heading');
    head.append(element('h3', '', title));
    if (subtitle) head.append(element('span', 'fr-muted', subtitle));
    card.append(head); return card;
  }

  disclosure(label, contents, key) {
    const details = element('details', 'fr-more'); details.dataset.frDetails = key;
    details.open = this.openDetails.has(key);
    details.append(element('summary', '', label), ...contents);
    return details;
  }

  renderSeasonGuide() {
    const f = this.franchise, drafting = ['draft', 'offseason'].includes(f.phase);
    const guide = element('section', 'fr-season-guide'); guide.setAttribute('aria-label', 'Your season in three steps');
    guide.append(element('h3', '', 'Your season in 3 easy steps'));
    const list = element('ol');
    for (const [title, copy, current] of [
      ['Pick 2 new players', 'The draft adds new players to your team. More stars means stronger ability today.', drafting && f.draftPicksRemaining > 0],
      ['Start season', 'Use START SEASON when ready. It can choose any remaining draft picks within your budget for you.', drafting && f.draftPicksRemaining === 0],
      ['Play game', 'Play each week and try to win the championship. Your best healthy players are picked automatically.', !drafting],
    ]) {
      const step = element('li', current ? 'fr-guide-current' : '');
      if (current) step.setAttribute('aria-current', 'step');
      step.append(element('strong', '', title), element('span', '', copy)); list.append(step);
    }
    guide.append(list); return guide;
  }

  empty(text) { return element('p', 'fr-empty', text); }
  team(id) { return this.franchise.league.find(team => team.id === id); }
  record(teamId = this.franchise.teamId) {
    const row = this.franchise.standings.find(row => row.teamId === teamId);
    return row ? `${row.wins}–${row.losses}${row.ties ? `–${row.ties}` : ''}` : '0–0';
  }
  strengths(player) {
    return [...(POSITION_RATINGS[player.position] || Object.keys(player.ratings || {}))]
      .sort((a, b) => player.ratings[b] - player.ratings[a]).slice(0, 2)
      .map(key => `${RATING_LABELS[key] || key} ${player.ratings[key]}`).join(' · ');
  }
  condition(player) {
    if (player.injury) return `${player.injury.name} · ${player.injury.weeksRemaining}w`;
    return `${Math.max(0, Math.round(100 - (player.fatigue || 0)))}% energy`;
  }

  stars(overall) {
    const value = playerStars(overall);
    const rating = element('span', 'fr-star-rating');
    rating.setAttribute('role', 'img');
    rating.setAttribute('aria-label', `${value.toFixed(1)} out of 5 stars`);
    const glyphs = element('span', 'fr-star-glyphs'); glyphs.setAttribute('aria-hidden', 'true');
    glyphs.style.setProperty('--fr-star-fill', `${value * 20}%`);
    glyphs.append(element('span', 'fr-star-empty', '★★★★★'), element('span', 'fr-star-filled', '★★★★★'));
    const label = element('span', 'fr-star-value', `${value.toFixed(1)} / 5 stars`); label.setAttribute('aria-hidden', 'true');
    rating.append(glyphs, label); return rating;
  }

  render() {
    if (!this.franchise) return;
    this.openDetails = new Set([...this.root.querySelectorAll('details[data-fr-details][open]')].map(node => node.dataset.frDetails));
    const beginner = isBeginnerMode();
    const focusKey = this.root.contains(document.activeElement) ? document.activeElement.dataset.focus : null;
    const f = this.franchise, team = f.team;
    const draftSessionKey = ['draft', 'offseason'].includes(f.phase) ? `${f.year}:${f.phase}` : null;
    if (draftSessionKey && draftSessionKey !== this.draftSessionKey) { this.tab = 'draft'; this.draftPage = 0; this.draftSelectedId = null; }
    else if (!draftSessionKey && this.draftSessionKey) this.tab = 'overview';
    this.draftSessionKey = draftSessionKey;
    this.root.style.setProperty('--fr-club', team.primaryColor);
    this.root.style.setProperty('--fr-trim', team.secondaryColor);
    const hub = element('div', 'fr-hub');
    hub.classList.toggle('fr-beginner', beginner);
    if (draftSessionKey && this.tab === 'draft') {
      hub.classList.add('fr-draft-hub'); hub.append(renderDraftCards(this));
      this.root.replaceChildren(hub);
      if (focusKey) ([...this.root.querySelectorAll('[data-focus]')].find(node => node.dataset.focus === focusKey) || this.root.querySelector('.fr-draft-title'))?.focus({ preventScroll: true });
      return;
    }
    const header = element('header', 'fr-header');
    const identity = element('div');
    const title = element('h2', '', fullName(team)); title.tabIndex = -1; title.dataset.focus = 'hub-heading';
    identity.append(element('p', 'fr-eyebrow', `FRANCHISE OFFICE / SEASON ${f.year}`), title);
    const style = element('p', 'fr-subtitle', beginner ? `${team.stadium} · ${teamStyleSummary(team)}` : `${team.stadium} · ${team.offensiveIdentity} · ${team.defensiveIdentity}`);
    style.title = `${team.offensiveIdentity} offense · ${team.defensiveIdentity} defense`; identity.append(style);
    const clubButton = this.button('CLUB SELECTION', () => this.onClubSelection?.(), 'fr-button-subtle', false, 'club-selection');
    header.append(identity, clubButton); hub.append(header);

    const stats = element('div', 'fr-stat-grid');
    const cap = f.cap;
    const healthy = team.roster.filter(player => !player.injury).length;
    const overall = team.roster.length ? Math.round(team.roster.reduce((sum, p) => sum + p.overall, 0) / team.roster.length) : 0;
    for (const [label, value, detail] of [
      [beginner ? 'WINS / LOSSES' : 'SEASON RECORD', this.record(), f.phase === 'regular' ? `Week ${f.week} · Regular season` : f.phase === 'playoffs' ? 'Championship playoffs' : f.phase === 'draft' ? 'Opening season draft' : 'Next season draft'],
      [beginner ? 'TEAM ABILITY' : 'TEAM OVERALL', beginner ? `${playerStars(overall).toFixed(1)} / 5 stars` : overall, `${team.roster.length} players · ${beginner ? 'Higher is stronger' : 'Build your depth'}`],
      [beginner ? 'BUDGET LEFT' : 'CAP SPACE', money(cap.space), beginner ? `Of ${money(cap.limit)} yearly salary limit` : `${money(cap.payroll)} of ${money(cap.limit)}`],
      [beginner ? 'READY TO PLAY' : 'AVAILABLE', `${healthy}/${team.roster.length}`, `${team.roster.length - healthy} injured · ${beginner ? 'Heal as weeks pass' : 'Manage recovery'}`],
    ]) {
      const stat = element('div', 'fr-stat'); stat.append(element('span', '', label), element('strong', '', value), element('small', '', detail)); stats.append(stat);
    }
    hub.append(stats, this.renderNextGame());
    if (beginner) hub.append(this.renderSeasonGuide());
    if (this.matchActive) hub.append(element('p', 'fr-lock-note', 'A game is in progress. Resume it to finish the week; roster moves and simulation unlock after the final whistle.'));
    if (this.notice) {
      const notice = element('p', `fr-notice${this.noticeError ? ' fr-notice-error' : ''}`, this.notice);
      notice.setAttribute('role', this.noticeError ? 'alert' : 'status'); hub.append(notice);
    }
    const tabs = element('nav', 'fr-tabs'); tabs.setAttribute('aria-label', 'Franchise sections'); tabs.setAttribute('role', 'tablist');
    for (const [id, label] of TABS) {
      const button = this.button(beginner ? ({ overview: 'Home', roster: 'Your team', market: 'Add players', draft: 'Draft' }[id]) : label, () => { this.tab = id; this.render(); }, '', false, `tab-${id}`);
      button.id = `fr-tab-${id}`; button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', String(this.tab === id));
      button.setAttribute('aria-controls', 'fr-pane'); button.tabIndex = this.tab === id ? 0 : -1;
      button.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); const index = TABS.findIndex(([tab]) => tab === this.tab);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
        this.tab = TABS[next][0]; this.render(); this.root.querySelector(`#fr-tab-${this.tab}`).focus();
      });
      tabs.append(button);
    }
    hub.append(tabs);
    const pane = element('div', 'fr-pane'); pane.id = 'fr-pane'; pane.setAttribute('role', 'tabpanel'); pane.setAttribute('aria-labelledby', `fr-tab-${this.tab}`);
    pane.append(this.tab === 'roster' ? this.renderRoster() : this.tab === 'market' ? this.renderMarket() : this.tab === 'draft' ? this.renderDraft() : this.renderOverview());
    hub.append(pane, element('p', 'fr-save-note', 'Franchise progress saves automatically on this device.'));
    this.root.replaceChildren(hub);
    if (focusKey) [...this.root.querySelectorAll('[data-focus]')].find(node => node.dataset.focus === focusKey)?.focus({ preventScroll: true });
  }

  renderNextGame() {
    const f = this.franchise, game = f.nextGame;
    const beginner = isBeginnerMode();
    const draftOpen = ['draft', 'offseason'].includes(f.phase);
    const draftYear = f.year + (f.phase === 'offseason' ? 1 : 0);
    const card = element('section', 'fr-next-game');
    const description = element('div');
    description.append(element('p', 'fr-eyebrow', this.matchActive ? 'GAME IN PROGRESS' : draftOpen ? `SEASON ${draftYear} DRAFT` : game ? `${stageName(game.stage).toUpperCase()} / WEEK ${game.week}` : 'AROUND THE LEAGUE'));
    if (draftOpen) {
      description.append(element('h3', '', f.draftPicksRemaining ? 'Your season starts at the draft' : 'Your draft picks are complete'));
      description.append(element('p', 'fr-muted', beginner ? `${f.draftPicksRemaining ?? 0} players left to choose · ${money(f.cap.space, 2)} yearly budget left. Choose below, or start the season for automatic picks.` : `${f.draftPicksRemaining ?? 0} picks remaining · ${money(f.cap.space, 2)} available cap space · Build your roster before kickoff.`));
    } else if (game) {
      const opponent = this.team(game.homeId === f.teamId ? game.awayId : game.homeId);
      description.append(element('h3', '', `${game.homeId === f.teamId ? 'vs' : '@'} ${fullName(opponent)}`));
      description.append(element('p', 'fr-muted', `${this.record(f.teamId)} vs ${this.record(opponent.id)} · ${this.team(game.homeId).stadium}`));
    } else {
      description.append(element('h3', '', f.phase === 'playoffs' ? 'The postseason continues' : 'Your club is on a bye'));
      description.append(element('p', 'fr-muted', 'Advance the league to see the next matchup and recover your roster.'));
    }
    const actions = element('div', 'fr-next-actions');
    if (draftOpen) {
      if (this.tab !== 'draft') actions.append(this.button('OPEN DRAFT BOARD', () => { this.tab = 'draft'; this.render(); }, 'fr-button-subtle', this.busy, 'open-draft'));
      actions.append(this.action(f.phase === 'draft' ? 'START SEASON →' : 'START NEXT SEASON →', 'advanceOffseason', [], 'fr-button-primary'));
    } else if (this.matchActive || game) actions.append(this.button(this.matchActive ? 'RESUME GAME →' : 'PLAY GAME →', () => this.onPlay?.(), 'fr-button-primary', this.busy, 'play-game'));
    if (!draftOpen) {
      const simulate = this.action(game ? beginner ? 'AUTO-PLAY WEEK' : 'SIMULATE WEEK' : 'ADVANCE WEEK', 'simulateWeek', [], 'fr-button-subtle');
      if (beginner && game) actions.append(this.disclosure('More ways to play', [element('p', 'fr-footnote', 'Auto-play lets the computer finish this week for you.'), simulate], 'auto-play'));
      else actions.append(simulate);
    }
    card.append(description, actions); return card;
  }

  renderOverview() {
    const f = this.franchise, content = element('div', 'fr-overview');
    const standings = this.card('League standings', 'Top 8 qualify for the playoffs');
    const wrap = element('div', 'fr-table-scroll fr-standings-scroll');
    const table = this.table(['#', 'Club', 'W', 'L', 'T', 'PF', 'PA'], 'League standings');
    for (const [index, row] of f.standings.entries()) {
      const tr = element('tr', `${row.teamId === f.teamId ? 'fr-own-row' : ''}${index === 7 ? ' fr-cutoff' : ''}`);
      for (const value of [row.seed || index + 1, fullName(this.team(row.teamId)), row.wins, row.losses, row.ties, row.pf, row.pa]) tr.append(element('td', '', value));
      table.tBodies[0].append(tr);
    }
    wrap.append(table); standings.append(wrap, element('p', 'fr-footnote', 'Seeds follow the league’s record and point-differential tiebreakers.'));
    const sidebar = element('div', 'fr-stack');
    const recovery = this.card('Recovery & readiness', 'Take care of the full roster');
    const averageFatigue = Math.round(f.team.roster.reduce((sum, player) => sum + (player.fatigue || 0), 0) / Math.max(1, f.team.roster.length));
    recovery.append(element('p', 'fr-copy', isBeginnerMode() ? `Team energy is ${100 - averageFatigue}%. Rest Team restores energy before a game. You can rest once each week. Injured players heal as weeks pass.` : `Average fatigue is ${averageFatigue}%. Rest the team before kickoff to recover energy. Injured players heal as weeks pass.`));
    recovery.append(this.action(f.rested ? 'RECOVERY USED THIS WEEK' : 'REST TEAM', 'rest', [], 'fr-button-wide', f.rested));
    const news = this.card('Front office wire', 'Latest franchise events');
    const logs = (f.log || []).slice(0, 7);
    if (logs.length) {
      const list = element('ol', 'fr-news');
      for (const message of logs) list.append(element('li', '', typeof message === 'string' ? message : message.message || message.text || 'Franchise updated.'));
      news.append(list);
    } else news.append(this.empty('Your story starts here. Play games and make moves to fill the wire.'));
    sidebar.append(recovery, news); content.append(standings, sidebar);
    const schedule = this.card('Your schedule', `Season ${f.year}`); schedule.classList.add('fr-full-width');
    const games = (f.schedule || []).filter(game => game.homeId === f.teamId || game.awayId === f.teamId);
    if (!games.length) schedule.append(this.empty('The next schedule will arrive with the new season.'));
    const gamesGrid = element('div', 'fr-schedule');
    for (const game of games) gamesGrid.append(this.gameCard(game));
    schedule.append(gamesGrid); content.append(schedule);
    const playoffGames = (f.schedule || []).filter(game => game.stage && game.stage !== 'regular');
    const playoffs = this.card('Championship bracket', 'Eight clubs. One champion.'); playoffs.classList.add('fr-full-width');
    if (!playoffGames.length) playoffs.append(this.empty('The top eight clubs enter the bracket after the regular season. Win to advance; one loss ends the run.'));
    else {
      const bracket = element('div', 'fr-bracket');
      for (const stage of ['quarterfinal', 'semifinal', 'championship']) {
        const column = element('div', 'fr-bracket-round'); column.append(element('h4', '', stageName(stage)));
        const round = playoffGames.filter(game => game.stage === stage);
        if (round.length) for (const game of round) column.append(this.gameCard(game));
        else column.append(this.empty('Awaiting advancing teams'));
        bracket.append(column);
      }
      playoffs.append(bracket);
    }
    content.append(playoffs);
    const history = this.card('Championship history', 'Build a lasting legacy'); history.classList.add('fr-full-width');
    if (!(f.history || []).length) history.append(this.empty('Your first championship season is still being written.'));
    else {
      const historyList = element('div', 'fr-history');
      for (const season of f.history) {
        const entry = element('div', 'fr-history-entry');
        entry.append(element('strong', '', season.year), element('span', '', fullName(this.team(season.championId))), element('small', 'fr-muted', `Your record: ${season.record?.wins || 0}–${season.record?.losses || 0}`));
        historyList.append(entry);
      }
      history.append(historyList);
    }
    content.append(history);
    if (isBeginnerMode()) {
      const simple = element('div', 'fr-stack');
      simple.append(sidebar, this.disclosure('League standings, schedule & championships', [content], 'league-details'));
      return simple;
    }
    return content;
  }

  gameCard(game) {
    const f = this.franchise, card = element('article', 'fr-fixture');
    if (game.id === f.nextGame?.id) card.classList.add('fr-fixture-next');
    const final = isFinal(game);
    card.append(element('span', 'fr-fixture-label', `${game.stage === 'regular' ? 'WEEK' : stageName(game.stage).toUpperCase()} ${game.stage === 'regular' ? game.week : ''}${final ? ' · FINAL' : ''}`));
    for (const [id, score] of [[game.awayId, game.awayScore], [game.homeId, game.homeScore]]) {
      const row = element('div', `fr-fixture-team${game.winnerId === id ? ' fr-winner' : ''}`);
      row.append(element('span', '', this.team(id)?.name || 'TBD'), element('strong', '', final ? score : '—')); card.append(row);
    }
    return card;
  }

  table(labels, caption) {
    const table = element('table', 'fr-table');
    table.append(element('caption', 'fr-sr-only', caption));
    const head = element('thead'), row = element('tr');
    for (const label of labels) {
      const cell = element('th', '', label); cell.scope = 'col';
      const explanation = {
        Ability: 'Current ability out of 5 stars. More stars means a stronger player today.',
        'Could reach': 'The highest ability this player could develop toward. Improvement takes training and experience.',
        OVR: 'Overall: current ability out of 99.', POT: 'Potential: future ability ceiling out of 99.',
        'Cost / season': 'Annual salary. Only this amount counts toward the yearly team budget.',
        '3-year total': 'The cost over all three seasons, not the amount charged to this season\'s budget.',
        'Annual salary': 'Cost for one season, counted against the team\'s yearly salary limit.',
      }[label];
      if (explanation) cell.title = explanation;
      row.append(cell);
    }
    head.append(row); table.append(head, element('tbody')); return table;
  }

  renderRoster() {
    const f = this.franchise, layout = element('div', 'fr-roster-layout');
    const beginner = isBeginnerMode();
    const roster = this.card('Your roster', `${f.team.roster.length} players`);
    const toolbar = element('div', 'fr-toolbar');
    const positions = [...new Set(f.team.roster.map(p => p.specialty || p.position))];
    if (this.rosterFilter !== 'all' && !positions.includes(this.rosterFilter)) this.rosterFilter = 'all';
    toolbar.append(this.select('Position', [['all', 'All positions'], ...positions.map(p => [p, beginner ? positionLabel(p) : p])], this.rosterFilter, value => { this.rosterFilter = value; this.render(); }, 'roster-filter'));
    toolbar.append(element('p', 'fr-muted', beginner ? 'Your roster is your team. More stars means a stronger player. Your best healthy players start automatically.' : 'Choose a player to inspect ratings, train, or manage their contract.')); roster.append(toolbar);
    const players = f.team.roster.filter(p => this.rosterFilter === 'all' || p.specialty === this.rosterFilter);
    const selected = f.team.roster.find(p => p.id === this.selectedPlayerId) || players[0] || f.team.roster[0];
    if (selected) this.selectedPlayerId = selected.id;
    const scroll = element('div', 'fr-table-scroll fr-roster-scroll');
    const table = this.table(beginner ? ['Player', 'Ability', 'Could reach', 'Condition', 'Cost / season'] : ['Player', 'OVR', 'POT', 'Age', 'Condition', 'Contract'], 'Your roster and player condition');
    for (const player of players) {
      const row = element('tr', player.id === selected?.id ? 'fr-own-row' : '');
      const identity = element('td');
      const name = this.button(player.name, () => { this.selectedPlayerId = player.id; this.trainFocus = 'balanced'; this.render(); }, 'fr-player-link', false, `player-${player.id}`);
      name.setAttribute('aria-pressed', String(player.id === selected?.id));
      const role = element('small', 'fr-player-role', `#${player.number} · ${beginner ? positionLabel(player) : player.specialty}`);
      role.title = positionRole(player); identity.append(name, role); row.append(identity);
      if (beginner) {
        for (const value of [player.overall, player.potential]) { const rating = element('td'); rating.append(this.stars(value)); row.append(rating); }
      } else for (const value of [player.overall, player.potential, player.age]) row.append(element('td', 'fr-number', value));
      row.append(element('td', player.injury ? 'fr-injury' : '', this.condition(player)), element('td', 'fr-contract-cell', beginner ? money(player.contract.annualSalary) : `${money(player.contract.annualSalary)} / ${player.contract.yearsRemaining}yr`));
      table.tBodies[0].append(row);
    }
    scroll.append(table); roster.append(scroll); layout.append(roster);
    if (beginner) roster.append(element('p', 'fr-footnote', 'Could reach shows future ability, not a promise. Players improve with training and game experience. You can play without changing your team.'));
    if (selected) layout.append(this.renderPlayer(selected)); return layout;
  }

  renderPlayer(player) {
    if (isBeginnerMode()) return this.renderBeginnerPlayer(player);
    const card = this.card('Player development', `${player.specialty} / #${player.number}`); card.classList.add('fr-player-detail');
    const heading = element('div', 'fr-player-profile');
    const overall = element('div', 'fr-overall-badge'); overall.append(element('strong', '', player.overall), element('small', '', 'OVR'));
    const identity = element('div'); identity.append(element('h4', '', player.name), element('p', 'fr-muted', `Age ${player.age} · Potential ${player.potential}`));
    heading.append(overall, identity); card.append(heading);
    card.append(element('p', `fr-condition${player.injury ? ' fr-injury' : ''}`, player.injury ? this.condition(player) : `${this.condition(player)} · ${player.xp || 0} development XP`));
    card.append(element('p', 'fr-strengths', `STRENGTHS / ${this.strengths(player)}`));
    const ratings = element('div', 'fr-ratings');
    for (const key of POSITION_RATINGS[player.position] || []) {
      const row = element('div', 'fr-rating');
      const meter = element('meter'); meter.min = 1; meter.max = 99; meter.value = player.ratings[key]; meter.setAttribute('aria-label', RATING_LABELS[key]);
      row.append(element('span', '', RATING_LABELS[key]), meter, element('strong', '', player.ratings[key])); ratings.append(row);
    }
    card.append(ratings, element('h4', 'fr-section-label', 'WEEKLY TRAINING'));
    const keys = ['balanced', ...(POSITION_RATINGS[player.position] || [])];
    if (!keys.includes(this.trainFocus)) this.trainFocus = 'balanced';
    card.append(this.select('Training focus', keys.map(key => [key, key === 'balanced' ? 'Balanced development' : RATING_LABELS[key]]), this.trainFocus, value => { this.trainFocus = value; }, 'training-focus'));
    const trained = this.franchise.trained?.includes(player.id);
    card.append(this.button(player.injury ? 'RECOVERING FROM INJURY' : trained ? 'TRAINED THIS WEEK' : 'TRAIN PLAYER', () => this.run('train', player.id, this.trainFocus), 'fr-button-wide', Boolean(player.injury) || trained || this.matchActive || this.busy, `train-${player.id}`));
    card.append(element('p', 'fr-footnote', 'Training builds ratings toward potential and adds fatigue. Game experience and offseason development shape each career.'));
    card.append(element('h4', 'fr-section-label', 'CONTRACT'));
    card.append(element('p', 'fr-copy', `${money(player.contract.annualSalary)} per year · ${player.contract.yearsRemaining} year${player.contract.yearsRemaining === 1 ? '' : 's'} remaining · ${money(player.contract.guaranteed)} guaranteed`));
    card.append(element('p', 'fr-footnote', `Renewal quote: ${money(this.franchise.quoteSalary(player), 2)} per year at current market value.`));
    card.append(this.select('New contract length', [[1, '1 year'], [2, '2 years'], [3, '3 years'], [4, '4 years']], this.contractYears, value => { this.contractYears = Number(value); }, 'contract-years'));
    const actions = element('div', 'fr-inline-actions');
    actions.append(this.button('RENEW', () => this.run('renew', player.id, this.contractYears), '', this.matchActive || this.busy, `renew-${player.id}`), this.action('RELEASE', 'release', [player.id], 'fr-button-danger'));
    card.append(actions, element('p', 'fr-footnote', 'Renewals use current market value. Releasing a guaranteed contract can leave dead money on your cap.'));
    return card;
  }

  renderBeginnerPlayer(player) {
    const card = this.card(player.name, positionLabel(player)); card.classList.add('fr-player-detail');
    card.append(element('p', 'fr-copy', positionRole(player)), this.stars(player.overall));
    card.append(element('p', `fr-condition${player.injury ? ' fr-injury' : ''}`, this.condition(player)));
    card.append(element('p', 'fr-copy', `${money(player.contract.annualSalary)} per season · ${player.contract.yearsRemaining} season${player.contract.yearsRemaining === 1 ? '' : 's'} on contract`));
    const trained = this.franchise.trained?.includes(player.id);
    card.append(this.button(player.injury ? 'RECOVERING FROM INJURY' : trained ? 'TRAINED THIS WEEK' : 'TRAIN PLAYER', () => this.run('train', player.id, this.trainFocus), 'fr-button-wide', Boolean(player.injury) || trained || this.matchActive || this.busy, `train-${player.id}`));
    card.append(element('p', 'fr-footnote', 'Optional: training improves ability, but uses energy. Balanced training is a good starting point. Rest Team helps players recover.'));
    const advanced = element('div', 'fr-stack');
    advanced.append(element('p', 'fr-copy', `Age ${player.age} · Ability ${player.overall}/99 · Could reach ${player.potential}/99 · ${player.xp || 0} training experience points`));
    const keys = ['balanced', ...(POSITION_RATINGS[player.position] || [])];
    if (!keys.includes(this.trainFocus)) this.trainFocus = 'balanced';
    advanced.append(this.select('Training focus', keys.map(key => [key, key === 'balanced' ? 'Balanced development' : RATING_LABELS[key]]), this.trainFocus, value => { this.trainFocus = value; }, 'training-focus'));
    const ratings = element('div', 'fr-ratings');
    for (const key of POSITION_RATINGS[player.position] || []) {
      const row = element('div', 'fr-rating'), meter = element('meter');
      meter.min = 1; meter.max = 99; meter.value = player.ratings[key]; meter.setAttribute('aria-label', RATING_LABELS[key]);
      row.append(element('span', '', RATING_LABELS[key]), meter, element('strong', '', player.ratings[key])); ratings.append(row);
    }
    advanced.append(ratings);
    card.append(this.disclosure('Detailed skills & training choices', [advanced], `player-skills-${player.id}`));
    const contract = element('div');
    contract.append(element('p', 'fr-copy', `${money(player.contract.guaranteed)} is guaranteed: the team still owes part of the deal if you release this player.`));
    contract.append(element('p', 'fr-copy', `Renewal cost: ${money(this.franchise.quoteSalary(player), 2)} per season.`));
    contract.append(this.select('New contract length', [[1, '1 year'], [2, '2 years'], [3, '3 years'], [4, '4 years']], this.contractYears, value => { this.contractYears = Number(value); }, 'contract-years'));
    const actions = element('div', 'fr-inline-actions');
    actions.append(this.button('RENEW', () => this.run('renew', player.id, this.contractYears), '', this.matchActive || this.busy, `renew-${player.id}`), this.action('RELEASE', 'release', [player.id], 'fr-button-danger'));
    contract.append(actions, element('p', 'fr-footnote', 'Renew keeps a player on a new deal at the quoted cost. Release removes a player; guaranteed money can still reduce your budget. Keep enough healthy players for every position.'));
    card.append(this.disclosure('Contracts, renewals & releasing players', [contract], `player-contract-${player.id}`));
    return card;
  }

  renderMarket() {
    const f = this.franchise, content = element('div', 'fr-market-layout');
    const beginner = isBeginnerMode();
    const agents = this.card(beginner ? 'Available players' : 'Free agent market', `${(f.freeAgents || []).length} available`);
    if (beginner) agents.append(element('p', 'fr-copy', 'Optional: sign a player to add them to your team. Compare stars and yearly cost. A free agent is a player without a team; signing still costs a salary.'));
    agents.append(this.select('Contract length', [[1, '1 year'], [2, '2 years'], [3, '3 years'], [4, '4 years']], this.marketYears, value => { this.marketYears = Number(value); }, 'market-years'));
    const scroll = element('div', 'fr-table-scroll fr-market-scroll'), table = this.table(beginner ? ['Player', 'Ability', 'Could reach', 'Cost / season', ''] : ['Player', 'OVR / POT', 'Strengths', 'Annual salary', ''], 'Available free agents');
    for (const player of [...(f.freeAgents || [])].sort((a, b) => b.overall - a.overall)) {
      const row = element('tr'), name = element('td');
      const role = element('small', 'fr-player-role', `${beginner ? positionLabel(player) : player.specialty} · Age ${player.age}`); role.title = positionRole(player);
      name.append(element('strong', '', player.name), role); row.append(name);
      if (beginner) {
        for (const value of [player.overall, player.potential]) { const rating = element('td'); rating.append(this.stars(value)); row.append(rating); }
      } else row.append(element('td', 'fr-number', `${player.overall} / ${player.potential}`), element('td', 'fr-agent-strengths', this.strengths(player)));
      row.append(element('td', '', money(f.quoteSalary(player), 2)));
      const action = element('td'); action.append(this.button('SIGN', () => this.run('sign', player.id, this.marketYears), '', this.matchActive || this.busy, `sign-${player.id}`));
      row.append(action); table.tBodies[0].append(row);
    }
    scroll.append(table); agents.append(scroll); if (!(f.freeAgents || []).length) agents.append(this.empty('No free agents are currently available.'));
    agents.append(element('p', 'fr-footnote', beginner ? `The salary cap is your team's yearly spending limit. You have ${money(f.cap.space, 2)} left this season. Each signing also needs a free roster spot.` : 'All signings must fit under the salary cap and roster limit. Salary is quoted per season.'));
    content.append(agents);
    if (beginner) content.append(this.disclosure('Trade players with another team', [this.renderTrade()], 'trade-desk'));
    else content.append(this.renderTrade());
    const cap = this.card('Salary cap ledger', `Season ${f.year}`); cap.classList.add('fr-full-width');
    const ledger = element('div', 'fr-cap-ledger');
    for (const [label, value] of [['Salary cap', f.cap.limit], ['Player salaries', f.cap.payroll], ['Dead money', f.cap.deadMoney], ['Available space', f.cap.space]]) {
      const row = element('div'); row.append(element('span', '', label), element('strong', '', money(value))); ledger.append(row);
    }
    cap.append(ledger);
    if (beginner) {
      cap.append(element('p', 'fr-footnote', 'Dead money is money still owed after a player leaves. It also uses part of your yearly budget.'));
      const details = this.disclosure('Full budget breakdown', [cap], 'budget-details'); details.classList.add('fr-full-width'); content.append(details);
    } else content.append(cap);
    return content;
  }

  renderTrade() {
    const f = this.franchise, card = this.card('Trade desk', 'Player-for-player deals');
    const beginner = isBeginnerMode();
    if (beginner) card.append(element('p', 'fr-copy', 'A trade swaps one of your players for a player on another team. Both teams must accept the deal and fit their yearly budget.'));
    const clubs = f.league.filter(team => team.id !== f.teamId);
    const other = clubs.find(team => team.id === this.tradeTeamId) || clubs[0]; this.tradeTeamId = other?.id;
    const own = f.team.roster.find(player => player.id === this.tradeOwnId) || f.team.roster[0]; this.tradeOwnId = own?.id;
    const target = other?.roster.find(player => player.id === this.tradeTargetId) || other?.roster[0]; this.tradeTargetId = target?.id;
    const tradeLabel = player => beginner ? `${positionLabel(player)} · ${player.name} (${playerStars(player.overall)} stars)` : `${player.specialty} · ${player.name} (${player.overall})`;
    card.append(this.select('Your offer', f.team.roster.map(player => [player.id, tradeLabel(player)]), this.tradeOwnId, value => { this.tradeOwnId = value; this.render(); }, 'trade-own'));
    card.append(this.select('Trade partner', clubs.map(team => [team.id, fullName(team)]), this.tradeTeamId, value => { this.tradeTeamId = value; this.tradeTargetId = null; this.render(); }, 'trade-team'));
    card.append(this.select('Requested player', (other?.roster || []).map(player => [player.id, tradeLabel(player)]), this.tradeTargetId, value => { this.tradeTargetId = value; this.render(); }, 'trade-target'));
    if (own && target) {
      const terms = element('div', 'fr-trade-terms');
      terms.append(element('span', '', `Send ${beginner ? `${playerStars(own.overall)} stars` : `${own.overall} OVR`} · ${money(own.contract.annualSalary)}/yr`), element('span', '', `Receive ${beginner ? `${playerStars(target.overall)} stars` : `${target.overall} OVR`} · ${money(target.contract.annualSalary)}/yr`), element('strong', '', `${beginner ? 'Budget left after trade' : 'Projected cap space'}: ${money(f.cap.space + own.contract.annualSalary - target.contract.annualSalary)}`));
      card.append(terms, this.action('PROPOSE TRADE', 'trade', [own.id, other.id, target.id], 'fr-button-wide'));
    }
    card.append(element('p', 'fr-footnote', 'The other club evaluates age, potential, and player value. Both clubs must keep enough depth and fit the cap.'));
    return card;
  }

  renderDraft() {
    const f = this.franchise, content = element('div', 'fr-stack');
    const beginner = isBeginnerMode();
    const draftOpen = ['draft', 'offseason'].includes(f.phase);
    const draftYear = f.year + (f.phase === 'offseason' ? 1 : 0);
    const picks = f.draftPicksRemaining ?? 0;
    const rosterRoom = Math.max(0, ROSTER_LIMIT - f.team.roster.length);
    const banner = element('div', 'fr-draft-banner');
    banner.append(element('p', 'fr-eyebrow', `SEASON ${draftYear} / ROOKIE CLASS`), element('h3', '', draftOpen ? picks ? 'Build your team for the season ahead' : 'Draft complete. Your rookies are ready.' : 'Scout the next generation'));
    banner.append(element('p', 'fr-copy', draftOpen ? picks ? beginner ? 'The draft is where you choose 2 new players for your team. Compare what they do, their stars and yearly cost. Unsure who to pick? START SEASON chooses any remaining players within your budget for you.' : 'Choose your rookies before the season starts. Compare their position, current stars, potential, and cost. Each pick signs a three-year contract; only the annual salary counts against this season’s cap.' : 'Your selected rookies are on the roster. Review your team or start the season when you are ready.' : 'Each season begins with a new rookie draft. Your next class arrives after the championship.'));
    if (beginner) {
      const help = element('p', 'fr-copy fr-draft-help', 'Stars show current ability out of 5: more stars means a stronger player today. Potential is how good a player could become with training and experience. The salary cap is your yearly team budget. Only the cost per season uses this year’s budget; the 3-year total covers the full contract.');
      help.id = 'fr-draft-help'; banner.append(help);
    }
    if (draftOpen) {
      const summary = element('dl', 'fr-draft-summary');
      for (const [label, value] of [['Picks remaining', picks], [beginner ? 'Yearly budget left' : 'Available cap space', money(f.cap.space, 2)], [beginner ? 'Room for new players' : 'Roster spots available', rosterRoom]]) {
        const metric = element('div'); metric.append(element('dt', '', label), element('dd', '', value)); summary.append(metric);
      }
      const finish = element('div', 'fr-draft-finish');
      finish.append(this.action(f.phase === 'draft' ? 'START SEASON →' : 'START NEXT SEASON →', 'advanceOffseason', [], 'fr-button-primary'));
      finish.append(element('p', 'fr-footnote', picks ? 'Starting now automatically selects your remaining rookies within your budget. To choose every pick yourself, use the board below first.' : 'All picks used. Start the season to see your first matchup.'));
      banner.append(summary, finish);
    }
    content.append(banner);
    const board = this.card(beginner ? 'Choose your new players' : 'Prospect board', `${(f.prospects || []).length} ${beginner ? 'players available' : 'prospects'}`); board.classList.add('fr-draft-board');
    const scroll = element('div', 'fr-table-scroll fr-draft-scroll'), table = this.table(beginner ? ['Prospect', 'Position', 'Stars', 'Cost / season', '3-year total', 'Draft pick'] : ['Prospect', 'Position', 'Stars', 'OVR', 'Potential', 'Cost / season', '3-year total', 'Draft pick'], 'Rookie draft prospect board: position, current star rating, potential, and contract costs');
    for (const player of [...(f.prospects || [])].sort((a, b) => b.potential - a.potential || b.overall - a.overall)) {
      const annualSalary = f.quoteSalary(player, true);
      const row = element('tr'), name = element('td');
      row.dataset.prospectId = player.id;
      name.append(element('strong', '', player.name), element('small', 'fr-player-role', `Age ${player.age}`));
      if (beginner) {
        const ability = element('p', 'fr-footnote', `Current ability: ${player.overall}/99. Could reach: ${player.potential}/99 (${playerStars(player.potential)} stars). Improvement takes training and experience.`);
        name.append(this.disclosure('Potential & skills', [ability, element('small', 'fr-draft-strengths', this.strengths(player))], `prospect-${player.id}`));
      } else name.append(element('small', 'fr-draft-strengths', this.strengths(player)));
      const position = element('td', 'fr-draft-position', beginner ? positionLabel(player) : player.specialty || player.position);
      if (beginner) position.append(element('small', 'fr-player-role', positionRole(player)));
      else if (player.specialty && player.specialty !== player.position) position.append(element('small', 'fr-player-role', player.position));
      const stars = element('td'); stars.append(this.stars(player.overall));
      row.append(name, position, stars);
      if (!beginner) row.append(element('td', 'fr-number', player.overall), element('td', 'fr-potential', player.potential));
      row.append(element('td', 'fr-draft-salary', money(annualSalary, 2)), element('td', 'fr-draft-total', money(annualSalary * 3, 2)));
      const reason = !draftOpen ? 'Draft opens next season' : !picks ? 'All picks used' : !rosterRoom ? 'Roster full: release or trade a player' : annualSalary > f.cap.space ? `Need ${money(annualSalary - f.cap.space, 2)} more ${beginner ? 'yearly budget' : 'cap space'}` : '';
      const action = element('td', 'fr-draft-action');
      const button = this.action('DRAFT', 'draft', [player.id], '', Boolean(reason));
      button.setAttribute('aria-label', `Draft ${player.name}`);
      if (reason) {
        const reasonText = element('small', 'fr-draft-reason', reason); reasonText.id = `draft-reason-${player.id}`;
        button.setAttribute('aria-describedby', reasonText.id); action.append(button, reasonText);
      } else action.append(button);
      row.append(action); table.tBodies[0].append(row);
    }
    if ((f.prospects || []).length) { scroll.append(table); board.append(scroll); }
    else board.append(this.empty(draftOpen ? picks ? 'No prospects remain in this rookie class. Start the season when your roster is ready.' : 'Your draft is complete. Your new rookies are waiting in the Roster tab.' : 'The next rookie class will arrive before the next season begins.'));
    board.append(element('p', 'fr-footnote', beginner ? 'Pick any position you like. More stars helps now; higher potential can help in future seasons. New players keep the same yearly salary for all 3 seasons.' : 'Stars show current ability: 50 OVR = 1 star, 70 = 3 stars, 90+ = 5 stars, with half-star steps every 5 OVR. Potential is the player’s future OVR ceiling. Rookie costs are fixed for all three contract years.'));
    content.append(board); return content;
  }
}
