// Draft integration is covered by browser-franchise.mjs. Gameplay suites begin
// with auto-selected opening picks, then open the scheduled game through the UI.
export async function startFranchise(page) {
  // These suites cover the full playbook and sideline controls. Beginner mode
  // has its own integration coverage in browser-beginner.mjs.
  await page.locator('#beginner-mode').uncheck();
  await page.locator('#start-franchise').click();
  await page.evaluate(async () => {
    const { franchise, franchisePanel } = await import('/src/main.js');
    if (franchise.phase !== 'draft') throw new Error('A new franchise must begin with its opening draft.');
    await franchisePanel.run('advanceOffseason');
    if (franchise.phase !== 'regular' || !franchise.nextGame) throw new Error('The opening draft did not start the first season.');
  });
  await page.locator('#franchise-screen [data-focus="play-game"]').click();
}
