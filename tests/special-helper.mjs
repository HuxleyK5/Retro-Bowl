// The UI still receives the actual button clicks. Pin the meter clock for deterministic timing assertions.
export async function lockMeter(page,power=1,accuracy=0){
 await page.locator('#kick-lock').waitFor({state:'visible'});
 await page.evaluate(async power=>{const{match,loop}=await import('/src/main.js');loop.stop();match.meter.elapsed=power/.85;loop.render()},power);
 await page.locator('#kick-lock').click();
 await page.evaluate(async accuracy=>{const{match,loop}=await import('/src/main.js');match.meter.elapsed=(accuracy+1)/2/1.15;loop.render()},accuracy);
 await page.locator('#kick-lock').click();
 await page.evaluate(async()=>{(await import('/src/main.js')).loop.start()});
}
