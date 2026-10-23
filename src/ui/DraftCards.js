import { ROSTER_LIMIT } from '../data/FranchiseMode.js';
import { positionLabel, positionRole } from '../data/FootballTerms.js';
import { playerStars } from '../data/PlayerStars.js';

const PAGE_SIZE = 10;
const money = value => `$${(value / 1000000).toFixed(2).replace(/\.00$/, '')}M`;
const node = (tag, className, text) => {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
};

// Original, code-drawn portraits stay sharp at every card size and need no downloads.
function portrait(player, defense) {
  let seed = 0;
  for (const letter of player.id) seed = (Math.imul(seed, 31) + letter.charCodeAt(0)) >>> 0;
  const skin = ['#f2c59f', '#ce946e', '#9f6348', '#754735'][seed % 4];
  const hair = ['#302821', '#704731', '#d8b565', '#171c25'][(seed >>> 3) % 4];
  const jersey = defense ? '#b93049' : '#edf7ff';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 48 44'); svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'fr-card-portrait'); svg.setAttribute('shape-rendering', 'crispEdges');
  svg.innerHTML = `<path fill="#ffffff20" d="M0 32h48v12H0zM3 24h7v8H3zM39 19h6v13h-6z"/>
    <path fill="${skin}" d="M19 9h12v13H19zM21 22h8v6h-8zM9 29h6v12H9zM35 29h6v12h-6z"/>
    <path fill="${hair}" d="M19 6h11v3h3v8h-3v-5H19v5h-3V9h3z"/>
    <path fill="#232c42" d="M21 15h2v2h-2zM27 15h2v2h-2z"/>
    <path fill="#ac715b" d="M23 20h5v1h-5z"/>
    <path fill="${jersey}" d="M16 26h6v3h7v-3h6v5h3v5h-5v8H17v-8h-5v-5h4z"/>
    <path fill="${defense ? '#f3d376' : '#3482ba'}" d="M17 27h3v17h-3zM30 27h3v17h-3z"/>
    <text x="25" y="40" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="${defense ? '#fff3ce' : '#315274'}">${Number(player.number)}</text>`;
  return svg;
}

