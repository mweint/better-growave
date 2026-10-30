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
  let prefs = {stock: 'in', sort: 'title', type: '', search: ''};
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
      if (active >= 3) break;
      if (item.checked || item.pending) continue;
      active++; item.pending = true;
      getProduct(item.url).then(product => {
        if (items.get(key) === item) items.set(key, core.enrich(item, product));
      }).catch(() => { item.checked = true; item.status = 'unknown'; })
        .finally(() => { item.pending = false; if (items.has(key)) items.get(key).pending = false; active--; render(); setTimeout(pump, 250); });
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
        for (let n = 0; n < 40 && !stopped; n++) {
          await sleep(500); scan();
          if (lastSignature !== before || !button.isConnected || !loaders().includes(button)) { progressed = true; break; }
        }
        if (stopped) break;
        if (!progressed) { loadMessage = 'Loading stalled. Use “Load all / retry” to try again.'; break; }
        await sleep(600);
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
    const types = [...new Set(list.map(i => i.type).filter(Boolean))].sort();
    const oldType = ui.type.value;
    ui.type.replaceChildren(element('option', 'All types', {value: ''}), ...types.map(t => element('option', t, {value: t})));
    ui.type.value = types.includes(oldType) ? oldType : '';
    prefs.type = ui.type.value;
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
      const link = element('a', null, {href: item.url, target: '_blank', rel: 'noopener noreferrer', class: 'product'});
      const image = safeImage(item.image);
      if (image) link.append(element('img', null, {src: image, alt: '', loading: 'lazy', width: '64', height: '64'}));
      else link.append(element('span', '♫', {class: 'cover'}));
      const name = element('span', null);
      name.append(element('strong', item.title));
      if (item.variantTitle) name.append(element('small', item.variantTitle));
      link.append(name); row.append(link);
      row.append(element('span', item.price == null ? '—' : new Intl.NumberFormat('en-US', {style: 'currency', currency: ui.currency}).format(item.price / 100), {class: 'price'}));
      row.append(element('span', item.checked ? labels[item.status] : 'Checking…', {class: `badge ${item.status}`}));
      const buttons=element('div',null,{class:'item-actions'});
      if(item.cartVariant){
        const add=element('button','Add to cart',{type:'button','aria-label':`Add ${item.title} to cart`});
        add.disabled=cart?.isBusy() || !['in','preorder'].includes(item.status);
        add.onclick=()=>cart.add(item);buttons.append(add);
      } else if(item.checked && ['in','preorder'].includes(item.status)) {
        buttons.append(element('a','Choose options',{href:item.url,target:'_blank',rel:'noopener noreferrer'}));
      }
      const remove=element('button','Remove from wishlist',{type:'button','aria-label':`Remove ${item.title} from wishlist`,class:'remove'});
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
      :host{display:block;margin:24px auto;max-width:1400px;color:#202522;font:15px/1.45 system-ui,sans-serif}
      *{box-sizing:border-box} .panel{font:15px/1.45 system-ui,sans-serif;background:#faf9f5;border:1px solid #d6d9d2;border-radius:14px;padding:24px}
      h2{font-size:26px;margin:0 0 4px;letter-spacing:-.6px} p{margin:8px 0;color:#58615a}
      .eyebrow{font-size:11px;font-weight:750;letter-spacing:1.8px;color:#55745f;margin:0 0 6px}
      .controls{display:grid;grid-template-columns:2fr 1.2fr 1.2fr 1fr;gap:12px;margin:20px 0 14px}
      label{font-size:12px;font-weight:650} input,select{display:block;width:100%;font:14px system-ui;margin-top:5px;padding:10px;border:1px solid #abb7ac;border-radius:6px;background:white;color:#202522;min-width:0}
      button{font:600 13px system-ui;border:1px solid #819486;border-radius:6px;background:white;color:#254832;padding:9px 12px;cursor:pointer}
      button:first-child{background:#254832;color:white} button:disabled{opacity:.5;cursor:default}
      :focus-visible{outline:3px solid #b46722;outline-offset:3px}.actions{display:flex;gap:8px;flex-wrap:wrap}
      .status{font-size:12px;min-height:18px}.count{font-weight:650;color:#202522;font-size:13px;margin:18px 0 8px}
      ul{list-style:none;margin:0;padding:0}.record{display:grid;grid-template-columns:minmax(0,1fr) 90px 110px;gap:16px;align-items:center;padding:12px 0;border-top:1px solid #dedfd8}
      .product{display:flex;gap:16px;align-items:center;color:inherit;text-decoration:none;min-width:0}.product:hover strong{text-decoration:underline}
      img,.cover{width:64px;height:64px;object-fit:cover;border-radius:4px;flex-shrink:0;background:#e8e9e2}.cover{display:grid;place-items:center;font-size:24px}
      strong{font-size:14px;font-weight:650}small{display:block;margin-top:4px;color:#58615a}.price{text-align:right;font-variant-numeric:tabular-nums;font-size:14px}
      .badge{font-size:11px;text-align:center;border-radius:20px;padding:5px 8px;background:#e7e8e5;color:#555}.in{background:#dbeadc;color:#235132}.preorder{background:#fae7c9;color:#714707}
      .note{font-size:12px;margin-top:16px}.empty{padding:24px 0}.original{display:flex;align-items:center;gap:8px;margin-top:16px}.original input{width:auto;margin:0}
      .layout{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:20px;align-items:start;font:15px/1.45 system-ui,sans-serif}
      .panel{min-width:0}.controls{grid-template-columns:repeat(2,minmax(0,1fr))}
      .cart{position:sticky;top:100px;border:1px solid #d6d9d2;border-radius:14px;background:#faf9f5;padding:20px;max-height:calc(100vh - 120px);overflow:auto}
      .cart h3{font-size:20px;margin:0 0 12px}.cart a{color:#254832}.cart-item{padding:12px 0;border-bottom:1px solid #dedfd8;overflow-wrap:anywhere}.cart-item a{font-weight:650;font-size:13px;text-decoration:none}
      .cart-total{font-weight:700;color:#202522}.cart-status{font-size:12px}.cart-link{display:block;margin-top:16px;font-weight:650}.cart-items{max-height:45vh;overflow:auto}
      .item-actions{grid-column:1 / -1;display:flex;gap:8px;justify-content:flex-end;align-items:center}.item-actions button{font-size:12px}.item-actions .remove{background:transparent;color:#725042;border-color:#c7b9b2}.item-actions a{font-size:12px;color:#254832}
      .action-status{font-size:13px;color:#254832}.action-status:empty{display:none}
      @media(max-width:1000px){.layout{grid-template-columns:1fr}.cart{position:static;max-height:none;grid-row:1}.cart-items{max-height:220px}}
      @media(max-width:700px){.panel{padding:16px}.controls{grid-template-columns:1fr 1fr}.record{grid-template-columns:minmax(0,1fr) 75px;gap:8px}.badge{grid-column:2}.product{grid-row:span 2;gap:10px}img,.cover{width:48px;height:48px}}
    `);
    const panel = element('div', null, {class: 'panel'});
    panel.append(element('p', 'TURNTABLE LAB / YOUR COLLECTION', {class:'eyebrow'}), element('h2', 'Better wishlist'), element('p', 'Less scrolling. More records.'));
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
        extension?.storage?.local.set({ttlPreferences: {stock:prefs.stock, sort:prefs.sort}}).catch(() => {});
      });
    }
    field('search', 'Search');
    field('stock', 'Availability', [['in','In stock'],['all','Everything'],['out','Out of stock'],['preorder','Preorders'],['unknown','Unknown']]);
    field('sort', 'Sort by', [['title','Title A–Z'],['title-desc','Title Z–A'],['price','Price low–high'],['price-desc','Price high–low'],['original','Original list order']]);
    field('type', 'Product type', [['','All types']]);
    panel.append(controls);
    const actions = element('div', null, {class:'actions'});
    ui.load = element('button', 'Load all / retry', {type:'button'}); ui.load.onclick = loadAll;
    ui.pause = element('button', 'Pause loading', {type:'button'}); ui.pause.onclick = () => { stopped = true; };
    ui.refresh = element('button', 'Refresh stock', {type:'button'}); ui.refresh.onclick = () => { cache.clear(); for (const item of items.values()) {item.checked=false;item.status='unknown';} pump(); render(); };
    actions.append(ui.load, ui.pause, ui.refresh); panel.append(actions);
    ui.status = element('p', '', {class:'status', role:'status', 'aria-live':'polite'});
    ui.actionStatus=element('p','',{class:'action-status',role:'status','aria-live':'polite'});
    ui.count = element('p', '', {class:'count'}); ui.list = element('ul'); ui.empty = element('p', '', {class:'empty'});
    panel.append(ui.status,ui.actionStatus,ui.count,ui.list,ui.empty,element('p','Availability reflects the store’s current purchase status for the saved variant. Preorders are separated when explicitly labeled in product titles or tags. Confirm shipping details on the product page.',{class:'note'}));
    const original = element('label', 'Show original wishlist', {class:'original'}), toggle=element('input',null,{type:'checkbox'});
    toggle.checked = true; original.prepend(toggle);
    const previousDisplay = host.style.display;
    toggle.onchange = () => { host.style.display = toggle.checked ? previousDisplay : 'none'; };
    panel.append(original);
    const layout=element('div',null,{class:'layout'});
    cart=globalThis.TTLCart({element,money:(amount,currency)=>new Intl.NumberFormat('en-US',{style:'currency',currency:currency||ui.currency}).format(amount/100),changed:render});
    layout.append(panel,cart.element);view.append(style,layout);
    try {
      const saved = (await extension?.storage?.local.get('ttlPreferences'))?.ttlPreferences;
      if (saved) for (const key of ['stock','sort']) if ([...ui[key].options].some(o=>o.value===saved[key])) { prefs[key]=saved[key];ui[key].value=saved[key]; }
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
