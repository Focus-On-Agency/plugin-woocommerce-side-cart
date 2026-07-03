# WooCommerce Side Cart (Drawer)

WooCommerce plugin that adds a **drawer-style side cart** (overlay + backdrop) with cart updates via the **WooCommerce Store API** and a modern UI **without jQuery**.

The UI rendering is mainly **client-side**: the server markup is a stable container, while items/totals/coupons are (re)built by the JS renderer based on the cart payload.

## Changelog

See [changelog.txt](./changelog.txt).

- 3.3.2: Temporary debug build with console tracing for Store API cart token / add-to-cart sync, plus auth-aware client state handling.
- 3.3.1: Fix cart refresh after removing the last item (prevents restoring stale items after the cart becomes empty).

## Features

- Drawer overlay, backdrop, and scroll lock
- Cart updates via Store API (`/wp-json/wc/store/v1/cart/...`)
- Quantity editing with stepper (optional) and item removal
- Hard-disabled on Checkout (no assets / no markup)
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

## Config reference (all supported keys)

Root keys (top-level):

- `mode`: `"ui"` (default) | `"headless"`
- `storeApi.cacheBusting`
  - `enabled`: `bool` (default `false`)
  - `param`: `string` (default `"wcsc_cb"`, max 64, `[a-zA-Z0-9_-]`)
  - `strategy`: `"timestamp"` (default) | `"random"`
- `storeApi.hydration`
  - `onLoad`: `"never"` (default) | `"ifCartCookie"` | `"always"`
  - `updateHooksContext`: `bool` (default `true`)
- `dom.selectors`: `object<string,string>` (override internal selectors)
  - allowed keys: `panel`, `backdrop`, `container`, `header`, `form`, `items`, `footer`, `totals`, `item`, `floatingIcon`, `emptyTemplate`, `toggle`, `remove`, `qtyInput`, `stepperDec`, `stepperInc`
- `parity`
  - `cartCheckoutGating`: `"removed"` (default) | `"hidden"` (applies to the Cart page; Checkout is always forced to `removed`)
  - `onCartClickBehaviour`: `"open_drawer"` (default) | `"navigate_to_checkout"` | `"navigate_to_cart"` | `"navigate_to_url"`
  - `blocksSyncDebug`: `bool` (default `false`)
- `composite`
  - `groupMode`: `"flat"` (default) | `"noindent"` | `"parent"`
  - `showChildren`: `bool` (default `true`)
  - `summary`
    - `labelSource`: `component_title` (default) | `name`
    - `separator`: `string` (default ` · `)
- `ui`
  - visibility/rows: `showViewCartButton`, `showCheckoutButton`, `showItemRemove`, `showItemQuantity`, `enableQuantityEditing`, `showItemLinks`, `showItemPrice`, `showItemThumbnail`, `showSubtotal`, `showShipping`, `showTaxes`, `showTotal`, `showCoupons` (`bool`)
  - triggers/badge: `openTriggerElementId` (`string`), `badgeElementId` (`string`)
  - behavior: `autoOpenOnAddToCart` (`bool`)
  - floating trigger: `showFloatingCartIcon` (`bool`)
  - scroll lock: `lockPageScroll` (`bool`, default `true`)
  - count badge: `hideCountWhenZero` (`bool`, default `false`)
  - client-only: `disableUiListeners` (`bool`, default `false`)
- `cssVars`: `object<string,string>` (only keys matching `^--wcsc-[a-z0-9_-]+$`)
- `cssClasses`: `object<string,string>` (extra classes applied to drawer nodes)
- `hooksHtml`
  - `aboveItems`, `afterFirstItem`, `afterActions`: `string`
- `hooksHtmlOptions`
  - `enabled`: `bool` (default `true`)
  - `maxLength`: `int` clamped `0..50000` (default `5000`)
- `hooksHtmlPolicy`: `"post"` (default) | `"strict"` | `"none"`

## Full Page Cache (guest) support

This plugin can be used with **full page cache** (including CDN edge cache) for **guest visitors**, with the important constraint that the **Store API cart endpoints must not be cached**.

Key points:

- Logged-in users: always bypass full page cache (recommended and expected for WooCommerce).
- Store API cart: bypass/no-cache these routes:
  - `/wp-json/wc/store/v1/cart*`
