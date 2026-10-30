/* Shared pure functions; no network or account access. */
globalThis.TTLWishlist = (() => {
  function productURL(value, base) {
    try {
      const u = new URL(value, base);
      if (u.origin !== new URL(base).origin || !/^\/products\/[^/]+\/?$/.test(u.pathname)) return null;
      u.hash = '';
      const variant = u.searchParams.get('variant');
      u.search = '';
      if (variant && /^\d+$/.test(variant)) u.searchParams.set('variant', variant);
      return u;
    } catch { return null; }
  }
  function enrich(item, product) {
    if (!Array.isArray(product.variants)) throw new Error('Invalid product response');
    const variant = item.variant ? product.variants.find(v => String(v.id) === item.variant) : (product.variants.length === 1 ? product.variants[0] : null);
    const available = item.variant ? variant?.available : product.available;
    const tags = Array.isArray(product.tags) ? product.tags.join(' ') : String(product.tags || '');
    const preorder = /\bpre[ -]?order\b/i.test(`${product.title} ${tags} ${variant?.title || ''}`);
    return {...item, title: product.title || item.title,
      cartVariant: variant?.available === true && !product.requires_selling_plan ? String(variant.id) : null,
      variantTitle: variant?.title && variant.title !== 'Default Title' ? variant.title : '',
      price: typeof variant?.price === 'number' ? variant.price : (!item.variant && typeof product.price === 'number' ? product.price : null),
      comparePrice: typeof variant?.compare_at_price === 'number' ? variant.compare_at_price : null,
      image: variant?.featured_image?.src || product.featured_image || item.image,
      type: product.type || 'Other',
      status: available === false ? 'out' : available === true ? (preorder ? 'preorder' : 'in') : 'unknown',
      checked: true};
  }
  function select(items, {search = '', stock = 'in', sort = 'title'}, customOrder = []) {
    const words = search.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    const result = items.filter(i => (stock === 'all' || i.status === stock) &&
      words.every(w => `${i.title} ${i.variantTitle || ''}`.toLocaleLowerCase().includes(w)));
    const ranks=new Map(customOrder.map((key,index)=>[key,index]));
    result.sort((a, b) => {
      if(sort==='manual')return (ranks.get(a.key)??Infinity)-(ranks.get(b.key)??Infinity) || a.order-b.order;
      if (sort === 'original') return a.order - b.order;
      if (sort === 'price' || sort === 'price-desc') {
        if (a.price == null) return b.price == null ? a.order - b.order : 1;
        if (b.price == null) return -1;
        return (a.price - b.price) * (sort === 'price' ? 1 : -1) || a.order - b.order;
      }
      return a.title.localeCompare(b.title, undefined, {numeric: true, sensitivity: 'base'}) * (sort === 'title-desc' ? -1 : 1) || a.order - b.order;
    });
    return result;
  }
  return {productURL, enrich, select};
})();
if (typeof module !== 'undefined') module.exports = globalThis.TTLWishlist;
