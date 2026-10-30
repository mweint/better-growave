# Publish or sign Better Growave

GitHub is the source repository. Mozilla Add-ons (AMO) is the separate signing and optional hosting service. No signing credentials are included in this repository, and the workflow does not submit anything to Mozilla.

## Get the correct ZIP

1. Open the repository's **Actions** tab and select a successful **Test and package** run.
2. Download **better-growave-firefox-upload** from its artifacts.
3. Extract that artifact. The file to submit is **better-growave-0.3.0.zip**, not the artifact's outer ZIP or GitHub's source-code ZIP.

Alternatively run `npm ci`, `npm run lint`, `npm test`, and `npm run build` locally. The upload ZIP will be in `dist/`.

## Submit to Mozilla

1. Sign in with a Mozilla account at the [Add-ons Developer Hub](https://addons.mozilla.org/developers/).
2. Choose **Submit a New Add-on**.
3. Choose **On this site** for a public Firefox Add-ons listing and automatic updates, or **On your own** for private/self-distributed signing.
4. Upload the inner extension ZIP and resolve any validator findings.
5. The package contains readable JavaScript and JSON with no transpilation, bundling, or minification. The packaged files are the source. Answer source-code questions accordingly; provide this repository if reviewers request context.
6. Review the listing details and permissions, provide the privacy policy, and submit.
7. Once signed/approved, install using the public listing or signed `.xpi` file. This survives restarts. The extracted development folder is no longer required by Firefox.

The public listing is associated with an AMO developer profile. You can choose a display name, but a Mozilla account is required; this is not anonymous submission to Mozilla. This GitHub repository is publicly associated with `mweint`.

## Suggested listing text

**Name:** Better Growave

**Summary:** Improve Turntable Lab's Growave wishlist with stock filters, search, sorting, quick actions, and a sticky cart preview.

**Description:** Better Growave makes long wishlists easier to shop. It automatically loads more items, filters by current availability, and sorts by title or price. Add a saved variant to your cart, remove an item from your wishlist, and see cart thumbnails, quantities, sale prices, discounts, and total alongside the list. Automatically supports Turntable Lab, with experimental toolbar activation on other Shopify/Growave wishlists. Unofficial; not affiliated with Growave or Turntable Lab. Availability is the store's current purchase status, and preorder detection depends on explicit labels.

**Privacy policy:** https://github.com/mweint/better-growave/blob/main/PRIVACY.md

**Support / source:** https://github.com/mweint/better-growave

**Reviewer notes:** Requires a Turntable Lab account with saved wishlist items to exercise the live widget. No paid account with the extension developer is required. Content scripts run automatically on `https://www.turntablelab.com/pages/wishlist*`; the toolbar can activate them on another supported HTTPS Growave wishlist. The `storage` permission saves filter/sort/view preferences only. `activeTab` and `scripting` allow explicit toolbar activation on another supported HTTPS Growave wishlist without blanket host access. Cart additions use same-origin Shopify Ajax requests; wishlist removal delegates to the exact original Growave item control. The code does not contain remote executable scripts or credentials. The repository includes mocked browser tests. Do not submit a real user's login or session data in reviewer notes; arrange a dedicated test account if reviewers require one.

## Updates

Increment the extension and package versions, commit, and let the workflow validate/package the update. Upload the new ZIP to the existing AMO entry, keeping its add-on ID unchanged. Public AMO installations receive published updates through Firefox. Self-distribution requires distributing each signed update yourself unless you later configure an update service.

The existing add-on ID is retained from the initial local prototype to preserve update identity. Its `.example` suffix is an identifier, not an email address or a contacted service.

## References

- [Mozilla submission walkthrough](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)
- [Signing and distribution](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)
- [Developer account display names](https://extensionworkshop.com/documentation/publish/developer-accounts/)
