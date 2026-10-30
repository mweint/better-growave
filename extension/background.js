/* A toolbar click grants temporary access to the selected tab only. */
browser.action.onClicked.addListener(async tab => {
  if (!Number.isInteger(tab.id)) return;
  const mark = (text,title) => Promise.all([
    browser.action.setBadgeText({tabId:tab.id,text}),
    browser.action.setTitle({tabId:tab.id,title})
  ]);
  try {
    if (!tab.url?.startsWith('https://')) {
      await mark('!', 'Open an HTTPS Growave wishlist, then click again.');return;
    }
    const result=await browser.scripting.executeScript({target:{tabId:tab.id},func:()=>Boolean(document.querySelector('.gw-wl-page-placeholder'))});
    if (!result.some(r=>r.result)) {
      await mark('?', 'No supported Growave wishlist found. Open the wishlist page, wait for it to load, then click again.');return;
    }
    await browser.scripting.executeScript({target:{tabId:tab.id},files:['core.js','cart.js','content.js']});
    await mark('', 'Better Growave enabled here. Other stores are experimental.');
  } catch {
    await mark('!', 'Could not enable Better Growave here. Open a store wishlist and try again.').catch(()=>{});
  }
});
