# WooCommerce Side Cart (Drawer)

WooCommerce plugin that adds a **drawer-style side cart** (overlay + backdrop) with cart updates via the **WooCommerce Store API** and a modern UI **without jQuery**.

The UI rendering is mainly **client-side**: the server markup is a stable container, while items/totals/coupons are (re)built by the JS renderer based on the cart payload.

## Features

- Drawer overlay, backdrop, and scroll lock
- Cart updates via Store API (`/wp-json/wc/store/v1/cart/...`)
- Quantity editing with stepper (optional) and item removal
- Minimal/editorial UI driven by **CSS variables** (tokens `--wcsc-*`)
- Extensible via:
  - extra classes via config (`cssClasses`)
  - “privileged” HTML hooks via config (`hooksHtml`) + sanitization policy
  - client-side renderer overrides (advanced)

## Project structure

- `assets/css/woocommerce_side_cart.base.css`: base drawer styles (tokens + layout + components)
- `assets/js/woocommerce_side_cart(.min).js`: compiled bundle
- `src/js/`: JS sources (entry: `src/js/index.js`)
- `templates/`: PHP templates (containers/slots)
- `includes/`: config loader, CSS vars sanitization, server-side utilities
- `woocommerce-side-cart.config.php`: default config shipped with the plugin (override-friendly)

## Build (development)

Requires Node.js.

```bash
npm install
npm run ci
```

Useful scripts:

- `npm run lint:js`
- `npm run build`

## Configuration (drop-in)

You can configure the plugin via files:

- `woocommerce-side-cart.config.json` (recommended, data-only)
- `woocommerce-side-cart.config.php` (must **return a PHP array**)

### Config file resolution order

The **first valid file** found is used, in this order:

1. `wp-content/woocommerce-side-cart.config.json`
2. `wp-content/woocommerce-side-cart.config.php`
3. `wp-content/themes/<active-theme>/woocommerce-side-cart.config.json` (child theme)
4. `wp-content/themes/<active-theme>/woocommerce-side-cart.config.php` (child theme)
5. `wp-content/plugins/woocommerce-side-cart/woocommerce-side-cart.config.json`
6. `wp-content/plugins/woocommerce-side-cart/woocommerce-side-cart.config.php`

Useful filters:

- `wc_side_cart_config_path`: adds a custom path with maximum priority
- `wc_side_cart_config_paths`: replaces/reorders the whole path list
- `wc_side_cart_config`: filters the config after merging with defaults

## Localization (i18n)

This plugin avoids custom translation strings and relies on:

- WooCommerce core strings (`textdomain: woocommerce`)
- messages returned by the Store API (already translated by WooCommerce)

In practice: you do not need a plugin translation file to get a translated UI.

### Example config (PHP)

```php
<?php
return array(
	'ui' => array(
		'showCheckoutButton' => true,
		'showViewCartButton' => true,
		'showCoupons' => true,
		'showItemRemove' => true,
		'showItemQuantity' => true,
		'enableQuantityEditing' => true,
		'showItemPrice' => true,
		'showItemThumbnail' => true,
	),
	'cssVars' => array(
		'--wcsc-accent' => '#2d6cff',
	),
	'hooksHtml' => array(
		'aboveItems' => '',
		'afterFirstItem' => '',
		'afterActions' => '',
	),
	'hooksHtmlPolicy' => 'post',
);
```

## UI flags (current behavior)

These flags are the most important for the cart UX.

- `ui.showItemQuantity`
  - If `true`: shows the row under the product title with **“quantity × unit price”**
  - If `false`: hides this row
- `ui.enableQuantityEditing`
  - If `true`: shows the **stepper** to change the quantity
  - If `false`: no stepper; if `ui.showItemQuantity` is `true` and the “qty × unit” row is not available, a minimal fallback with the quantity is displayed
- `ui.showItemLinks`
  - If `true`: the product name is clickable
  - If `false`: the product name is plain text&#x20;

Other flags:

- `ui.showItemPrice`: shows the line price (line total) in the actions column
- `ui.showItemRemove`: shows the “Remove” action
- `ui.showItemThumbnail`: shows the product thumbnail
- `ui.showCoupons`: shows the coupon UI (if Store API endpoints are available)
- `ui.showSubtotal`, `ui.showShipping`, `ui.showTaxes`, `ui.showTotal`: control rows in totals
- `ui.showFloatingCartIcon`: shows the built-in floating icon
- `ui.openTriggerElementId`: id of an external element that opens/closes the drawer
- `ui.badgeElementId`: id of an external element for the count badge
- `ui.autoOpenOnAddToCart`: auto-open after add-to-cart

