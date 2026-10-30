# Better Growave

An unofficial Firefox extension that makes Growave wishlists easier to browse and shop.

**Currently supports Turntable Lab only.** Growave powers wishlists on many stores, but stores differ in their theme, cart behavior, and widget configuration. This release deliberately requests access only to Turntable Lab's wishlist page. It is not affiliated with Growave or Turntable Lab.

## Features

- Automatically loads more wishlist items, with pause and retry.
- Filters by current availability and product type; searches artist/album/title text.
- Sorts by title, price, or original loading order and remembers stock/sort preferences.
- Adds one of the saved variant to the existing store cart. Products requiring option selection link to the product page.
- Removes an item using its original Growave control, including the newer item-menu layout.
- Shows cart quantities and subtotal in a desktop sidebar that stays visible while scrolling. On narrow screens it sits above the list.
- Refreshes the cart after additions, when the window regains focus, and every 30 seconds while the page is visible.

The original wishlist stays available below the enhanced view. Use it to change lists, then choose **Load all / retry** again. Adding to cart does not remove an item from the wishlist.

## Try it in Firefox

1. Download this repository using **Code → Download ZIP** and extract it.
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Click **Load Temporary Add-on…** and choose `extension/manifest.json`.
4. Reload your signed-in [Turntable Lab wishlist](https://www.turntablelab.com/pages/wishlist).

For an update, replace your extracted copy, remove the old temporary add-on, load the new `extension/manifest.json`, and reload the wishlist. Firefox removes temporary installations when it restarts.

## Install permanently / publish

GitHub hosts the project; **Mozilla must still sign the extension** for normal permanent Firefox installation. See [PUBLISHING.md](PUBLISHING.md) for the short upload procedure. A GitHub source ZIP is not the Mozilla upload package because it has an extra top-level folder.

Every successful [GitHub Actions build](https://github.com/mweint/better-growave/actions) produces a **better-growave-firefox-upload** artifact. Extract that artifact and submit the inner `better-growave-0.2.0.zip` to Mozilla. The inner ZIP has `manifest.json` at its root.

## Development

Requires Node.js 22 and Python 3.

```sh
npm ci
npx playwright install chromium
npm run lint
npm test
npm run build
```

The distributable is `dist/better-growave-0.2.0.zip`, with a SHA-256 file beside it. The build only packages the four files in `extension/`; it does not bundle dependencies or fetch remote code. It normalizes line endings and timestamps for reproducible ZIPs.

Tests use mocked store responses and DOM fixtures built from the observed Growave structures. They never touch a real user's cart or wishlist. If using an already-installed Chromium browser, set `PLAYWRIGHT_EXECUTABLE_PATH` to that executable; otherwise tests use Playwright's bundled Chromium. Screenshots go to `test-results/`.

## Accuracy and current limits

Availability is Shopify's purchasability flag for the saved variant, not a warehouse count. Explicit preorder titles/tags are separated; unlabeled backorders can still appear as in stock. Failed checks stay **Unknown**. Confirm shipping details on the product page.

Automatic loading covers the currently displayed list(s), not tabs that have not been opened. Duplicate appearances of the same variant are grouped; **Remove from wishlist** removes the first matching displayed entry and reports if another remains. No batch deletion is performed. If a site confirmation is needed, use the original wishlist; the extension does not guess which dialog button to press.

The initial browsing version was reported working on the user's Turntable Lab wishlist. Version 0.2.0's cart/removal actions have passed isolated browser tests, but still need live-account verification. Native theme cart badges may not immediately reflect additions; the extension's cart preview and the actual cart page use the store's cart data.

## Privacy

No analytics, external backend, credentials, or wishlist snapshots are stored by the extension. Only stock-filter and sort preferences are saved locally. Product/cart requests go to the current store, and item removal uses the store's existing Growave control. Product images use the store-provided image URLs. See [PRIVACY.md](PRIVACY.md).

## Supporting another store

Add and test a store-specific adapter and narrow site permission before expanding the supported-sites list. Verify shadow DOM structure, item/variant identity, pagination, removal controls, currency, and cart semantics. Avoid requesting access to every site just because it might use Growave.
