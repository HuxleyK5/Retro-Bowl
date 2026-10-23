import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto('http://127.0.0.1:5173');
  await page.locator('#start-franchise').click();
  const screen = page.locator('.fr-draft-screen');
  const snapshot = () => page.evaluate(async () => {
    const { franchise: f } = await import('/src/main.js');
    return { picks: f.draftPicksRemaining, space: f.cap.space, size: f.team.roster.length,
      prospects: f.prospects.map(p => ({ id: p.id, name: p.name, salary: f.quoteSalary(p, true) })) };
  });
  const before = await snapshot();
  await expect(screen.locator('.fr-draft-title')).toHaveText('DRAFT ROUND 1');
  const pageCount = Math.ceil(before.prospects.length / 10);
  await expect(screen.locator('.fr-draft-page')).toHaveText(`PAGE 1 / ${pageCount}`);
  assert.equal(await screen.locator('.fr-prospect-card').count(), 10);
  const firstPageIds = await screen.locator('.fr-prospect-card').evaluateAll(cards => cards.map(card => card.dataset.prospectId));
  await screen.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(screen.locator('.fr-draft-page')).toHaveText(`PAGE 2 / ${pageCount}`);
  const secondPageIds = await screen.locator('.fr-prospect-card').evaluateAll(cards => cards.map(card => card.dataset.prospectId));
  assert.ok(secondPageIds.every(id => !firstPageIds.includes(id)), 'browsing shows different players');
  assert.equal((await snapshot()).picks, 2, 'browsing does not spend a pick');
  await screen.getByRole('button', { name: 'Previous page', exact: true }).click();
  const card = screen.locator('.fr-prospect-card').first();
  const chosenId = await card.getAttribute('data-prospect-id');
  const chosen = before.prospects.find(p => p.id === chosenId);
  await card.focus(); await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await expect(screen.locator('.fr-draft-selection')).toContainText(chosen.name);
  await expect(screen.locator('.fr-draft-selection')).toContainText('total for 3 years');
  assert.equal((await snapshot()).picks, 2, 'selecting a card does not sign a contract');
  await page.screenshot({ path: 'test-results/draft-cards-desktop.png', fullPage: true });

  const originalCharge = await page.evaluate(async () => {
    const { franchise: f, franchisePanel: panel } = await import('/src/main.js');
    const original = f.deadMoney[f.teamId];
    f.deadMoney[f.teamId] = f.cap.limit - f.cap.payroll; panel.render(); return original;
  });
  await expect(screen.locator('.fr-card-confirm')).toBeDisabled();
  await expect(screen.locator('.fr-draft-reason')).toContainText('more yearly budget');
  await page.evaluate(async original => {
    const { franchise: f, franchisePanel: panel } = await import('/src/main.js');
    f.deadMoney[f.teamId] = original; panel.render();
  }, originalCharge);
  await screen.locator('.fr-card-confirm').click();
  const after = await snapshot();
  assert.equal(after.picks, 1); assert.equal(after.space, before.space - chosen.salary);
  assert.equal(after.size, before.size + 1);
  await expect(screen.locator('.fr-draft-title')).toHaveText('DRAFT ROUND 2');
  assert.ok(!after.prospects.some(p => p.id === chosenId));
  await page.reload(); await page.locator('#continue-franchise').click();
  assert.equal((await snapshot()).picks, 1, 'confirmed pick survives reload');
  await screen.locator('[data-focus="draft-roster"]').click();
  await expect(page.locator('#franchise-screen')).toContainText(chosen.name);
  await page.locator('[data-focus="open-draft"]').click();
  for (const width of [320, 390, 738, 960, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `cards fit ${width}px`);
  }
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.screenshot({ path: 'test-results/draft-cards-mobile.png', fullPage: true });
  await screen.locator('.fr-prospect-card').first().click();
  await expect(screen.locator('.fr-draft-selection h3')).toBeFocused();
  assert.ok(await screen.locator('.fr-card-confirm').evaluate(button => {
    const rect = button.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= innerHeight;
  }), 'selecting a card brings its confirmation into view on mobile');
  await screen.locator('[data-focus="draft-back-to-cards"]').click();
  await expect(screen.locator('.fr-prospect-card').first()).toBeFocused();
  await screen.locator('.fr-prospect-card').first().click();
  await screen.locator('.fr-card-confirm').click();
  await expect(screen.locator('.fr-draft-title')).toHaveText('DRAFT COMPLETE');
  await expect(screen.locator('.fr-draft-start')).toContainText('START SEASON');
  await screen.locator('.fr-draft-start').click();
  await expect(page.locator('[data-focus="play-game"]')).toBeVisible();
  assert.deepEqual(errors, []);
  console.log('PASS: ten-card pages, keyboard selection, explicit draft confirmation, real salary charge, unaffordable picks, round progression, saved picks, roster navigation, mobile layout and season start.');
} finally { await browser.close(); }
