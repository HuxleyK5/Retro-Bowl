export async function pullPass(page, point) {
  await page.locator('#game').scrollIntoViewIfNeeded();
  const drag = await page.evaluate(async point => {
    const { play } = await import('/src/main.js');
    const { throwRange } = await import('/src/football/RatingEffects.js');
    const target = play.aim(point).target;
    const rect = document.querySelector('#game').getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    const scale = 180 / throwRange(play.qb.ratings);
    return {x,y,endX:x-(target.x-play.qb.x)*scale,endY:y-(target.y-play.qb.y)*scale};
  }, point);
  await page.mouse.move(drag.x,drag.y); await page.mouse.down();
  await page.mouse.move(drag.endX,drag.endY); await page.mouse.up();
}
