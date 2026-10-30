/* Uses only Shopify's same-origin cart API; mutations require a button click. */
globalThis.TTLCart = ({element, money, changed}) => {
  let cart = null, busy = false, reading = false, revision = 0, message = 'Loading cart…';
  const aside = element('aside', null, {class:'cart', 'aria-label':'Your shopping cart'});
  const heading = element('h3', 'Your cart');
  const status = element('p', message, {class:'cart-status', role:'status'});
  const list = element('ul', null, {class:'cart-items'});
  const total = element('p', '', {class:'cart-total'});
  const refresh = element('button', 'Refresh cart', {type:'button'});
  const link = element('a', 'View cart / checkout', {href:'/cart', class:'cart-link'});
  aside.append(heading,status,list,total,refresh,link,element('p','Shipping and taxes are calculated at checkout.',{class:'note'}));
  async function request(path, body) {
    const controller = new AbortController(), timeout = setTimeout(()=>controller.abort(),15000);
    try {
      const response = await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',
        headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:controller.signal});
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(typeof data.description === 'string' ? data.description : 'The store could not update your cart.');
        error.rejected = true; throw error;
      }
      return data;
    } finally {clearTimeout(timeout);}
  }
  function render() {
    heading.textContent = cart ? `Your cart (${cart.item_count})` : 'Your cart';
    status.textContent = message; refresh.disabled = busy || reading;
    list.replaceChildren();
    if (cart) {
      if (!cart.items.length) list.append(element('li','Your cart is empty.',{class:'note'}));
      for (const item of cart.items) {
        const row = element('li',null,{class:'cart-item'});
        // Only same-origin product links are used; all store text is plain text.
        const url = globalThis.TTLWishlist.productURL(item.url,location.href);
        row.append(url ? element('a',item.product_title || item.title,{href:url.href}) : element('strong',item.product_title || item.title));
        if(item.variant_title && item.variant_title !== 'Default Title') row.append(element('small',item.variant_title));
        row.append(element('small',`Qty ${item.quantity} · ${money(item.final_line_price,cart.currency)}`));
        list.append(row);
      }
      total.textContent = `Subtotal ${money(cart.total_price,cart.currency)}`;
    }
  }
  async function refreshCart(keepMessage=false) {
    if (reading || busy) return;
    reading=true; const current=revision; render();
    try {
      const data=await request('/cart.js');
      if(!Array.isArray(data.items) || typeof data.total_price !== 'number') throw new Error('Invalid cart response');
      if(current===revision){cart=data;if(!keepMessage)message='Up to date.';}
    } catch {if(current===revision)message='Could not refresh the cart. Use Refresh cart to retry.';}
    finally {reading=false;render();}
  }
  async function add(item) {
    if(busy || !item.cartVariant || !['in','preorder'].includes(item.status))return;
    busy=true;revision++;message='Adding to cart…';render();changed();
    let added=false;
    try {
      await request('/cart/add.js',{items:[{id:item.cartVariant,quantity:1}]});
      added=true;message=`Added: ${item.title}`;
    } catch(error) {
      message=error.rejected?error.message:'The cart request was interrupted. Check the cart before adding again; it may have succeeded.';
    } finally {
      // Always reconcile after a mutation; never automatically retry a POST.
      try {
        const data=await request('/cart.js');
        if(!Array.isArray(data.items) || typeof data.total_price !== 'number')throw new Error('Invalid cart response');
        cart=data;
      } catch {message=added?'Added, but the cart preview could not refresh. Open View cart to verify.':`${message} Cart preview unavailable.`;}
      busy=false;render();changed();
    }
  }
  refresh.onclick=()=>refreshCart();
  const onFocus=()=>refreshCart();
  window.addEventListener('focus',onFocus);
  const interval=setInterval(()=>{if(!document.hidden)refreshCart();},30000);
  refreshCart();
  return {element:aside,add,isBusy:()=>busy,destroy(){clearInterval(interval);window.removeEventListener('focus',onFocus);}};
};
