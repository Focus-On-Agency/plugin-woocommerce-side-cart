# WooCommerce Side Cart (Drawer)

Plugin WooCommerce che aggiunge un **side cart in stile drawer** (overlay + backdrop) con aggiornamenti del carrello via **WooCommerce Store API** e UI moderna **senza jQuery**.

Il rendering della UI è principalmente **client-side**: il markup server è un contenitore stabile, mentre items/totals/coupon vengono (ri)costruiti dal renderer JS in base ai dati del carrello.

## Caratteristiche

- Drawer in overlay, backdrop e scroll-lock
- Aggiornamenti carrello via Store API (`/wp-json/wc/store/v1/cart/...`)
- Editing quantità con stepper (opzionale) e rimozione item
- UI minimal/editoriale basata su **CSS variables** (token `--wcsc-*`)
- Estendibilità:
  - classi extra via config (`cssClasses`)
  - hook HTML “privilegiati” via config (`hooksHtml`) + policy di sanitizzazione
  - override renderer lato client (avanzato)

## Struttura del progetto

- `assets/css/woocommerce_side_cart.base.css`: stile base del drawer (token + layout + componenti)
- `assets/js/woocommerce_side_cart(.min).js`: bundle compilato
- `src/js/`: sorgenti JS (entry: `src/js/index.js`)
- `templates/`: template PHP (contenitori/slot)
- `includes/`: loader config, sanitizzazione CSS vars, utilità server-side
- `woocommerce-side-cart.config.php`: config di default inclusa nel plugin (override-friendly)

## Build (sviluppo)

Richiede Node.js.

```bash
npm install
npm run ci
```

Script utili:

- `npm run lint:js`
- `npm run build`

## Configurazione (drop-in)

Puoi configurare il plugin tramite file:

- `woocommerce-side-cart.config.json` (consigliato, data-only)
- `woocommerce-side-cart.config.php` (deve **ritornare un array PHP**)

### Ordine di risoluzione dei file config

Viene usato il **primo file valido** trovato, in quest’ordine:

1. `wp-content/woocommerce-side-cart.config.json`
2. `wp-content/woocommerce-side-cart.config.php`
3. `wp-content/themes/<tema-attivo>/woocommerce-side-cart.config.json` (child theme)
4. `wp-content/themes/<tema-attivo>/woocommerce-side-cart.config.php` (child theme)
5. `wp-content/plugins/woocommerce-side-cart/woocommerce-side-cart.config.json`
6. `wp-content/plugins/woocommerce-side-cart/woocommerce-side-cart.config.php`

Filtri utili:

- `wc_side_cart_config_path`: aggiunge un path custom con priorità massima
- `wc_side_cart_config_paths`: sostituisce/riordina l’intera lista di path
- `wc_side_cart_config`: filtra la config dopo merge con i default

## Localizzazione (i18n)

Questo plugin evita stringhe “custom” e si appoggia a:

- stringhe core di WooCommerce (`textdomain: woocommerce`)
- messaggi restituiti dalla Store API (già tradotti da WooCommerce)

In pratica: non è necessario avere un file di traduzione del plugin per avere la UI tradotta.

### Esempio config (PHP)

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

## Flag UI (comportamento attuale)

Questi flag sono i più importanti per la UX del cart.

- `ui.showItemQuantity`
  - Se `true`: mostra la riga sotto al titolo prodotto con **“quantità × prezzo unitario”**
  - Se `false`: nasconde questa riga
- `ui.enableQuantityEditing`
  - Se `true`: mostra lo **stepper** per modificare la quantità
  - Se `false`: nessuno stepper; se `ui.showItemQuantity` è `true` e non è disponibile la riga “qty × unit”, viene mostrato un fallback minimale con la quantità
- `ui.showItemLinks`
  - Se `true`: il nome prodotto è cliccabile
  - Se `false`: il nome prodotto è testo&#x20;

Altri flag:

- `ui.showItemPrice`: mostra il prezzo riga (line total) nella colonna azioni
- `ui.showItemRemove`: mostra l’azione “Rimuovi”
- `ui.showItemThumbnail`: mostra la thumbnail prodotto
- `ui.showCoupons`: mostra UI coupon (se endpoint Store API disponibili)
- `ui.showSubtotal`, `ui.showShipping`, `ui.showTaxes`, `ui.showTotal`: controllano le righe nei totali
- `ui.showFloatingCartIcon`: mostra l’icona floating integrata
- `ui.openTriggerElementId`: id di un elemento esterno che apre/chiude il drawer
- `ui.badgeElementId`: id di un elemento esterno per il badge conteggio
- `ui.autoOpenOnAddToCart`: auto-open dopo add-to-cart