## Styling (CSS Variables)

The look is primarily driven by `--wcsc-*` variables (you can pass them via `cssVars` in config).

Typical tokens:

- `--wcsc-accent`
- `--wcsc-surface`, `--wcsc-surface-2`
- `--wcsc-text`, `--wcsc-muted`
- `--wcsc-border`
- `--wcsc-shadow`
- `--wcsc-panel-width`

Note: only variables matching `^--wcsc-[a-z0-9_-]+$` are accepted.

## Extra classes (cssClasses)

For structural customizations you can add extra classes via config:

- `cssClasses.panel`, `backdrop`, `container`, `header`, `form`, `items`, `item`, `footer`, `totals`, `coupon`, `floatingIcon`
- `cssClasses.itemOdd` / `itemEven`: classes added to items based on parity (useful for theme overrides)

## Hook HTML (hooksHtml)

Available slots:

- `aboveItems`: above the items list
- `afterFirstItem`: after the first item
- `afterActions`: below the footer CTAs

Security:

- `hooksHtmlPolicy`: `post` (default) | `strict` | `none`
- `hooksHtmlOptions.enabled`: enables/disables output
- `hooksHtmlOptions.maxLength`: clamp 0..50000

Best practice: use HTML hooks to inject **lightweight containers** and update dynamic content via JS on the `side_cart_refreshed` event.

## Public JS events

All `side_cart_*` events are emitted as `CustomEvent` on `document.body` (so use `document.body.addEventListener(...)`).

Main events:

- `side_cart_open`: the drawer has been opened
- `side_cart_close`: the drawer has been closed
- `side_cart_before_render`: before render (`detail: { cart }`)
- `side_cart_after_render`: after render (`detail: { cart }`)
- `side_cart_refreshed`: full render/refresh (`detail: { cart }`)
- `side_cart_cart_updated`: cart updated after render or mutations (`detail: { cart }`)
- `side_cart_cart_fetched`: cart fetched from Store API (`detail: { cart }`)
- `side_cart_error`: Store API or runtime error (`detail: { error }`)
- `side_cart_coupon_applied`: coupon applied (`detail: { code, cart }`)
- `side_cart_coupon_removed`: coupon removed (`detail: { code, cart }`)

Example:

```js
document.body.addEventListener('side_cart_cart_updated', function(e) {
	var cart = e.detail && e.detail.cart;
});

document.body.addEventListener('side_cart_error', function(e) {
	var err = e.detail && e.detail.error;
});
```

### WooCommerce Blocks events&#x20;

After Store API mutations, the plugin also emits events to invalidate/update WooCommerce Blocks on `document`, `document.body`, and `window`:

- `wc-blocks_added_to_cart` (`detail: { preserveCartData: false, cartItemKey? }`)
- `wc-blocks_removed_from_cart` (`detail: { preserveCartData: false, cartItemKey? }`)

## JS hooks (renderer override)

The runtime exposes a small registry to replace UI portions without forking the plugin:

- `window.wcSideCart.registerRenderer(name, fn)`
- `window.wcSideCart.registerRenderers(map)`
- `window.wcSideCart.resetRenderers()`

Available renderers: `empty`, `items`, `totals`.

Signature:

`fn(dom, cart, api)`

- `dom`: main drawer nodes (items/totals/footer, etc.)
- `cart`: Store API payload
- `api`: helpers (emit, refreshCart, updateItemQuantity, removeItem, applyCoupon, removeCoupon, createPriceSpan, appendHook, selectors)

Example:

```js
document.addEventListener('DOMContentLoaded', function() {
	if (!window.wcSideCart || !window.wcSideCart.registerRenderer) return;
	window.wcSideCart.registerRenderer('totals', function(dom, cart, api) {
		dom.totals.textContent = 'Custom totals';
	});
});
```

## Parity / trigger behavior (parity)

- `parity.onCartClickBehaviour`: `open_drawer` | `navigate_to_cart` | `navigate_to_checkout` | `navigate_to_url`
- `parity.cartCheckoutGating`: `removed` | `hidden`
- `parity.blocksSyncDebug`: minimal logging for Blocks sync diagnostics

## Plugin modes

- `mode: "ui"` (default): renders the full UI
- `mode: "headless"`: enables logic/integrations only (no UI)

## License

See the project license file (if present) or the plugin header.
