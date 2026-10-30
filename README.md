# Better Growave

An unofficial Firefox extension that makes Growave wishlists easier to browse and shop.

**Turntable Lab is the tested store.** On other Shopify/Growave wishlist pages, click the extension's toolbar button to try experimental support. This grants temporary access to the selected tab only; it does not request permission for every website. Refreshing another store's page requires clicking again. Unsupported layouts and non-Shopify carts are not guaranteed to work. The project is not affiliated with Growave or any store.

## Features

- Centered, bounded browsing with an approximately 840px wishlist and 296px cart sidebar on desktop; the cart stacks below on smaller screens.
- Remembered compact list and three-column tile views with aligned titles, prices, and actions. Loading and refresh controls live under **Manage**. A filled heart removes a saved item; × removes a cart line.
- No raw internal product-type filter.
- Up to six concurrent stock checks and batched display updates. Pagination stays sequential because Growave advances its own offset, with unnecessary per-page pauses removed.
- Store-reported sale prices, named item/cart discounts, and authoritative cart totals; no assumed or invented promotional eligibility.

- Automatically loads more wishlist items, with pause and retry.
- Filters by current availability; searches artist/album/title text.
- Sorts by title, price, or original loading order and remembers stock/sort/view preferences.
- Adds one of the saved variant to the existing store cart. Products requiring option selection link to the product page.
- Removes an item using its original Growave control, including the newer item-menu layout.
- Shows cart thumbnails, quantities, sale prices, discounts, and total in a desktop sidebar that stays visible while scrolling. On narrower screens it sits below the full-width list instead of squeezing it.
- Refreshes the cart after additions, when the window regains focus, and every 30 seconds while the page is visible.

The original wishlist stays available below the enhanced view. Use it to change lists, then choose **Manage → Load all / retry** again. Adding to cart does not remove an item from the wishlist.

## Try it in Firefox

1. Download this repository using **Code → Download ZIP** and extract it.
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Click **Load Temporary Add-on…** and choose `extension/manifest.json`.
4. Reload your signed-in [Turntable Lab wishlist](https://www.turntablelab.com/pages/wishlist).

For an update, replace your extracted copy, remove the old temporary add-on, load the new `extension/manifest.json`, and reload the wishlist. Firefox removes temporary installations when it restarts.

## Install permanently / publish

GitHub hosts the project; **Mozilla must still sign the extension** for normal permanent Firefox installation. See [PUBLISHING.md](PUBLISHING.md) for the short upload procedure. A GitHub source ZIP is not the Mozilla upload package because it has an extra top-level folder.

Every successful [GitHub Actions build](https://github.com/mweint/better-growave/actions) produces a **better-growave-firefox-upload** artifact. Extract that artifact and submit the inner `better-growave-0.3.1.zip` to Mozilla. The inner ZIP has `manifest.json` at its root.

## Development

Requires Node.js 22 and Python 3.

```sh
npm ci
npx playwright install chromium
npm run lint
npm test
npm run build
```

The distributable is `dist/better-growave-0.3.1.zip`, with a SHA-256 file beside it. The build only packages the five files in `extension/`; it does not bundle dependencies or fetch remote code. It normalizes line endings and timestamps for reproducible ZIPs.

Tests use mocked store responses and DOM fixtures built from the observed Growave structures. They never touch a real user's cart or wishlist. If using an already-installed Chromium browser, set `PLAYWRIGHT_EXECUTABLE_PATH` to that executable; otherwise tests use Playwright's bundled Chromium. Screenshots go to `test-results/`.

## Accuracy and current limits

Availability is Shopify's purchasability flag for the saved variant, not a warehouse count. Explicit preorder titles/tags are separated; unlabeled backorders can still appear as in stock. Failed checks stay **Unknown**. Confirm shipping details on the product page.

Automatic loading covers the currently displayed list(s), not tabs that have not been opened. Duplicate appearances of the same variant are grouped; **Remove from wishlist** removes the first matching displayed entry and reports if another remains. No batch deletion is performed. If a site confirmation is needed, use the original wishlist; the extension does not guess which dialog button to press.

The initial browsing version was reported working on the user's Turntable Lab wishlist. Version 0.3.1's cart/removal actions have passed isolated browser tests, but still need live-account verification. Native theme cart badges may not immediately reflect additions; the extension's cart preview and the actual cart page use the store's cart data.

## Privacy

No analytics, external backend, credentials, or wishlist snapshots are stored by the extension. Only stock-filter, sort, and view preferences are saved locally. Product/cart requests go to the current store, and item removal uses the store's existing Growave control. Product images use the store-provided image URLs. See [PRIVACY.md](PRIVACY.md).

## Supporting another store

Add and test a store-specific adapter and narrow site permission before expanding the supported-sites list. Use the toolbar path to test first. Verify shadow DOM structure, item/variant identity, pagination, removal controls, currency, and cart semantics. Avoid requesting access to every site just because it might use Growave.