- This plugin does not rely on WooCommerce “cart fragments”. It reads and mutates the cart via the WooCommerce Store API.
- If your HTML is served from a shared cache, `hooksContext.cart.*` generated server-side may be stale. Enable hydration to keep the badge/count and client-side hooks context correct:

```php
<?php
return array(
	'storeApi' => array(
		'hydration' => array(
			'onLoad' => 'ifCartCookie',
			'updateHooksContext' => true,
		),
	),
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
- `ui.lockPageScroll`: if `true` (default) locks the page scroll when the drawer is open; if `false` the page remains scrollable
- `ui.hideCountWhenZero`: if `true` hides the `.side-cart__number` badge when the count is `0`
- `ui.openTriggerElementId`: id of an external element that opens/closes the drawer
- `ui.badgeElementId`: id of an external element for the count badge
- `ui.autoOpenOnAddToCart`: auto-open after add-to-cart

## Composite/Bundles grouping (root `composite`)

The `composite` root key controls parent/child rendering for both Composite Products and Product Bundles cart groups.

- `composite.groupMode`
  - `flat`: legacy flat rendering (backward-compatible default)
  - `noindent`: parent/child rendered as grouped rows without child indentation
  - `parent`: grouped rendering with parent-child visual hierarchy
- `composite.showChildren`
  - `true`: render child rows
  - `false`: hide child rows and disable child actions in drawer

Behavior matrix:

- `flat + showChildren=true`: current behavior
- `flat + showChildren=false`: child rows hidden (actions on hidden child rows disabled, parent summary rendered)
- `noindent + showChildren=true`: parent/child visible, no child indent
- `noindent + showChildren=false`: only parent/standalone visible (parent summary rendered)
- `parent + showChildren=true`: parent/child grouped with hierarchy
- `parent + showChildren=false`: only parent visible with child labels aggregated in parent row

Summary formatter filter:

```php
add_filter( 'wc_side_cart_composite_summary_format', function( $format, $compositeSettings, $config ) {
	$format['labelSource'] = 'name';
	$format['separator'] = ' • ';
	return $format;
}, 10, 3 );
```

Supported values:

- `labelSource`: `component_title` (default) | `name`
- `separator`: string (default ` · `)

You can also set the same values via config (`composite.summary.*`). If both config and filter are present, the filter runs last and can override the config.

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

## Icon (HTML/SVG) override

The built-in icon uses an icon font via CSS (`.side-cart__icon::before`). You can replace it via PHP filter `wc_side_cart_icon_svg`.

Legacy format (string return, sanitized server-side):

```php
add_filter( 'wc_side_cart_icon_svg', function( $svg, $context, $config ) {
	if ( $context !== 'floating' && $context !== 'panel_header' ) {
		return $svg;
	}
	return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M7 4h-2l-1 2v2h2l2.6 9.2c.2.5.7.8 1.2.8h8.6c.5 0 1-.3 1.2-.8l2-7.2h-14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}, 10, 3 );
```

Extended format (return array) to pass generic HTML and optionally disable validation:

```php
add_filter( 'wc_side_cart_icon_svg', function( $value, $context, $config ) {
	if ( $context !== 'floating' ) {
		return $value;
	}
	return array(
		'html' => '<span class="my-cart-icon" aria-hidden="true">🛒</span>',
		'disableValidation' => true,
	);
}, 10, 3 );
```

Notes:

- If the filter returns a string, it is treated as icon markup and sanitized server-side.
- If the filter returns an array, supported keys are:
  - `html` (string): icon markup to render
  - `disableValidation` (bool): when `true`, server-side validation is skipped
- The icon container still gets `side-cart__icon--svg` when custom markup is present and renders inside `.side-cart__icon_svg`.

## Extra classes (cssClasses)

For structural customizations you can add extra classes via config:

- `cssClasses.panel`, `backdrop`, `container`, `header`, `form`, `items`, `item`, `footer`, `totals`, `coupon`, `floatingIcon`
- `cssClasses.itemOdd` / `itemEven`: classes added to items based on parity (useful for theme overrides)

TailwindCSS v4 note:

- `cssClasses.*` supports Tailwind classes including arbitrary variants/selectors (e.g. `[&_a]:hover:no-underline`, `data-[state=open]:bg-red-500`).
- Sanitization is token-based: tokens containing whitespace or any of `"`, `'`, `<`, `>` are dropped.

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
