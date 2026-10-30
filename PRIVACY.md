# Privacy

Better Growave has no analytics, telemetry, developer-operated server, or advertising.

It reads the wishlist rendered by the current store to display the enhanced view. It requests current product data and the existing session cart from that same store, using the browser's normal same-origin session. It requests product images from URLs supplied by the store. Store services, including Growave for wishlist actions, continue to operate under their own policies.

The extension saves the selected availability filter, sort mode, list/tile view, and custom product URL order in Firefox's local extension storage. Custom order is scoped to the store, not an account or individual list; lists/accounts on the same store share that order in this browser profile. Product details and cart data remain in page memory. None of this data is sent to the extension developer. It does not read passwords, export cookies, or request access to other browsing history.

Adding to cart and removing a wishlist item happen only after the corresponding user click. Cart reads occur when the panel loads, after an add, on window focus, on a manual refresh, and every 30 seconds while the page is visible. It never submits checkout or purchases.

Removing the extension removes its ability to run. No separate account with the extension developer is required.

On Turntable Lab the extension activates automatically. Other stores require an explicit toolbar click, using activeTab and scripting to inspect and enhance that tab. No all-websites host permission is requested. Cart-line removal uses the exact Shopify line key and occurs only after a user click.

Custom ordering stores product URLs locally per store in this browser profile. It is not uploaded or synced and does not change the store wishlist. No account credentials are stored.
