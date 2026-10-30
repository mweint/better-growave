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
 const page = await browser.newPage({viewport:{width:1180,height:960}});
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)});
 let requests=0, adds=0, rejectAdd=false;
 const fakeCart={items:[],item_count:0,total_price:0,currency:'USD'};
 await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.pathname==='/cart.js')return route.fulfill({json:fakeCart});
   if(u.pathname==='/cart/add.js'){
     adds++;
     const body=route.request().postDataJSON();
     assert.deepEqual(body,{items:[{id:'1',quantity:1}]});
     await new Promise(resolve=>setTimeout(resolve,300));
     if(rejectAdd)return route.fulfill({status:422,json:{description:'This item just sold out.'}});
     fakeCart.items=[{product_title:'Alice Coltrane: Journey in Satchidananda',quantity:1,final_line_price:3295,url:'/products/alpha?variant=1'}];
     fakeCart.item_count=1;fakeCart.total_price=3295;
     return route.fulfill({json:{items:fakeCart.items}});
   }
   if(u.pathname.endsWith('.js')){
     requests++;
     const name=u.pathname.split('/').pop().slice(0,-3);
     if(name==='failed') return route.fulfill({status:503,body:'Unavailable'});
     const data={alpha:{title:'Alice Coltrane: Journey in Satchidananda',id:1,price:3295,available:true},beta:{title:'Björk: Homogenic',id:2,price:2895,available:false},gamma:{title:'Floating Points: Cascade (Pre-Order)',id:3,price:3495,available:true},delta:{title:'Nala Sinephro: Endlessness',id:4,price:2695,available:true}}[name];
     return route.fulfill({json:{title:data.title,type:'Vinyl',available:data.available,variants:[{id:data.id,title:'Default Title',price:data.price,available:data.available}],tags:[]}});
   }
   return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="margin:24px;background:#fff"><div class="gw-wl-page-placeholder"></div></body></html>'});
 });
 await page.goto(base);
 await page.evaluate(()=>{
   window.browser={storage:{local:{get:async()=>({}),set:async()=>{}}}};
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
 await selects.nth(0).selectOption('out'); assert.equal(await panel.locator('.record').count(),1);
 assert.match(await panel.locator('.record').innerText(),/Björk/);
 await selects.nth(0).selectOption('preorder');assert.equal(await panel.locator('.record').count(),1);
 await selects.nth(0).selectOption('unknown');assert.equal(await panel.locator('.record').count(),1);
 await selects.nth(0).selectOption('all');assert.equal(await panel.locator('.record').count(),5);
 await selects.nth(1).selectOption('price');assert.match(await panel.locator('.record').first().innerText(),/Nala/);
 await panel.locator('input[type=search]').fill('alice journey');assert.equal(await panel.locator('.record').count(),1);
 await panel.locator('input[type=search]').fill('');
 await panel.getByRole('button',{name:'Refresh stock'}).click();
 await page.waitForFunction(()=>document.querySelector('#ttl-better-wishlist').shadowRoot.querySelector('.status').textContent.includes('Stock checked: 5/5'));
 assert.equal(requests,10,'Refresh must request each product again');
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
 assert.deepEqual(errors,[]);
 // Newer Growave layout: scoped load-more button and product-card classes.
 await page.evaluate(()=>{
   const r=document.querySelector('.gw-wl-page-placeholder').shadowRoot;
   r.innerHTML='<div class="gw-wl-v2"><ul><li class="gw-wl-product-card"><a class="gw-wl-product-card__title-link" href="/products/alpha?variant=1">Alice</a></li></ul><button>Load more</button></div>';
   r.querySelector('button').onclick=()=>{r.querySelector('ul').insertAdjacentHTML('beforeend','<li class="gw-wl-product-card"><a class="gw-wl-product-card__title-link" href="/products/beta?variant=2">Björk</a></li>');r.querySelector('button').remove();};
 });
 await page.waitForTimeout(1200);
 await panel.getByRole('button',{name:'Load all / retry'}).click();
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
 console.log('PASS: filtering, pagination, stock refresh, both Growave removal layouts, variant-specific cart add, duplicate-click guard, rejected add, cart subtotal, sticky sidebar, mobile width, and browser errors.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
