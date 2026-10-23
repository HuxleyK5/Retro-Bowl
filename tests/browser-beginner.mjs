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
  const mode = page.locator('#beginner-mode');
  const hub = page.locator('#franchise-screen');
  const render = () => page.evaluate(async () => (await import('/src/main.js')).loop.render());
  const layout = () => page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    (await import('/src/main.js')).loop.render();
  });
  const screenshot = async name => {
    // Redraw after capture sizing: resizing clears a canvas while the fixture's
    // animation loop is stopped, including full-page screenshot resizing.
    await layout();
    const originalViewport = page.viewportSize();
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: originalViewport.width, height: Math.max(originalViewport.height, height + 100) });
    await layout();
    await page.screenshot({ path: `test-results/${name}.png` });
    await page.setViewportSize(originalViewport);
    await layout();
  };
  const fit = async (width, label) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${label} fits ${width}px`);
  };

  await page.goto('http://127.0.0.1:5173');
  await expect(mode).toBeChecked();
  await page.locator('#football-basics summary').click();
  await expect(page.locator('#football-basics')).toContainText('You get four tries to gain 10 yards.');
  await expect(page.locator('#football-basics')).toContainText('A down means a try.');
  await page.locator('#football-basics summary').click();
  await mode.uncheck();
  assert.equal(await page.evaluate(() => localStorage.getItem('pocket-field.beginner.v1')), 'false');
  await page.reload();
  await expect(mode).not.toBeChecked();
  await mode.check();
  assert.equal(await page.evaluate(() => localStorage.getItem('pocket-field.beginner.v1')), 'true');
  await page.reload();
  await expect(mode).toBeChecked();

  // Follow the newcomer path with one chosen player and an automatic final pick.
  await page.locator('#start-franchise').click();
  await expect(hub).toBeVisible();
  await expect(hub.locator('.fr-draft-title')).toHaveText('DRAFT ROUND 1');
  await hub.locator('.fr-draft-info summary').click();
  await expect(hub.locator('#fr-draft-help')).toContainText('Pick 2 new players');
  await expect(hub.locator('#fr-draft-help')).toContainText('More stars means stronger ability');
  await expect(hub.locator('#fr-draft-help')).toContainText('yearly salary');
  await hub.locator('.fr-draft-info summary').click();
  await expect(hub.locator('.fr-draft-position').filter({ hasText: 'Quarterback' }).first()).toBeVisible();
  for (const width of [320, 390, 960]) await fit(width, 'beginner draft');
  await page.screenshot({ path: 'test-results/beginner-draft.png', fullPage: true });
  await hub.locator('.fr-prospect-card').first().click();
  await hub.locator('.fr-card-confirm').click();
  assert.equal(await page.evaluate(async () => (await import('/src/main.js')).franchise.draftPicksRemaining), 1);
  await hub.locator('[data-focus="advanceOffseason-"]').first().click();
  assert.equal(await page.evaluate(async () => (await import('/src/main.js')).franchise.phase), 'regular');
  await hub.locator('[data-focus="play-game"]').click();
  await expect(page.locator('#beginner-coach')).toBeVisible();
  await expect(page.locator('#beginner-goal')).toHaveText('Score more points than the other team.');
  await expect(page.locator('#beginner-tip')).toContainText('6 points');

  // Freeze a normal first-down situation to inspect play selection and help.
  await page.evaluate(async () => {
    const { match, state, loop } = await import('/src/main.js');
    loop.stop(); state.set('playing'); match.start(120, false); loop.render();
  });
  await expect(page.locator('#playbook')).toBeVisible();
  await expect(page.locator('#beginner-goal')).toHaveText('Gain 10 yards to the yellow line. Try 1 of 4.');
  await expect(page.locator('#beginner-tip')).toContainText('Then you get four new tries.');
  await expect(page.locator('#beginner-recommendation')).toContainText('Coach suggests:');
  await expect(page.locator('#down-distance')).toHaveText('TRY 1 OF 4 · 10 YD');
  assert.equal(await page.locator('#beginner-plays [data-play]').count(), 3);
  assert.equal(await page.locator('#playbook [data-play]').count(), 12);
  for (const id of ['slants', 'inside', 'go']) {
    const button = page.locator(`#beginner-plays [data-play="${id}"]`);
    await expect(button).toBeVisible();
    await expect(button.locator('strong')).toHaveText({ slants: 'Short pass', inside: 'Run through the middle', go: 'Long pass' }[id]);
    await button.click();
    await render();
    assert.equal(await page.evaluate(async () => (await import('/src/main.js')).play.call.id), id);
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  }

  const more = page.locator('#beginner-more-plays');
  await expect(more).not.toHaveAttribute('open', '');
  assert.equal(await more.locator('[data-play]').count(), 9);
  await expect(more.locator('[data-play="outs"]')).toBeHidden();
  await more.locator('summary').click();
  await expect(more.locator('[data-play="outs"]')).toBeVisible();
  await more.locator('[data-play="outs"]').click();
  assert.equal(await page.evaluate(async () => (await import('/src/main.js')).play.call.id), 'outs');
  await more.locator('summary').click();

  const advanced = page.locator('#beginner-strategy-options');
  await expect(advanced).not.toHaveAttribute('open', '');
  await expect(page.locator('#strategy-formation')).toBeHidden();
  await advanced.locator('summary').click();
  await expect(page.locator('#strategy-formation')).toBeVisible();
  await advanced.locator('summary').click();
  for (const width of [320, 390, 540, 960, 1440]) { await fit(width, 'beginner match'); await render(); }
  await fit(390, 'beginner match');
  await screenshot('beginner-match-mobile');

  // Switching modes updates the mounted controls immediately.
  await mode.uncheck();
  await render();
  await expect(page.locator('#beginner-coach')).toBeHidden();
  await expect(page.locator('#strategy-formation')).toBeVisible();
  await expect(page.locator('#call-formation')).toBeVisible();
  await expect(page.locator('#call-fit')).toBeVisible();
  assert.equal(await page.locator('#playbook [data-play]:visible').count(), 12);
  await expect(more.locator('summary')).toBeHidden();
  await expect(advanced.locator('summary')).toBeHidden();
  await mode.check();
  await render();
  await expect(page.locator('#beginner-coach')).toBeVisible();
  await expect(page.locator('#strategy-formation')).toBeHidden();
  assert.equal(await page.locator('#playbook [data-play]:visible').count(), 3);

  await page.evaluate(async () => {
    const { match, loop } = await import('/src/main.js');
    match.rules.newSeries(75); match.rules.down = 4; match.prepare(); loop.render();
  });
  await expect(page.locator('#beginner-goal')).toContainText('Try 4 of 4.');
  await expect(page.locator('#beginner-tip')).toContainText('Last try!');
  await expect(page.locator('#beginner-recommendation')).toContainText('kick for 3 points');
  await expect(page.locator('#field-goal')).toContainText('KICK FOR 3');

  const clocks = () => page.evaluate(async () => {
    const { match, state } = await import('/src/main.js');
    return { mode: state.mode, clock: match.rules.clock, playClock: match.rules.playClock };
  });
  await page.evaluate(async () => (await import('/src/main.js')).match.rules.clockRunning = true);
  const running = await clocks();
  await page.evaluate(async () => (await import('/src/main.js')).loop.update(.25));
  const advancedClocks = await clocks();
  assert.ok(advancedClocks.clock < running.clock && advancedClocks.playClock < running.playClock);
  await page.locator('#football-basics summary').focus();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await clocks()).mode).toBe('paused');
  await expect(page.locator('#football-basics summary')).toBeFocused();
  const paused = await clocks();
  await page.evaluate(async () => {
    const { loop } = await import('/src/main.js');
    for (let i = 0; i < 120; i++) loop.update(1 / 60);
    loop.render();
  });
  assert.deepEqual(await clocks(), paused, 'reading How to play freezes both clocks');
  await page.locator('#football-basics summary').click();
  assert.deepEqual(await clocks(), paused, 'closing help leaves the game paused');
  await page.locator('#resume').click();
  await expect.poll(async () => (await clocks()).mode).toBe('playing');

  assert.deepEqual(errors, []);
  console.log('PASS: beginner mode enabled by default, persistent mode choices, guided draft and automatic remaining pick, full position names, plain contextual coach, three simple plays, optional full playbook and football controls, mobile fit, live expert switch, help pauses both clocks until explicit resume, zero browser errors.');
} finally { await browser.close(); }
