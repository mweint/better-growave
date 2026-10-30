(() => {
  'use strict';
  if (document.getElementById('ttl-better-wishlist')) return;
  const core = globalThis.TTLWishlist;
  const CARD = '[data-gw-selector="wishlist-item"], .gw-wl-page-item, .gw-wl-product-card';
  const LOAD = '.gw-wl-page-load-more';
  const labels = {in: 'In stock', out: 'Out of stock', preorder: 'Preorder', unknown: 'Unknown'};
  const items = new Map(), cache = new Map();
  const cardsByKey = new Map();
  let cart, removing = false, actionMessage = '';
  let host, view, ui, running = false, stopped = false, active = 0, timer, lastSignature = '', lastRoots = [];
  let loadMessage = 'Waiting for your wishlist…', complete = false, emptySince = 0;
  let prefs = {stock: 'in', sort: 'title', search: '', layout: 'list'};
  let renderTimer;
  const scheduleRender = () => { if (!renderTimer) renderTimer=setTimeout(()=>{renderTimer=null;render();},100); };
  const extension = globalThis.browser || globalThis.chrome;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  function roots(node) {
    const result = node.shadowRoot ? [node, node.shadowRoot] : [node];
    for (let i = 0; i < result.length; i++) {
      for (const el of result[i].querySelectorAll('*')) if (el.shadowRoot) result.push(el.shadowRoot);
    }
    return result;
  }
  function all(selector) { return roots(host).flatMap(r => [...r.querySelectorAll(selector)]); }
  function element(tag, text, attrs = {}) {
    const el = document.createElement(tag);
    if (text != null) el.textContent = text;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }
  function safeImage(value) {
    if (!value) return '';
    try { const u = new URL(value, location.href); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
  }
  function scan() {
    if (!host?.isConnected) return;
    const cards = all(CARD);
    cardsByKey.clear();
    const present = new Set();
    for (const card of cards) {
      const anchor = card.querySelector('.gw-wl-page-item__title, .gw-wl-product-card__title-link') || card.querySelector('a[href*="/products/"]');
      const url = core.productURL(anchor?.href, location.href);
      if (!url) continue;
      const variant = card.getAttribute('data-gw-variant-id') || url.searchParams.get('variant') || '';
      if (/^\d+$/.test(variant)) url.searchParams.set('variant', variant);
      const key = url.href;
      if(!cardsByKey.has(key))cardsByKey.set(key,[]);
      cardsByKey.get(key).push(card);
      present.add(key);
      if (!items.has(key)) {
        items.set(key, {key, url: key, variant, title: anchor.textContent.trim() || url.pathname.split('/').pop(),
          image: card.querySelector('img')?.src || '', price: null, type: '', status: 'unknown', checked: false, order: items.size});
      }
    }
    // Mirror the current rendered lists, including removals and list switches.
    // Do not prune during a transient empty/loading render.
    if (present.size) for (const key of items.keys()) if (!present.has(key)) items.delete(key);
    if (present.size) emptySince = 0;
    else if (!emptySince) emptySince = Date.now();
    else if (items.size && Date.now() - emptySince > 3000) { items.clear(); complete = false; render(); }
    const signature = [...present].join('|');
    if (signature !== lastSignature) {
      lastSignature = signature;
      if (!running && !removing) { complete = false; loadMessage = 'Wishlist changed. Click “Load all / retry” to check for more items.'; }
      render();
    }
    pump();
  }
  async function removeItem(item) {
    if(removing)return;
    scan();
    const cards=cardsByKey.get(item.key)||[], card=cards[0];
    if(!card){actionMessage='This item is no longer in the displayed wishlist.';render();return;}
    removing=true;actionMessage=`Removing: ${item.title}`;render();
    try {
      let button=card.querySelector('.gw-wl-page-item__delete-btn');
      if(!button){
        const trigger=card.querySelector('.gw-wl-product-card-menu-trigger-btn');
        if(!trigger)throw new Error('Remove control unavailable. Use the original wishlist below.');
        if(trigger.getAttribute('aria-expanded')!=='true')trigger.click();
        for(let i=0;i<20 && !button;i++){
          await sleep(100);
          const id=trigger.getAttribute('aria-controls');
          // Scope to this exact card's menu. Never select another list's delete control.
          const menu=id ? roots(host).map(r=>r.querySelector(`[id="${CSS.escape(id)}"]`)).find(Boolean) : null;
          if(menu)button=[...menu.querySelectorAll('[role="option"], [role="menuitem"], button')].find(el=>/^(remove|delete)( from wishlist)?$/i.test(el.textContent.trim()));
        }
      }
      if(!button || button.disabled || button.getAttribute('aria-disabled')==='true')throw new Error('Remove control unavailable. Use the original wishlist below.');
      button.click();
      let confirmed=false;
      for(let i=0;i<40;i++){
        await sleep(250);scan();
        if((cardsByKey.get(item.key)||[]).length<cards.length){confirmed=true;break;}
      }
      actionMessage=confirmed ? (cards.length>1?'Removed from one wishlist; this item is also saved in another displayed list.':`Removed from wishlist: ${item.title}`) : 'Removal is not confirmed. Check the original wishlist for a confirmation or error.';
    } catch(error){actionMessage=error.message;}
    finally{removing=false;render();}
  }
  async function getProduct(url) {
    const endpoint = new URL(url); endpoint.search = ''; endpoint.pathname = endpoint.pathname.replace(/\/$/, '') + '.js';
    if (!cache.has(endpoint.href)) {
      const request = (async () => {
        const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
        try {
          const response = await fetch(endpoint.href, {credentials: 'same-origin', signal: controller.signal});
          if (!response.ok) throw new Error(`Product request failed (${response.status})`);
          return await response.json();
        } finally { clearTimeout(timeout); }
      })();
      cache.set(endpoint.href, request);
      request.catch(() => cache.delete(endpoint.href));
    }
    return cache.get(endpoint.href);
  }
  function pump() {
    for (const [key, item] of items) {
      if (active >= 6) break;
      if (item.checked || item.pending) continue;
      active++; item.pending = true;
      getProduct(item.url).then(product => {
        if (items.get(key) === item) items.set(key, core.enrich(item, product));
      }).catch(() => { item.checked = true; item.status = 'unknown'; })
        .finally(() => { item.pending = false; if (items.has(key)) items.get(key).pending = false; active--; scheduleRender(); pump(); });
    }
  }
  function loaders() {
    const known = all(LOAD).map(el => el.matches('button') ? el : el.querySelector('button')).filter(Boolean);
    const newer = all('.gw-wl-v2 button').filter(el => /^load more$/i.test(el.textContent.trim()));
    return [...new Set([...known, ...newer])];
  }
  async function loadAll() {
    if (running) return;
    running = true; stopped = false; complete = false;
    try {
      let emptyPasses = 0;
      for (let pages = 0; pages < 500 && !stopped; pages++) {
        scan();
        const buttons = loaders();
        if (!buttons.length) {
          if (++emptyPasses < (items.size ? 4 : 30)) { loadMessage = items.size ? 'Checking for more items…' : 'Waiting for your saved items…'; render(); await sleep(1000); continue; }
          complete = items.size > 0;
          loadMessage = complete ? 'All displayed wishlists loaded.' : 'No items found. Sign in or open a saved list in the original wishlist below.';
          break;
        }
        emptyPasses = 0;
        const button = buttons.find(b => !b.disabled && b.getAttribute('aria-disabled') !== 'true');
        if (!button) { loadMessage = 'Waiting for the store…'; render(); await sleep(1000); continue; }
        const before = lastSignature;
        loadMessage = `Loading more items… ${items.size} found`; render();
        button.click();
        let progressed = false;
        for (let n = 0; n < 200 && !stopped; n++) {
          await sleep(100); scan();
          if (lastSignature !== before || !loaders().length) { progressed = true; break; }
        }
        if (stopped) break;
        if (!progressed) { loadMessage = 'Loading stalled. Use “Load all / retry” to try again.'; break; }
        if (pages === 499) loadMessage = 'Paused after 500 loading steps. Click “Load all / retry” to continue.';
      }
    } catch { loadMessage = 'Could not load more items. The original wishlist is available below.'; }
    finally {
      running = false;
      if (stopped) loadMessage = 'Loading paused. Filters cover items loaded so far.';
      render();
    }
  }
  function render() {
    if (!ui) return;
    const list = [...items.values()];
    const counts = Object.fromEntries(Object.keys(labels).map(k => [k, list.filter(i => i.status === k).length]));
    for (const option of ui.stock.options) option.textContent = option.value === 'all' ? `Everything (${list.length})` : `${labels[option.value]} (${counts[option.value]})`;
    ui.list.className = prefs.layout === 'tiles' ? 'records tiles' : 'records';
    for(const [mode,button] of Object.entries(ui.modes))button.setAttribute('aria-pressed',String(mode===prefs.layout));
    const filtered = core.select(list, prefs);
    const checked = list.filter(i => i.checked).length;
    ui.status.textContent = `${loadMessage} Stock checked: ${checked}/${list.length}.`;
    ui.actionStatus.textContent = actionMessage;
    ui.count.textContent = `${filtered.length} shown · ${list.length} loaded${complete ? '' : ' so far'}`;
    ui.load.disabled = running; ui.pause.disabled = !running;
    ui.refresh.disabled = active > 0;
    const fragment = document.createDocumentFragment();
    for (const item of filtered) {
      const row = element('li', null, {class: 'record'});
      const link = element('a', null, {title:item.title, href: item.url, target: '_blank', rel: 'noopener noreferrer', class: 'product'});
      const image = safeImage(item.image);
      if (image) link.append(element('img', null, {src: image, alt: '', loading: 'lazy', width: '64', height: '64'}));
      else link.append(element('span', '♫', {class: 'cover'}));
      const name = element('span', null);
      name.append(element('strong', item.title));
      if (item.variantTitle) name.append(element('small', item.variantTitle));
      link.append(name); row.append(link);
      const price=element('span',null,{class:'price'});
      const money=amount=>new Intl.NumberFormat('en-US',{style:'currency',currency:ui.currency}).format(amount/100);
      if(item.comparePrice>item.price && item.price!=null)price.append(element('del',money(item.comparePrice)));
      price.append(element('span',item.price==null?'—':money(item.price),{class:item.comparePrice>item.price?'sale':''}));row.append(price);
      row.append(element('span', item.checked ? labels[item.status] : 'Checking…', {class: `badge ${item.status}`}));
      const buttons=element('div',null,{class:'item-actions'});
      if(item.cartVariant){
        const add=element('button','Add',{type:'button','aria-label':`Add ${item.title} to cart`,title:'Add to cart'});
        add.disabled=cart?.isBusy() || !['in','preorder'].includes(item.status);
        add.onclick=()=>cart.add(item);buttons.append(add);
      } else if(item.checked && ['in','preorder'].includes(item.status)) {
        buttons.append(element('a','Choose options',{href:item.url,target:'_blank',rel:'noopener noreferrer'}));
      }
      const remove=element('button','♥',{type:'button','aria-label':`Remove ${item.title} from wishlist`,title:'Remove from wishlist',class:'remove'});
      remove.disabled=removing;remove.onclick=()=>removeItem(item);buttons.append(remove);
      row.append(buttons);
      fragment.append(row);
    }
    ui.list.replaceChildren(fragment);
    ui.empty.hidden = filtered.length !== 0;
    ui.empty.textContent = list.length ? 'No matches with these filters. Try Everything, or wait for stock checks to finish.' : 'Waiting for items from your original wishlist below.';
  }
  async function mount(found) {
    host = found;
    const container = element('section', null, {id: 'ttl-better-wishlist', 'aria-label': 'Better wishlist'});
    host.before(container); view = container.attachShadow({mode: 'open'});
    const style = element('style', `
      :host{display:block;width:min(1160px,calc(100vw - 48px));max-width:none;margin:24px 0;margin-left:calc(50% - min(580px,50vw - 24px));color:#202522;font:14px/1.45 system-ui,sans-serif}
      *{box-sizing:border-box}[hidden]{display:none!important}
      .layout{display:grid;grid-template-columns:minmax(0,1fr) 296px;gap:24px;align-items:start}
      .panel{min-width:0;background:#fff;border:1px solid #e1e4df;border-radius:10px;padding:20px}
      h2{font-size:24px;margin:0;letter-spacing:-.5px}p{margin:8px 0;color:#58615a}
      .eyebrow{font-size:10px;font-weight:700;letter-spacing:1.5px;color:#55745f;margin:0 0 4px}
      .controls{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;margin:18px 0 14px}
      label{font-size:12px;font-weight:600}input,select{display:block;width:100%;font:13px system-ui;margin-top:4px;padding:9px;border:1px solid #c5cdc6;border-radius:5px;background:#fff;color:#202522;min-width:0}
      button{font:600 12px system-ui;border:1px solid #bdc9c0;border-radius:5px;background:white;color:#254832;padding:8px 10px;cursor:pointer;min-height:34px}
      button:disabled{opacity:.5;cursor:default}:focus-visible{outline:3px solid #b46722;outline-offset:3px}
      .toolbar{display:flex;align-items:center;gap:12px;margin:0 0 12px;position:relative}.count{font-size:12px;margin:0 auto 0 0;color:#58615a}
      .view-modes{display:flex;gap:2px;background:#f1f3f0;padding:3px;border-radius:6px}.view-modes button{border:0;background:transparent;color:#59645c;min-height:28px;padding:5px 9px}.view-modes [aria-pressed=true]{background:white;color:#202522;box-shadow:0 1px 3px #0002}
      .manage summary{font-size:12px;color:#58615a;cursor:pointer;padding:8px 0}.manage-box{position:absolute;right:0;top:100%;z-index:3;width:min(320px,100%);padding:14px;border:1px solid #d6d9d2;border-radius:8px;background:white;box-shadow:0 6px 20px #0002}
      .actions{display:flex;gap:6px;flex-wrap:wrap}.status{font-size:12px}.action-status{font-size:12px;color:#254832}.action-status:empty{display:none}
      ul{list-style:none;margin:0;padding:0}.record{display:grid;grid-template-columns:minmax(0,1fr) 68px 76px 88px;gap:10px;align-items:center;padding:12px 0;border-top:1px solid #e6e8e3}
      .product{display:flex;gap:12px;align-items:center;color:inherit;text-decoration:none;min-width:0}.product>span{min-width:0}.product:hover strong{text-decoration:underline}
      img,.cover{width:52px;height:52px;object-fit:contain;border-radius:4px;flex-shrink:0;background:#fff}.cover{display:grid;place-items:center;font-size:24px}
      strong{font-size:13px;font-weight:600}small{display:block;margin-top:4px;color:#69716b;font-size:11px}.price{font-size:13px;font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}.price del{display:block;color:#808781;font-size:11px}.sale{color:#a34232}
      .badge{font-size:11px;color:#69716b}.badge.in{color:#3b6b4c}.badge.preorder{color:#8b631b}
      .item-actions{display:flex;gap:4px;justify-content:flex-end;align-items:center}.item-actions button:not(.remove){background:#254832;color:white;border-color:#254832}.item-actions .remove{background:transparent;color:#9c424b;border:0;font-size:21px;line-height:1;padding:5px;width:34px;height:34px}.item-actions .remove:hover{background:#f4e6e8}.item-actions a{font-size:12px;color:#254832}
      .tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
      .tiles .record{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto 18px 34px;gap:8px 6px;align-items:center;padding:12px;border:1px solid #e1e4df;border-radius:8px;background:white}
      .tiles .product{grid-column:1/-1;display:flex;flex-direction:column;align-items:stretch;gap:12px}
      .tiles .product img,.tiles .cover{width:100%;height:156px;object-fit:contain;padding:4px 16px}
      .tiles .product>span:not(.cover){height:60px}.tiles strong{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;font-size:13px;line-height:20px;height:40px}.tiles small{margin-top:2px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .tiles .badge{grid-column:1/-1;grid-row:2}.tiles .price{grid-column:1;grid-row:3;text-align:left}.tiles .price del{display:inline;margin-right:5px;font-size:10px}.tiles .item-actions{grid-column:2;grid-row:3;margin:0;min-height:34px}.tiles .item-actions .remove{position:absolute;top:8px;right:8px;background:#fff;border-radius:50%;box-shadow:0 1px 4px #0001}.tiles .item-actions .remove:hover{background:#f4e6e8}
      .note{font-size:11px;margin-top:14px}.empty{padding:24px 0}.original{display:flex;align-items:center;gap:8px;margin-top:12px;color:#69716b;font-weight:400}.original input{width:auto;margin:0}
      .cart{position:sticky;top:100px;border:1px solid #e1e4df;border-radius:10px;background:#f7f8f5;padding:18px;max-height:calc(100vh - 120px);overflow:auto}
      .cart h3{font-size:18px;margin:0 0 12px}.cart a{color:#254832}.cart-items{max-height:45vh;overflow:auto}.cart-item{display:grid;grid-template-columns:48px minmax(0,1fr) 24px;gap:8px;padding:12px 0;border-bottom:1px solid #e1e4df;overflow-wrap:anywhere}.cart-item a{font-weight:600;font-size:12px;text-decoration:none}.cart-item a:hover{text-decoration:underline}.cart-item img,.cart-item .cover{width:48px;height:48px;object-fit:contain;background:white;border-radius:4px}.cart-item .cart-remove{padding:2px;font-size:20px;border:0;background:transparent;color:#757d78;align-self:start;min-height:28px}
      .cart-price del{font-size:10px;color:#7f877f;margin-right:5px}.cart-price{font-size:12px}.cart-discount{font-size:11px;color:#3c7652}.cart-summary{border-top:1px solid #d6d9d2;padding-top:10px}.cart-summary p{display:flex;justify-content:space-between;gap:8px;font-size:12px}.cart-summary .cart-total{font-size:16px;font-weight:700;color:#202522}.cart-status{font-size:12px}.cart-status:empty{display:none}.cart-link{display:block;margin-top:12px;font-weight:600;font-size:13px}
      @media(max-width:1050px){:host{width:min(840px,calc(100vw - 32px));margin-left:calc(50% - min(420px,50vw - 16px))}.layout{grid-template-columns:1fr}.cart{position:static;max-height:none}.cart-items{max-height:260px}}
      @media(max-width:600px){.panel{padding:12px}.controls{grid-template-columns:1fr 1fr}.controls label:first-child{grid-column:1/-1}.record{grid-template-columns:minmax(0,1fr) auto;gap:6px 10px}.product{grid-column:1/-1;gap:10px}.record>.badge{grid-column:1;grid-row:2}.record>.price{grid-column:1;grid-row:3;text-align:left}.item-actions{grid-column:2;grid-row:3}.tiles{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.tiles .record{padding:8px}.tiles .product img,.tiles .cover{height:118px;padding:4px 12px}.tiles .product>span:not(.cover){height:77px}.tiles strong{height:57px;line-height:19px;-webkit-line-clamp:3}.tiles .price del{display:block}.toolbar{gap:8px}.count{font-size:11px}.manage summary{font-size:11px}}
    `);
    const panel = element('div', null, {class: 'panel'});
    panel.append(element('p', 'BETTER GROWAVE', {class:'eyebrow'}), element('h2', 'Your wishlist'));
    if(location.hostname!=='www.turntablelab.com')panel.append(element('p','Experimental support on this store.',{class:'note'}));
    const controls = element('div', null, {class:'controls'});
    ui = {currency: 'USD'};
    try { ui.currency = JSON.parse(document.getElementById('gw-additional-info')?.textContent || '{}').FEATURES?.currencyIsoCode || 'USD'; } catch {}
    if (!/^[A-Z]{3}$/.test(ui.currency)) ui.currency = 'USD';
    function field(key, title, options) {
      const label = element('label', title), control = element(options ? 'select' : 'input', null);
      if (!options) { control.type = 'search'; control.placeholder = 'Artist, album, or title'; }
      else for (const [value, text] of options) control.append(element('option', text, {value}));
      label.append(control); controls.append(label); ui[key] = control;
      control.addEventListener(options ? 'change' : 'input', () => {
        prefs[key] = control.value; render();
        savePreferences();
      });
    }
    field('search', 'Search');
    field('stock', 'Availability', [['in','In stock'],['all','Everything'],['out','Out of stock'],['preorder','Preorders'],['unknown','Unknown']]);
    field('sort', 'Sort by', [['title','Title A–Z'],['title-desc','Title Z–A'],['price','Price low–high'],['price-desc','Price high–low'],['original','Original list order']]);
    panel.append(controls);
    const actions = element('div', null, {class:'actions'});
    ui.load = element('button', 'Load all / retry', {type:'button'}); ui.load.onclick = loadAll;
    ui.pause = element('button', 'Pause loading', {type:'button'}); ui.pause.onclick = () => { stopped = true; };
    ui.refresh = element('button', 'Refresh stock', {type:'button'}); ui.refresh.onclick = () => { cache.clear(); for (const item of items.values()) {item.checked=false;item.status='unknown';} pump(); render(); };
    ui.modes={};const modes=element('div',null,{class:'view-modes','aria-label':'View'});
    function savePreferences(){extension?.storage?.local.set({ttlPreferences:{stock:prefs.stock,sort:prefs.sort,layout:prefs.layout}}).catch(()=>{});}
    for(const [mode,label] of [['list','List'],['tiles','Tiles']]){
      const button=element('button',label,{type:'button','aria-pressed':String(mode===prefs.layout)});
      button.onclick=()=>{prefs.layout=mode;savePreferences();render();};ui.modes[mode]=button;modes.append(button);
    }
    actions.append(ui.load, ui.pause, ui.refresh);
    ui.status = element('p', '', {class:'status', role:'status', 'aria-live':'polite'});
    ui.actionStatus=element('p','',{class:'action-status',role:'status','aria-live':'polite'});
    ui.count = element('p', '', {class:'count'}); ui.list = element('ul'); ui.empty = element('p', '', {class:'empty'});
    const manage=element('details',null,{class:'manage'}), manageBox=element('div',null,{class:'manage-box'});
    manageBox.append(actions,ui.status);manage.append(element('summary','Manage'),manageBox);
    const toolbar=element('div',null,{class:'toolbar'});toolbar.append(ui.count,modes,manage);
    panel.append(toolbar,ui.actionStatus,ui.list,ui.empty);
    const original = element('label', 'Show original wishlist', {class:'original'}), toggle=element('input',null,{type:'checkbox'});
    toggle.checked = true; original.prepend(toggle);
    const previousDisplay = host.style.display;
    toggle.onchange = () => { host.style.display = toggle.checked ? previousDisplay : 'none'; };
    panel.append(original);
    const layout=element('div',null,{class:'layout'});
    cart=globalThis.TTLCart({element,safeImage,getProduct,money:(amount,currency)=>new Intl.NumberFormat('en-US',{style:'currency',currency:currency||ui.currency}).format(amount/100),changed:render});
    layout.append(panel,cart.element);view.append(style,layout);
    try {
      const saved = (await extension?.storage?.local.get('ttlPreferences'))?.ttlPreferences;
      if (saved) for (const key of ['stock','sort']) if ([...ui[key].options].some(o=>o.value===saved[key])) { prefs[key]=saved[key];ui[key].value=saved[key]; }
      if(['list','tiles'].includes(saved?.layout))prefs.layout=saved.layout;
    } catch {}
    render();
    let scheduled;
    const observer = new MutationObserver(() => {clearTimeout(scheduled); scheduled=setTimeout(scan,200);});
    timer = setInterval(() => {
      if (!host.isConnected) {clearInterval(timer);observer.disconnect();cart.destroy();container.remove();return;}
      for (const root of roots(host)) if (!lastRoots.includes(root)) {observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['href','data-gw-variant-id']});lastRoots.push(root);}
      scan();
    },1000);
    scan(); loadAll();
  }
  let tries = 0;
  const wait = setInterval(() => {
    const found = document.querySelector('.gw-wl-page-placeholder');
    if (found) {clearInterval(wait);mount(found);}
    else if (++tries >= 60) clearInterval(wait);
  },500);
})();


