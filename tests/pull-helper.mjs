export async function pullPass(page, point) {
  await page.locator('#game').scrollIntoViewIfNeeded();
  const drag = await page.evaluate(async point => {
    const { play, camera } = await import('/src/main.js');
    const { throwRange } = await import('/src/football/RatingEffects.js');
    const target = play.aim(point).target;
    const rect = document.querySelector('#game').getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    const dx=target.x-play.qb.x,dy=target.y-play.qb.y;
    const power=Math.hypot(dx,dy)*180/throwRange(play.qb.ratings);
    const sx=dx*camera.view.horizontalZoom,sy=dy*camera.view.zoom,length=Math.hypot(sx,sy)||1;
    return {x,y,endX:x-sx/length*power,endY:y-sy/length*power};
  }, point);
  await page.mouse.move(drag.x,drag.y); await page.mouse.down();
  await page.mouse.move(drag.endX,drag.endY); await page.mouse.up();
}
