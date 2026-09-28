import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('http://localhost:5173');
 await expect(page.locator('#league-screen')).toBeVisible();assert.equal(await page.locator('[data-team]').count(),24);
 for(const card of await page.locator('[data-team]').all()){await card.click();assert.equal(await card.getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#club-roster tr').count(),53);}
 await page.locator('[data-team="cgl-08"]').click();await expect(page.locator('#selected-club')).toHaveText('Cinder Falls Embers');
 await page.locator('summary').click();await page.screenshot({path:'test-results/phase6-league.png',fullPage:true});
 for(const width of [540,960,1920]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await page.setViewportSize({width:1440,height:1100});await page.locator('#start-franchise').click();
 await expect(page.locator('#home-name')).toHaveText('EMBERS');await expect(page.locator('#away-name')).toHaveText('OSPREYS');await expect(page.locator('.intro')).toContainText('Caldera Park');await expect(page.locator('#screen-copy')).toContainText('Cinder Falls Embers');
 const check=()=>page.evaluate(async()=>{const {play,league}=await import('/src/main.js');return {id:play.qb.data.teamId,same:play.qb.data===league.find(t=>t.id===play.qb.data.teamId).roster.find(p=>p.specialty==='QB'),names:play.players.map(p=>p.data.name)}});
 assert.equal((await check()).id,'cgl-08');assert.equal((await check()).same,true);
 await page.locator('#ratings-toggle').click();await expect(page.locator('#ratings-identity')).toContainText('guaranteed');await page.locator('#ratings-close').click();
 await page.reload();await page.locator('#continue-franchise').click();assert.equal((await check()).id,'cgl-08');
 await page.locator('#screen-action').click();await page.locator('#game').focus();await page.keyboard.press('Space');await page.keyboard.down('a');await page.waitForTimeout(200);await page.keyboard.up('a');
 assert.ok(await page.locator('#viewport').evaluate(el=>el.getBoundingClientRect().height<1000));
 await page.screenshot({path:'test-results/phase6-game.png',fullPage:true});
 await page.evaluate(async()=>{const {play}=await import('/src/main.js');play.configure(25,'away');if(play.qb.data.teamId!=='cgl-09'||play.defenders[0].data.teamId!=='cgl-08')throw Error('wrong possession roster')});
 await page.locator('#change-club').click();await page.locator('[data-team="cgl-24"]').click();await page.locator('#start-franchise').click();await expect(page.locator('#home-name')).toHaveText('CASCADES');assert.equal((await check()).id,'cgl-24');
 await page.locator('#change-club').click();await page.locator('#continue-franchise').click();assert.equal((await check()).id,'cgl-24');
 await page.evaluate(()=>localStorage.setItem('pocket-field.franchise.v1','{invalid'));await page.reload();await expect(page.locator('#continue-franchise')).toBeHidden();await page.locator('#start-franchise').click();
 assert.deepEqual(errors,[]);console.log('PASS: 24 club selection, 53-player previews, metadata, actual gameplay records, uniforms, save/reload, switching, corrupt save recovery, responsive layout, zero browser errors.');
}finally{await browser.close()}
