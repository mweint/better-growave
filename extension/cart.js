/* Same-origin Shopify cart actions. Only explicit user clicks mutate the cart. */
globalThis.TTLCart = ({element, money, changed, safeImage, getProduct}) => {
  let cart=null, busy=false, reading=false, revision=0, message='Loading cart…';
  const comparisons=new Map();
  const aside=element('aside',null,{class:'cart','aria-label':'Your shopping cart'});
  const heading=element('h3','Your cart');
  const status=element('p',message,{class:'cart-status',role:'status'});
  const list=element('ul',null,{class:'cart-items'});
  const summary=element('div',null,{class:'cart-summary'});
  const refresh=element('button','Refresh cart',{type:'button'});
  const link=element('a','View cart / checkout',{href:'/cart',class:'cart-link'});
  aside.append(heading,status,list,summary,refresh,link,element('p','Shipping, taxes, and checkout-only offers are confirmed at checkout.',{class:'note'}));
  async function request(path,body){
    const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:controller.signal});
      const data=await response.json();
      if(!response.ok){const error=new Error(typeof data.description==='string'?data.description:'The store could not update your cart.');error.rejected=true;throw error;}
      return data;
    }finally{clearTimeout(timeout);}
  }
  function accept(data){
    if(!Array.isArray(data.items)||typeof data.total_price!=='number')throw new Error('Invalid cart response');
    cart=data;hydrateComparisons(data);
  }
  async function hydrateComparisons(snapshot){
    // Catalogue compare-at prices are not part of cart JSON. Charged prices
    // always come from the cart; product metadata only supplies the strikeout.
    const queue=snapshot.items.filter(i=>i.variant_id && !comparisons.has(String(i.variant_id)));
    async function worker(){
      while(queue.length){
        const item=queue.shift(), id=String(item.variant_id);comparisons.set(id,null);
        const url=globalThis.TTLWishlist.productURL(item.url,location.href);if(!url)continue;
        try{const product=await getProduct(url.href);const variant=product.variants?.find(v=>String(v.id)===id);if(typeof variant?.compare_at_price==='number')comparisons.set(id,variant.compare_at_price);}
        catch{/* Cart price remains authoritative if catalogue lookup fails. */}
        if(cart===snapshot)render();
      }
    }
    await Promise.all([worker(),worker()]);
  }
  function render(){
    heading.textContent=cart?`Your cart (${cart.item_count})`:'Your cart';
    status.textContent=message;refresh.disabled=busy||reading;list.replaceChildren();summary.replaceChildren();
    if(!cart)return;
    if(!cart.items.length)list.append(element('li','Your cart is empty.',{class:'note'}));
    for(const item of cart.items){
      const row=element('li',null,{class:'cart-item'});
      const image=safeImage(item.featured_image?.url || item.featured_image?.src || item.image);
      row.append(image?element('img',null,{src:image,alt:'',width:'48',height:'48',loading:'lazy'}):element('span','♫',{class:'cover'}));
      const details=element('div');
      const url=globalThis.TTLWishlist.productURL(item.url,location.href);
      details.append(url?element('a',item.product_title||item.title,{href:url.href}):element('strong',item.product_title||item.title));
      if(item.variant_title&&item.variant_title!=='Default Title')details.append(element('small',item.variant_title));
      details.append(element('small',`Qty ${item.quantity}`));
      const price=element('div',null,{class:'cart-price'});
      const charged=item.final_line_price ?? item.line_price;
      const compare=Math.max(item.original_line_price||0,(comparisons.get(String(item.variant_id))||0)*item.quantity);
      if(compare>charged)price.append(element('del',money(compare,cart.currency)));
      price.append(element('span',money(charged,cart.currency),{class:compare>charged?'sale':''}));details.append(price);
      for(const allocation of item.line_level_discount_allocations||[])details.append(element('div',`${allocation.discount_application?.title||'Item discount'}: −${money(allocation.amount,cart.currency)}`,{class:'cart-discount'}));
      row.append(details);
      const remove=element('button','×',{type:'button',class:'cart-remove',title:'Remove from cart','aria-label':`Remove ${item.product_title||item.title} from cart`});
      remove.disabled=busy||!item.key;remove.onclick=()=>mutate('/cart/change.js',{id:item.key,quantity:0},`Removed from cart: ${item.product_title||item.title}`);
      row.append(remove);list.append(row);
    }
    const line=(label,value,cls='')=>{const p=element('p',null,{class:cls});p.append(element('span',label),element('span',value));summary.append(p);};
    if(typeof cart.items_subtotal_price==='number'&&cart.items_subtotal_price!==cart.total_price)line('Items',money(cart.items_subtotal_price,cart.currency));
    for(const discount of cart.cart_level_discount_applications||[])line(discount.title||'Cart discount',`−${money(discount.total_allocated_amount,cart.currency)}`,'cart-discount');
    if(cart.total_discount>0 && !(cart.cart_level_discount_applications||[]).length)line('Discounts included',money(cart.total_discount,cart.currency),'cart-discount');
    line('Total',money(cart.total_price,cart.currency),'cart-total');
  }
  async function refreshCart(){
    if(reading||busy)return;reading=true;const current=revision;render();
    try{const data=await request('/cart.js');if(current===revision){accept(data);message='';}}
    catch{if(current===revision)message='Could not refresh the cart. Use Refresh cart to retry.';}
    finally{reading=false;render();}
  }
  async function mutate(path,body,success){
    if(busy)return;busy=true;revision++;message='Updating cart…';render();changed();let applied=false;
    try{await request(path,body);applied=true;message=success;}
    catch(error){message=error.rejected?error.message:'The request was interrupted. Check the cart before retrying; it may have succeeded.';}
    finally{
      try{accept(await request('/cart.js'));}
      catch{message=applied?'Cart updated, but the preview could not refresh. Open View cart to verify.':`${message} Cart preview unavailable.`;}
      busy=false;render();changed();
    }
  }
  const add=item=>{if(item.cartVariant&&['in','preorder'].includes(item.status))return mutate('/cart/add.js',{items:[{id:item.cartVariant,quantity:1}]},`Added: ${item.title}`);};
  refresh.onclick=refreshCart;window.addEventListener('focus',refreshCart);
  const interval=setInterval(()=>{if(!document.hidden)refreshCart();},30000);refreshCart();
  return {element:aside,add,isBusy:()=>busy,destroy(){clearInterval(interval);window.removeEventListener('focus',refreshCart);}};
};
