require('node:fs').mkdirSync('test-results',{recursive:true});
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const core = require('../extension/core.js');
const base = 'https://www.turntablelab.com/pages/wishlist';
assert.equal(core.productURL('https://evil.example/products/a',base),null);
assert.equal(core.productURL('javascript:alert(1)',base),null);
assert.equal(core.enrich({variant:'2'}, {available:true, variants:[{id:1,available:true}]}).status,'unknown');
assert.equal(core.enrich({variant:'2'}, {available:true, variants:[{id:2,available:false}]}).status,'out');
assert.equal(core.enrich({variant:'2'}, {title:'Record (Pre-Order)',variants:[{id:2,available:true}]}).status,'preorder');
assert.deepEqual(core.select([{title:'A',price:null,status:'in',order:0},{title:'B',price:100,status:'in',order:1}],{sort:'price-desc'}).map(i=>i.title),['B','A']);
(async()=>{
 const browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined});
 const page = await browser.newPage({viewport:{width:1600,height:960}});
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)});
 let requests=0, adds=0, rejectAdd=false, cartRemoves=0, rejectRemove=false, productActive=0, peakProductActive=0;
 const fakeCart={items:[],item_count:0,total_price:0,currency:'USD'};
 await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.pathname==='/cover.svg')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#265647"/><circle cx="64" cy="64" r="45" fill="#d9b56d"/><circle cx="64" cy="64" r="10" fill="#265647"/></svg>'});
   if(u.pathname==='/cart.js')return route.fulfill({json:fakeCart});
   if(u.pathname==='/cart/change.js'){
     assert.deepEqual(route.request().postDataJSON(),{id:'1:exact-line-key',quantity:0});cartRemoves++;
     await new Promise(r=>setTimeout(r,150));
     if(rejectRemove)return route.fulfill({status:422,json:{description:'Unable to remove this line.'}});
     fakeCart.items=[];fakeCart.item_count=0;fakeCart.total_price=0;fakeCart.items_subtotal_price=0;fakeCart.total_discount=0;fakeCart.cart_level_discount_applications=[];
     return route.fulfill({json:fakeCart});
   }
   if(u.pathname==='/cart/add.js'){
     adds++;
     const body=route.request().postDataJSON();
     assert.deepEqual(body,{items:[{id:'1',quantity:1}]});
     await new Promise(resolve=>setTimeout(resolve,300));
     if(rejectAdd)return route.fulfill({status:422,json:{description:'This item just sold out.'}});
     fakeCart.items=[{key:'1:exact-line-key',variant_id:1,image:'/cover.svg',product_title:'Alice Coltrane: Journey in Satchidananda',quantity:1,original_line_price:3295,final_line_price:3295,url:'/products/alpha?variant=1'}];
     fakeCart.item_count=1;fakeCart.total_price=3295;
     return route.fulfill({json:{items:fakeCart.items}});
   }
   if(u.pathname.endsWith('.js')){
     requests++;
     productActive++;peakProductActive=Math.max(peakProductActive,productActive);await new Promise(r=>setTimeout(r,180));productActive--;
     const name=u.pathname.split('/').pop().slice(0,-3);
     if(name==='failed') return route.fulfill({status:503,body:'Unavailable'});
     const data={alpha:{title:'Alice Coltrane: Journey in Satchidananda',id:1,price:3295,available:true},beta:{title:'Björk: Homogenic',id:2,price:2895,available:false},gamma:{title:'Floating Points: Cascade (Pre-Order)',id:3,price:3495,available:true},delta:{title:'Nala Sinephro: Endlessness (Limited Edition, Gatefold) Vinyl 2LP',id:4,price:2695,available:true}}[name];
     return route.fulfill({json:{title:data.title,type:'_music-ROCK-nonsense',featured_image:'/cover.svg',available:data.available,variants:[{id:data.id,title:data.id===1?'Vinyl 2LP':'Default Title',price:data.price,compare_at_price:data.id===1?3995:null,available:data.available}],tags:[]}});
   }
   return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="margin:24px;background:#fff"><main style="max-width:760px;margin:auto"><div class="gw-wl-page-placeholder"></div></main></body></html>'});
 });
 await page.goto(base);
 await page.evaluate(()=>{
   window.savedPreferences={};window.browser={storage:{local:{get:async()=>window.savedPreferences,set:async value=>{window.savedPreferences=value;}}}};
   const root=document.querySelector('.gw-wl-page-placeholder').attachShadow({mode:'open'});
   window.card=(name,id)=>`<li class="gw-wl-page-item" data-gw-selector="wishlist-item" data-gw-variant-id="${id}"><a class="gw-wl-page-item__title" href="/products/${name}?variant=${id}">${name}</a></li>`;
   root.innerHTML=`<ul>${card('alpha',1)}${card('beta',2)}</ul><button class="gw-wl-page-load-more">Load more</button>`;
   root.querySelector('button').onclick=()=>setTimeout(()=>{root.querySelector('ul').insertAdjacentHTML('beforeend',card('gamma',3)+card('delta',4)+card('failed',5));root.querySelector('button').remove();},100);
 });
 await page.addScriptTag({path:path.resolve('extension/core.js')});
 await page.addScriptTag({path:path.resolve('extension/cart.js')});
 await page.addScriptTag({path:path.resolve('extension/content.js')});
 await page.waitForFunction(()=>document.querySelector('#ttl-better-wishlist')?.shadowRoot.querySelector('.status').textContent.includes('Stock checked: 5/5')).catch(async e=>{console.log(await page.evaluate(()=>document.querySelector('#ttl-better-wishlist')?.shadowRoot.textContent));throw e;});
 const panel=page.locator('#ttl-better-wishlist');
 assert.equal(await panel.locator('.record').count(),2);
 await page.waitForFunction(()=>document.querySelector('#ttl-better-wishlist').shadowRoot.querySelector('.status').textContent.includes('All displayed'));
 const selects=panel.locator('select');
 assert.equal(await selects.count(),2,'No internal product-type filter');
 await selects.nth(0).selectOption('out'); assert.equal(await panel.locator('.record').count(),1);
 assert.match(await panel.locator('.record').innerText(),/Björk/);
 await selects.nth(0).selectOption('preorder');assert.equal(await panel.locator('.record').count(),1);
 await selects.nth(0).selectOption('unknown');assert.equal(await panel.locator('.record').count(),1);
 await selects.nth(0).selectOption('all');assert.equal(await panel.locator('.record').count(),5);
 await selects.nth(1).selectOption('price');assert.match(await panel.locator('.record').first().innerText(),/Nala/);
 await panel.locator('input[type=search]').fill('alice journey');assert.equal(await panel.locator('.record').count(),1);
 await panel.locator('input[type=search]').fill('');
 await panel.locator('.manage summary').click();
 await panel.getByRole('button',{name:'Refresh stock'}).click();
 await panel.locator('.manage summary').click();
 await page.waitForFunction(()=>document.querySelector('#ttl-better-wishlist').shadowRoot.querySelector('.status').textContent.includes('Stock checked: 5/5'));
 assert.equal(requests,10,'Refresh must request each product again');
 assert.ok(peakProductActive>=4 && peakProductActive<=6,'Stock checks overlap with a bounded pool');
 await selects.nth(1).selectOption('title');
 assert.equal(adds,0,'No automatic cart writes');
 const add=panel.getByRole('button',{name:'Add Alice Coltrane: Journey in Satchidananda to cart',exact:true});
 await add.click();
 assert.equal(await add.isDisabled(),true,'Disable repeat adds while request is pending');
 await page.waitForFunction(()=>document.querySelector('#ttl-better-wishlist').shadowRoot.querySelector('.cart-total').textContent.includes('32.95'));
 assert.equal(adds,1);
 rejectAdd=true;await add.click();
 await page.waitForFunction(()=>document.querySelector('#ttl-better-wishlist').shadowRoot.querySelector('.cart-status').textContent.includes('just sold out'));
 assert.equal(fakeCart.item_count,1,'Rejected add leaves cart unchanged');
 assert.equal(await add.isDisabled(),false,'Can retry after a store rejection');
 await page.waitForFunction(()=>document.querySelector('#ttl-better-wishlist').shadowRoot.querySelector('.cart-price del')?.textContent.includes('39.95'));
 assert.equal(await panel.locator('.cart-item img').count(),1,'Cart has an image');
 // Cart-level discounts change the total without re-applying line discounts.
 fakeCart.items_subtotal_price=3295;fakeCart.total_price=2965;fakeCart.total_discount=330;
 fakeCart.cart_level_discount_applications=[{title:'10% off eligible records',total_allocated_amount:330}];
 await panel.getByRole('button',{name:'Refresh cart',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#ttl-better-wishlist').shadowRoot.querySelector('.cart-total').textContent.includes('29.65'));
 assert.match(await panel.locator('.cart-summary').innerText(),/10% off eligible records/);
 assert.match(await panel.locator('.cart-price').innerText(),/32.95/,'Line price stays independent of cart-level discount');
 const browseWidth=(await panel.locator('.panel').boundingBox()).width;
 assert.ok(browseWidth>=800 && browseWidth<=841,'Browsing column remains readable without spanning the screen');
 assert.ok((await panel.boundingBox()).width<=1161,'Centered layout has a bounded total width');
 const firstRow=panel.locator('.record').first();
 const productBox=await firstRow.locator('.product').boundingBox(),actionBox=await firstRow.locator('.item-actions').boundingBox();
 assert.ok(Math.abs((productBox.y+productBox.height/2)-(actionBox.y+actionBox.height/2))<2,'Desktop row actions stay on one line');
 await panel.getByRole('button',{name:'Tiles',exact:true}).click();
 assert.equal(await panel.locator('.records').evaluate(el=>getComputedStyle(el).display),'grid');
 assert.equal(await page.evaluate(()=>savedPreferences.ttlPreferences.layout),'tiles');
 const tileGeometry=await panel.locator('.record').evaluateAll(rows=>rows.map(row=>{
   const box=selector=>{const b=row.querySelector(selector).getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};};
   return {card:row.getBoundingClientRect().toJSON(),price:box('.price'),add:box('.item-actions'),title:box('strong'),image:box('img,.cover')};
 }));
 assert.ok(tileGeometry.slice(0,3).every(g=>Math.abs(g.card.y-tileGeometry[0].card.y)<1),'Three tiles per desktop row');
 for(const field of ['title','price','add'])assert.ok(Math.max(...tileGeometry.slice(0,3).map(g=>g[field].y))-Math.min(...tileGeometry.slice(0,3).map(g=>g[field].y))<2,`${field} aligns across varying title lengths`);
 assert.ok(tileGeometry.every(g=>Math.abs(g.card.width-tileGeometry[0].card.width)<1),'All tiles retain the same width, including the last row');
 await page.screenshot({path:'test-results/tiles.png',fullPage:true});
 await panel.getByRole('button',{name:'List',exact:true}).click();
 // Growave V1 removal uses the original item button, never a fabricated API.
 await page.evaluate(()=>{
   const r=document.querySelector('.gw-wl-page-placeholder').shadowRoot;
   const card=r.querySelector('[data-gw-variant-id="5"]');
   const button=document.createElement('button');button.className='gw-wl-page-item__delete-btn';
   button.onclick=()=>card.remove();card.append(button);
 });
 await panel.getByRole('button',{name:'Remove failed from wishlist',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#ttl-better-wishlist').shadowRoot.querySelector('.action-status').textContent.includes('Removed from wishlist:'));
 assert.equal(await panel.locator('.record').count(),4);
 await panel.getByRole('button',{name:'Refresh cart',exact:true}).click();
 await page.screenshot({path:'test-results/desktop.png',fullPage:true});
 assert.equal(await panel.locator('.cart').evaluate(el=>getComputedStyle(el).position),'sticky');
 await page.evaluate(()=>document.querySelector('#ttl-better-wishlist').shadowRoot.querySelector('.panel').style.minHeight='2200px');
 await page.evaluate(()=>window.scrollTo(0,500));
 assert.ok(Math.abs((await panel.locator('.cart').boundingBox()).y-100)<2,'Cart follows scroll');
 await page.evaluate(()=>{window.scrollTo(0,0);document.querySelector('#ttl-better-wishlist').shadowRoot.querySelector('.panel').style.minHeight='';});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'test-results/mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No mobile overflow');
 await panel.getByRole('button',{name:'Tiles',exact:true}).click();
 await page.screenshot({path:'test-results/mobile-tiles.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No mobile tile overflow');
 await panel.getByRole('button',{name:'List',exact:true}).click();
 rejectRemove=true;
 const removeCart=panel.getByRole('button',{name:'Remove Alice Coltrane: Journey in Satchidananda from cart',exact:true});
 await removeCart.click();
 await page.waitForFunction(()=>document.querySelector('#ttl-better-wishlist').shadowRoot.querySelector('.cart-status').textContent.includes('Unable to remove'));
 assert.equal(await panel.locator('.cart-item').count(),1,'Rejected cart removal preserves the line');
 rejectRemove=false;await removeCart.click();
 await page.waitForFunction(()=>document.querySelector('#ttl-better-wishlist').shadowRoot.querySelector('.cart-total').textContent.includes('0.00'));
 assert.equal(await panel.locator('.cart-item').count(),0);assert.equal(cartRemoves,2,'Exactly one request per click');
 assert.deepEqual(errors,[]);
 // Newer Growave layout: scoped load-more button and product-card classes.
 await page.evaluate(()=>{
   const r=document.querySelector('.gw-wl-page-placeholder').shadowRoot;
   r.innerHTML='<div class="gw-wl-v2"><ul><li class="gw-wl-product-card"><a class="gw-wl-product-card__title-link" href="/products/alpha?variant=1">Alice</a></li></ul><button>Load more</button></div>';
   r.querySelector('button').onclick=()=>{r.querySelector('ul').insertAdjacentHTML('beforeend','<li class="gw-wl-product-card"><a class="gw-wl-product-card__title-link" href="/products/beta?variant=2">Björk</a></li>');r.querySelector('button').remove();};
 });
 await page.waitForTimeout(1200);
 await panel.locator('.manage summary').click();
 await panel.getByRole('button',{name:'Load all / retry'}).click();
 await panel.locator('.manage summary').click();
 await page.waitForFunction(()=>document.querySelector('#ttl-better-wishlist').shadowRoot.querySelector('.status').textContent.includes('All displayed'));
 assert.equal(await panel.locator('.record').count(),2,'V2 cards and pagination');
 await page.evaluate(()=>{
   const r=document.querySelector('.gw-wl-page-placeholder').shadowRoot, card=r.querySelector('.gw-wl-product-card');
   const trigger=document.createElement('button');trigger.className='gw-wl-product-card-menu-trigger-btn';trigger.setAttribute('aria-controls','item-menu-1');
   trigger.onclick=()=>{const menu=document.createElement('div');menu.id='item-menu-1';menu.innerHTML='<button role="option">Delete</button>';menu.querySelector('button').onclick=()=>{card.remove();menu.remove();};r.append(menu);};card.append(trigger);
 });
 await panel.getByRole('button',{name:'Remove Alice Coltrane: Journey in Satchidananda from wishlist',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#ttl-better-wishlist').shadowRoot.querySelector('.action-status').textContent.includes('Removed from wishlist: Alice'));
 assert.equal(await panel.locator('.record').count(),1,'V2 scoped menu removal');
 await page.evaluate(()=>{document.querySelector('.gw-wl-page-placeholder').shadowRoot.innerHTML='<div class="gw-wl-v2">Empty wishlist</div>';});
 await page.waitForFunction(()=>document.querySelector('#ttl-better-wishlist').shadowRoot.querySelectorAll('.record').length===0);
 assert.deepEqual(errors,[]);
 // The same implementation can run on an opt-in store without TTL URLs.
 await page.goto('https://example-shop.test/pages/wishlist');
 await page.evaluate(()=>{
   window.browser={storage:{local:{get:async()=>({}),set:async()=>{}}}};
   document.querySelector('.gw-wl-page-placeholder').attachShadow({mode:'open'}).innerHTML='<li class="gw-wl-product-card"><a class="gw-wl-product-card__title-link" href="/products/alpha?variant=1">Alice</a></li>';
 });
 for(const file of ['core.js','cart.js','content.js'])await page.addScriptTag({path:path.resolve('extension',file)});
 await page.waitForFunction(()=>document.querySelector('#ttl-better-wishlist')?.shadowRoot.querySelector('.record'));
 assert.match(await page.locator('#ttl-better-wishlist .product').getAttribute('href'),/^https:\/\/example-shop.test\//);
 console.log('PASS: filtering, pagination, stock refresh, both Growave removal layouts, variant-specific cart add, duplicate-click guard, rejected add, cart subtotal, sticky sidebar, mobile width, and browser errors.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});