## Styling (CSS Variables)

Il look è governato principalmente da variabili `--wcsc-*` (puoi passarle via `cssVars` in config).

Token tipici:

- `--wcsc-accent`
- `--wcsc-surface`, `--wcsc-surface-2`
- `--wcsc-text`, `--wcsc-muted`
- `--wcsc-border`
- `--wcsc-shadow`
- `--wcsc-panel-width`

Nota: vengono accettate solo variabili che matchano `^--wcsc-[a-z0-9_-]+$`.

## Classi extra (cssClasses)

Per personalizzazioni strutturali puoi aggiungere classi extra via config:

- `cssClasses.panel`, `backdrop`, `container`, `header`, `form`, `items`, `item`, `footer`, `totals`, `coupon`, `floatingIcon`
- `cssClasses.itemOdd` / `itemEven`: classi aggiunte agli item in base alla parità (hook utile per override tema)

## Hook HTML (hooksHtml)

Punti disponibili:

- `aboveItems`: sopra la lista items
- `afterFirstItem`: dopo il primo item
- `afterActions`: sotto le CTA nel footer

Sicurezza:

- `hooksHtmlPolicy`: `post` (default) | `strict` | `none`
- `hooksHtmlOptions.enabled`: abilita/disabilita output
- `hooksHtmlOptions.maxLength`: clamp 0..50000

Best practice: usa hook HTML per inserire **contenitori leggeri** e aggiorna contenuti dinamici via JS sull’evento `side_cart_refreshed`.

## Eventi JS (pubblici)

Tutti gli eventi `side_cart_*` vengono emessi come `CustomEvent` su `document.body` (usa quindi `document.body.addEventListener(...)`).

Eventi principali:

- `side_cart_open`: il drawer è stato aperto
- `side_cart_close`: il drawer è stato chiuso
- `side_cart_before_render`: prima del render (`detail: { cart }`)
- `side_cart_after_render`: dopo il render (`detail: { cart }`)
- `side_cart_refreshed`: render completo/refresh (`detail: { cart }`)
- `side_cart_cart_updated`: cart aggiornato dopo render o mutazioni (`detail: { cart }`)
- `side_cart_cart_fetched`: cart ottenuto da Store API (`detail: { cart }`)
- `side_cart_error`: errore Store API o runtime (`detail: { error }`)
- `side_cart_coupon_applied`: coupon applicato (`detail: { code, cart }`)
- `side_cart_coupon_removed`: coupon rimosso (`detail: { code, cart }`)

Esempio:

```js
document.body.addEventListener('side_cart_cart_updated', function(e) {
	var cart = e.detail && e.detail.cart;
});

document.body.addEventListener('side_cart_error', function(e) {
	var err = e.detail && e.detail.error;
});
```

### Eventi WooCommerce Blocks&#x20;

Dopo mutazioni via Store API il plugin emette anche eventi per invalidare/aggiornare WooCommerce Blocks su `document`, `document.body` e `window`:

- `wc-blocks_added_to_cart` (`detail: { preserveCartData: false, cartItemKey? }`)
- `wc-blocks_removed_from_cart` (`detail: { preserveCartData: false, cartItemKey? }`)

## Hook JS (renderer override)

Il runtime espone un piccolo registry per sostituire porzioni di UI senza forkare il plugin:

- `window.wcSideCart.registerRenderer(name, fn)`
- `window.wcSideCart.registerRenderers(map)`
- `window.wcSideCart.resetRenderers()`

Renderer disponibili: `empty`, `items`, `totals`.

Firma:

`fn(dom, cart, api)`

- `dom`: nodi principali del drawer (items/totals/footer ecc.)
- `cart`: payload Store API
- `api`: helper (emit, refreshCart, updateItemQuantity, removeItem, applyCoupon, removeCoupon, createPriceSpan, appendHook, selectors)

Esempio:

```js
document.addEventListener('DOMContentLoaded', function() {
	if (!window.wcSideCart || !window.wcSideCart.registerRenderer) return;
	window.wcSideCart.registerRenderer('totals', function(dom, cart, api) {
		dom.totals.textContent = 'Totali personalizzati';
	});
});
```

## Parità / comportamento trigger (parity)

- `parity.onCartClickBehaviour`: `open_drawer` | `navigate_to_cart` | `navigate_to_checkout` | `navigate_to_url`
- `parity.cartCheckoutGating`: `removed` | `hidden`
- `parity.blocksSyncDebug`: log minimale per diagnostica sync con Blocks

## Modalità plugin

- `mode: "ui"` (default): render UI completa
- `mode: "headless"`: abilita solo logica/integrazioni (senza UI)

## License

Vedi file di licenza del progetto (se presente) o l’header del plugin.
