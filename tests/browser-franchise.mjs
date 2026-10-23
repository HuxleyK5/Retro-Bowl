import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto('http://127.0.0.1:5173');
  await page.locator('#beginner-mode').uncheck();
  await page.locator('[data-team="cgl-08"]').click();
  await page.locator('#start-franchise').click();
  const hub = page.locator('#franchise-screen');
  await expect(hub).toBeVisible();

  const snapshot = () => page.evaluate(async () => {
    const { franchise: f } = await import('/src/main.js');
    return { year: f.year, week: f.week, phase: f.phase, cap: f.cap, roster: f.team.roster.map(p => p.toJSON()),
      record: f.standings.find(r => r.teamId === f.teamId), history: f.history, nextId: f.nextGame?.id,
      played: f.schedule.filter(g => g.homeScore !== null).length, picks: f.draftPicksRemaining,
      prospects: f.prospects.map(p => ({ id: p.id, name: p.name, position: p.specialty, salary: f.quoteSalary(p, true) })) };
  });
  const opening = await snapshot();
  assert.equal(opening.phase, 'draft');
  assert.equal(opening.picks, 2);
  await expect(hub.locator('.fr-draft-title')).toHaveText('DRAFT ROUND 1');
  assert.equal(await hub.locator('[data-focus="play-game"]').count(), 0, 'opening draft comes before kickoff');
  assert.equal(await hub.locator('[data-focus="simulateWeek-"]').count(), 0, 'cannot skip draft by simulating');
  assert.equal(await hub.locator('.fr-prospect-card').count(), 10);
  const money = value => `$${(value / 1000000).toFixed(2)}M`;
  const visibleIds = await hub.locator('.fr-prospect-card').evaluateAll(cards => cards.slice(0, 5).map(card => card.dataset.prospectId));
  for (const prospect of opening.prospects.filter(p => visibleIds.includes(p.id))) {
    const row = hub.locator(`[data-prospect-id="${prospect.id}"]`);
    await expect(row).toHaveAttribute('aria-label', new RegExp(`\\(${prospect.position}\\)`));
    await expect(row.locator('.fr-star-rating')).toHaveAttribute('aria-label', /^(?:0\.5|[1-4](?:\.[05])?|5(?:\.0)?) out of 5 stars$/);
    await expect(row.locator('.fr-draft-salary')).toContainText(money(prospect.salary));
    await row.click();
    await expect(hub.locator('.fr-draft-selection .fr-draft-total')).toContainText(money(prospect.salary * 3));
  }
  for (const width of [390, 960, 1440]) {
    await page.setViewportSize({ width, height: 1100 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `opening draft fits ${width}px`);
  }
  // Quotes and disabled actions must reflect the actual available salary cap.
  const originalDeadMoney = await page.evaluate(async () => {
    const { franchise: f, franchisePanel: panel } = await import('/src/main.js');
    const original = f.deadMoney[f.teamId];
    f.deadMoney[f.teamId] = f.cap.limit - f.cap.payroll;
    panel.render(); return original;
  });
  await expect(hub.locator('.fr-card-confirm')).toBeDisabled();
  await page.evaluate(async original => {
    const { franchise: f, franchisePanel: panel } = await import('/src/main.js');
    f.deadMoney[f.teamId] = original; panel.render();
  }, originalDeadMoney);
  await hub.locator('.fr-prospect-card').first().click();
  const firstPickId = await hub.locator('.fr-card-confirm').getAttribute('data-focus');
  const firstPick = opening.prospects.find(p => `draft-${p.id}` === firstPickId);
  await hub.locator(`[data-focus="${firstPickId}"]`).click();
  const picked = await snapshot();
  assert.equal(picked.picks, 1);
  assert.equal(picked.roster.length, opening.roster.length + 1);
  assert.equal(picked.cap.space, opening.cap.space - firstPick.salary);
  assert.equal(picked.roster.find(p => p.id === firstPick.id).contract.yearsRemaining, 3);
  await page.reload(); await page.locator('#continue-franchise').click();
  await expect(hub.locator('.fr-draft-title')).toHaveText('DRAFT ROUND 2');
  assert.equal((await snapshot()).picks, 1, 'in-progress opening draft survives reload');
  assert.ok((await snapshot()).roster.some(p => p.id === firstPick.id));
  assert.equal(await hub.locator(`[data-prospect-id="${firstPick.id}"]`).count(), 0, 'selected player leaves the prospect board');
  await hub.locator('.fr-prospect-card').first().click();
  await hub.locator('.fr-card-confirm').click();
  assert.equal((await snapshot()).picks, 0);
  await page.screenshot({ path: 'test-results/franchise-opening-draft.png', fullPage: true });
  await hub.locator('[data-focus="advanceOffseason-"]').first().click();
  assert.equal((await snapshot()).phase, 'regular');
  assert.equal((await snapshot()).year, 1, 'opening draft starts the first season without advancing a year');
  assert.equal((await snapshot()).played, 0);
  assert.equal(await hub.locator('caption').filter({ hasText: 'League standings' }).locator('..').locator('tbody tr').count(), 32);
  await page.screenshot({ path: 'test-results/franchise-overview.png', fullPage: true });
  const initial = await snapshot();
  await hub.locator('#fr-tab-roster').click();
  const trainee = initial.roster.filter(p => p.position === 'QB')[1];
  await hub.locator(`[data-focus="player-${trainee.id}"]`).click();
  await hub.locator('[data-focus="training-focus"]').selectOption('accuracy');
  await hub.locator(`[data-focus="train-${trainee.id}"]`).click();
  let trained = (await snapshot()).roster.find(p => p.id === trainee.id);
  assert.equal(trained.ratings.accuracy, trainee.ratings.accuracy + 1);
  assert.equal(trained.fatigue, 16);
  await expect(hub.locator(`[data-focus="train-${trainee.id}"]`)).toBeDisabled();
  await hub.locator(`[data-focus="release-${trainee.id}"]`).click();
  assert.ok(!(await snapshot()).roster.some(p => p.id === trainee.id));
  assert.ok((await snapshot()).cap.deadMoney > 0);

  await hub.locator('#fr-tab-market').click();
  const beforeSign = (await snapshot()).roster.length;
  const sign = hub.locator('[data-focus^="sign-"]').first();
  await sign.click();
  assert.equal((await snapshot()).roster.length, beforeSign + 1);
  const trade = await page.evaluate(async () => {
    const { franchise: f } = await import('/src/main.js');
    const own = f.team.roster.filter(p => p.position === 'RB').sort((a,b) => b.overall-a.overall)[0];
    const other = f.league.find(t => t.id !== f.teamId);
    const target = other.roster.filter(p => p.position === 'RB').sort((a,b) => a.overall-b.overall)[0];
    return { own: own.id, team: other.id, target: target.id };
  });
  await hub.locator('[data-focus="trade-own"]').selectOption(trade.own);
  await hub.locator('[data-focus="trade-team"]').selectOption(trade.team);
  await hub.locator('[data-focus="trade-target"]').selectOption(trade.target);
  await hub.locator(`[data-focus="trade-${trade.own}"]`).click();
  assert.ok((await snapshot()).roster.some(p => p.id === trade.target));
  await page.reload();
  await page.locator('#continue-franchise').click();
  await expect(hub).toBeVisible();
  assert.ok((await snapshot()).roster.some(p => p.id === trade.target), 'transactions survive reload');

  // Real Play construction must select a healthy backup, using the persistent roster record.
  const injuredId = await page.evaluate(async () => {
    const { franchise: f } = await import('/src/main.js');
    const qb = f.team.roster.filter(p => p.position === 'QB').sort((a,b) => b.overall-a.overall)[0];
    qb.injury = { name: 'Ankle sprain', weeksRemaining: 2 };
    return qb.id;
  });
  await hub.locator('[data-focus="play-game"]').click();
  await page.evaluate(async injuredId => {
    const { play, match, loop } = await import('/src/main.js');
    assertHealthy(); function assertHealthy() { if (play.qb.data.id === injuredId || play.qb.data.injury) throw new Error('Injured QB entered lineup'); }
    loop.stop(); match.start(60, false); loop.render();
  }, injuredId);
  await page.locator('#franchise-toggle').click();
  await expect(hub.locator('[data-focus="simulateWeek-"]')).toBeDisabled();
  await expect(hub.locator('[data-focus="play-game"]')).toContainText('RESUME');
  await hub.locator('[data-focus="play-game"]').click();
  await page.evaluate(async () => {
    const { match, loop } = await import('/src/main.js');
    Object.assign(match.rules, { phase: 'final', score: { home: 28, away: 7 }, quarter: 4 });
    match.rules.byQuarter = { home: [7,7,7,7], away: [0,0,0,7] };
    loop.render(); loop.render();
  });
  assert.equal((await snapshot()).record.wins, 1);
  assert.equal((await snapshot()).played, 16, 'one final advances all sixteen fixtures, exactly once');
  await page.locator('#screen-action').click();
  await expect(hub).toBeVisible();
  assert.equal((await snapshot()).week, 2);

  await hub.locator('#fr-tab-roster').click();
  await page.screenshot({ path: 'test-results/franchise-roster.png', fullPage: true });
  for (const width of [390, 540, 960, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const tab of ['overview', 'roster', 'market', 'draft']) {
      await hub.locator(`#fr-tab-${tab}`).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${tab} fits ${width}px`);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  await hub.locator('#fr-tab-overview').click();
  for (let i = 0; i < 14 && (await snapshot()).phase !== 'offseason'; i++) {
    const before = await snapshot();
    await hub.locator('[data-focus="simulateWeek-"]').click();
    const after = await snapshot();
    assert.notEqual(after.week, before.week, `week ${before.week} advances`);
  }
  const offseason = await snapshot();
  assert.equal(offseason.phase, 'offseason');
  assert.equal(offseason.history.length, 1);
  assert.equal(offseason.played, 199);
  await expect(hub.locator('.fr-draft-title')).toHaveText('DRAFT ROUND 1');
  await expect(hub.locator('.fr-draft-season-note')).toContainText('SEASON 2');
  await page.screenshot({ path: 'test-results/franchise-championship.png', fullPage: true });
  const rosterCount = offseason.roster.length;
  await hub.locator('.fr-prospect-card').first().click();
  await hub.locator('.fr-card-confirm').click();
  assert.equal((await snapshot()).roster.length, rosterCount + 1);
  await page.screenshot({ path: 'test-results/franchise-draft.png', fullPage: true });
  await hub.locator('[data-focus="advanceOffseason-"]').first().click();
  const next = await snapshot();
  assert.equal(next.year, 2); assert.equal(next.week, 1);
  assert.equal(next.phase, 'regular'); assert.equal(next.record.wins, 0);
  assert.equal(next.history.length, 1);
  await page.reload(); await page.locator('#continue-franchise').click();
  assert.equal((await snapshot()).year, 2); assert.equal((await snapshot()).history.length, 1);

  // Browser storage denial must preserve the current session through club selection.
  const memoryPage = await browser.newPage();
  memoryPage.on('pageerror', error => errors.push(error.message));
  await memoryPage.addInitScript(() => {
    Storage.prototype.setItem = function () { throw new DOMException('Storage denied', 'SecurityError'); };
  });
  await memoryPage.goto('http://127.0.0.1:5173');
  await memoryPage.locator('#beginner-mode').uncheck();
  await memoryPage.locator('#start-franchise').click();
  const memoryHub = memoryPage.locator('#franchise-screen');
  await memoryHub.locator('[data-focus="draft-roster"]').click();
  await memoryHub.locator('#fr-tab-market').click();
  await memoryHub.locator('[data-focus^="sign-"]').first().click();
  await expect(memoryHub.locator('[role="alert"]')).toContainText('could not be saved');
  const signedIds = await memoryPage.evaluate(async () => (await import('/src/main.js')).franchise.team.roster.map(p => p.id));
  await memoryHub.locator('[data-focus="club-selection"]').click();
  await expect(memoryPage.locator('#continue-franchise')).toBeVisible();
  await memoryPage.locator('#continue-franchise').click();
  assert.deepEqual(await memoryPage.evaluate(async () => (await import('/src/main.js')).franchise.team.roster.map(p => p.id)), signedIds);
  await memoryPage.close();
  assert.deepEqual(errors, []);
  console.log('PASS: opening draft, positions/star ratings/contract costs, unaffordable picks, saved draft progress, roster training, cap/dead money, signing/trading, saved transactions, healthy backup in live lineup, midgame lock/resume, one final updates standings, 12-week season, playoffs/championship, next-season draft, year two, mobile layouts, zero browser errors.');
} finally { await browser.close(); }