export function renderDraftCards(panel) {
  const f = panel.franchise;
  const picks = f.draftPicksRemaining;
  const year = f.year + (f.phase === 'offseason' ? 1 : 0);
  const players = [...f.prospects].sort((a, b) => b.overall - a.overall || b.potential - a.potential || a.id.localeCompare(b.id));
  const pages = Math.max(1, Math.ceil(players.length / PAGE_SIZE));
  panel.draftPage = Math.max(0, Math.min(panel.draftPage || 0, pages - 1));
  const visible = players.slice(panel.draftPage * PAGE_SIZE, (panel.draftPage + 1) * PAGE_SIZE);
  const selected = players.find(player => player.id === panel.draftSelectedId);
  const locked = panel.busy || panel.matchActive;
  const reason = player => !picks ? 'All picks used. Start the season when you are ready.' : f.team.roster.length >= ROSTER_LIMIT ? 'Your team is full. Open My team to release a player first.' : f.quoteSalary(player, true) > f.cap.space ? `You need ${money(f.quoteSalary(player, true) - f.cap.space)} more yearly budget.` : '';

  const screen = node('section', 'fr-draft-screen'); screen.setAttribute('aria-labelledby', 'draft-title');
  const top = node('header', 'fr-draft-top');
  const club = node('span', 'fr-draft-club', f.team.abbreviation); club.title = `${f.team.city} ${f.team.name}`;
  const title = node('h2', 'fr-draft-title', picks ? `DRAFT ROUND ${Math.min(2, 3 - picks)}` : 'DRAFT COMPLETE');
  title.id = 'draft-title'; title.tabIndex = -1;
  const help = node('details', 'fr-draft-info');
  help.dataset.frDetails = 'draft-info'; help.open = panel.openDetails.has('draft-info');
  help.append(node('summary', '', 'How to pick'));
  const helpCopy = node('p', '', 'Pick 2 new players for your team. More stars means stronger ability today. The position tells you their job. The price is their yearly salary; it must fit your budget. Unsure? Let Auto-pick & start choose your remaining players.');
  helpCopy.id = 'fr-draft-help'; help.append(helpCopy);
  top.append(club, title, help);
  screen.append(top, node('p', 'fr-draft-instruction', picks ? 'Choose a card. Check their role, stars and price. Draft your favorite.' : 'Your new players are on the team. You are ready to play!'));

  if (panel.notice) {
    const notice = node('p', `fr-draft-notice${panel.noticeError ? ' is-error' : ''}`, panel.notice);
    notice.setAttribute('role', panel.noticeError ? 'alert' : 'status'); screen.append(notice);
  }

  const pager = node('nav', 'fr-draft-pager'); pager.setAttribute('aria-label', 'Browse draft players');
  const changePage = amount => { panel.draftPage += amount; panel.draftSelectedId = null; panel.render(); };
  const previous = panel.button('◀', () => changePage(-1), 'fr-draft-arrow', panel.draftPage === 0, 'draft-page-previous');
  previous.setAttribute('aria-label', 'Previous page');
  const page = node('span', 'fr-draft-page', `PAGE ${panel.draftPage + 1} / ${pages}`); page.setAttribute('aria-live', 'polite');
  const next = panel.button('▶', () => changePage(1), 'fr-draft-arrow', panel.draftPage >= pages - 1, 'draft-page-next');
  next.setAttribute('aria-label', 'Next page'); pager.append(previous, page, next); screen.append(pager);

  const board = node('div', 'fr-draft-board fr-draft-grid'); board.setAttribute('aria-label', 'Available players');
  for (const player of visible) {
    const salary = f.quoteSalary(player, true), unavailable = reason(player);
    const defense = player.position === 'DEF';
    const card = panel.button('', () => {
      panel.draftSelectedId = player.id; panel.render();
      const details = panel.root.querySelector('.fr-draft-selection');
      details.querySelector('h3')?.focus({ preventScroll: true });
      details.scrollIntoView({ block: 'nearest' });
    }, `fr-prospect-card${defense ? ' is-defense' : ''}${unavailable ? ' is-unavailable' : ''}`, locked || !picks, `prospect-${player.id}`);
    card.dataset.prospectId = player.id;
    card.setAttribute('aria-pressed', String(selected?.id === player.id));
    card.setAttribute('aria-label', `${player.name}, ${positionLabel(player)}, ${playerStars(player.overall)} stars, ${money(salary)} per year. ${unavailable || 'Select player.'}`);
    const art = node('span', 'fr-card-art');
    art.append(node('span', 'fr-card-position-code', player.specialty || player.position), portrait(player, defense));
    const body = node('span', 'fr-card-body');
    body.append(node('strong', 'fr-card-name', player.name.split(' ').at(-1)), node('span', 'fr-draft-position', positionLabel(player).replace(/ \(.+\)$/, '')), panel.stars(player.overall), node('strong', 'fr-draft-salary', money(salary)), node('small', 'fr-card-cost-label', 'per year'));
    if (unavailable && picks) body.append(node('small', 'fr-card-budget-warning', salary > f.cap.space ? 'Over budget' : 'Team full'));
    card.append(art, body); board.append(card);
  }
  if (!visible.length) board.append(node('p', 'fr-draft-empty', 'No players remain in this draft.'));
  screen.append(board);

  const selection = node('section', 'fr-draft-selection'); selection.setAttribute('aria-label', 'Selected player');
  if (selected && picks) {
    const info = node('div');
    info.append(node('h3', '', selected.name), node('p', '', `${positionLabel(selected)} · ${positionRole(selected)}`));
    info.querySelector('h3').tabIndex = -1;
    const contract = node('p', 'fr-card-contract');
    contract.append(node('span', '', `${money(f.quoteSalary(selected, true))} per year · `), node('span', 'fr-draft-total', `${money(f.quoteSalary(selected, true) * 3)} total for 3 years`)); info.append(contract);
    const unavailable = reason(selected);
    if (unavailable) { const warning = node('p', 'fr-draft-reason', unavailable); warning.id = 'draft-selection-reason'; info.append(warning); }
    const draft = panel.action('DRAFT PLAYER', 'draft', [selected.id], 'fr-card-confirm', Boolean(unavailable));
    draft.setAttribute('aria-label', `Draft ${selected.name}`);
    if (unavailable) draft.setAttribute('aria-describedby', 'draft-selection-reason');
    const actions = node('div', 'fr-draft-selection-actions');
    const back = panel.button('CHOOSE ANOTHER', () => {
      panel.draftSelectedId = null; panel.render();
      const card = [...panel.root.querySelectorAll('.fr-prospect-card')].find(item => item.dataset.prospectId === selected.id);
      card?.focus({ preventScroll: true }); card?.scrollIntoView({ block: 'nearest' });
    }, 'fr-card-back', locked, 'draft-back-to-cards');
    actions.append(draft, back); selection.append(info, actions);
  } else selection.append(node('p', '', picks ? 'Tap a player card to learn what they do.' : 'All picks used. Press Start season to see your first game.'));
  screen.append(selection);

  const footer = node('footer', 'fr-draft-footer');
  const budget = node('div', 'fr-draft-budget');
  budget.append(node('span', '', `YEARLY BUDGET ${money(f.cap.payroll + f.cap.deadMoney)} / ${money(f.cap.limit)}`));
  const meter = node('meter', ''); meter.min = 0; meter.max = f.cap.limit; meter.value = f.cap.payroll + f.cap.deadMoney; meter.setAttribute('aria-label', 'Yearly salary budget used');
  budget.append(meter, node('small', 'fr-draft-budget-left', `${money(f.cap.space)} left to spend`));
  const roster = panel.button('MY TEAM', () => { panel.tab = 'roster'; panel.render(); }, 'fr-draft-roster', false, 'draft-roster');
  const counter = node('div', 'fr-draft-picks'); counter.append(node('span', '', 'PICKS LEFT'), node('strong', '', String(picks)));
  const start = panel.action(picks ? 'AUTO-PICK & START →' : 'START SEASON →', 'advanceOffseason', [], 'fr-draft-start');
  start.title = picks ? 'Choose remaining players automatically, then start the season.' : 'Finish the draft and start playing.';
  footer.append(budget, roster, counter, start); screen.append(footer);
  screen.append(node('p', 'fr-draft-season-note', `SEASON ${year} · Progress saves automatically`));
  return screen;
}
