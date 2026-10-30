const {chromium,firefox}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const engine=process.env.TEST_BROWSER==='firefox'?firefox:chromium;
 const browser=await engine.launch({headless:true,executablePath:process.env.TEST_BROWSER==='firefox'?undefined:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined});
 const page=await browser.newPage();let active=0,peak=0,requests=0;
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname==='/cart.js')return route.fulfill({json:{items:[],item_count:0,total_price:0}});
  if(u.pathname.endsWith('.js')){
   requests++;active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,100));active--;
   const id=Number(u.pathname.match(/record-(\d+)/)[1]);
   return route.fulfill({json:{title:'Record '+id,available:true,variants:[{id,available:true,price:1000}]}});
  }
  return route.fulfill({contentType:'text/html',body:'<div class="gw-wl-page-placeholder"></div>'});
 });
 await page.goto('https://www.turntablelab.com/pages/wishlist');
 await page.evaluate(()=>{
  window.browser={storage:{local:{get:async()=>({}),set:async()=>{}}}};
  window.card=id=>`<li class="gw-wl-page-item" data-gw-variant-id="${id}"><a class="gw-wl-page-item__title" href="/products/record-${id}?variant=${id}">Record ${id}</a></li>`;
  document.querySelector('.gw-wl-page-placeholder').innerHTML=Array.from({length:80},(_,i)=>card(i+1)).join('');
 });
 for(const file of ['core.js','cart.js','content.js'])await page.addScriptTag({path:path.resolve('extension',file)});
 await page.waitForFunction(()=>{const s=document.querySelector('#ttl-better-wishlist')?.shadowRoot.querySelector('.status')?.textContent;return s?.includes('Stock checked: 80/80')&&s?.includes('All displayed');});
 assert.equal(peak,8,'Eight overlapping checks');assert.equal(requests,80,'No duplicate product reads');
 // Some stores insert their next-page control after the product cards arrive.
 await page.evaluate(()=>{
  const host=document.querySelector('.gw-wl-page-placeholder'),button=document.createElement('button');
  button.className='gw-wl-page-load-more';button.textContent='Load more';
  button.onclick=()=>{host.insertAdjacentHTML('beforeend',card(81));button.remove();};host.append(button);
 });
 await page.waitForFunction(()=>document.querySelector('#ttl-better-wishlist').shadowRoot.querySelector('.status').textContent.includes('Stock checked: 81/81'));
 assert.equal(requests,81,'A late next-page control is not missed');
 assert.equal(await page.locator('#ttl-better-wishlist .record').count(),81);
 console.log('PASS: eight concurrent stock requests, no duplicates, and late pagination controls.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
