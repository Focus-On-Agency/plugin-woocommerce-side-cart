/**
 * WooCommerce Side Cart runtime entry.
 *
 * Internal architecture:
 * - Store API client
 * - Cart state manager (token/nonce cache + counters)
 * - Renderer (DOM creation + hooks)
 * - A11y controller (scroll lock + focus trap)
 *
 * Public API contract:
 * - window.wcSideCart (shape/methods)
 * - emitted DOM events (names + payload shapes)
 */

import { onReady } from './utils/dom.js';
import { createCartState } from './state/cartState.js';
import { createStoreApiClient } from './storeApi/client.js';
import { createRenderer } from './renderer/renderer.js';
import { createA11yController } from './a11y/a11yController.js';
import { createA11yAnnouncer } from './a11y/announcer.js';
import { setupUiListeners } from './ui/listeners.js';
import { moneyFormatValue, getCartItemCount } from './utils/money.js';

onReady(function() {
	var wcSideCart = window.wcSideCart || null;

	if (!wcSideCart || !wcSideCart.endpoints || !window.fetch) {
		return;
	}

	// Keep legacy behavior: always reset the "opened" marker on boot.
	document.body.classList.remove('js-side-cart-opened');

	var settings = wcSideCart.settings || {};
	var uiSettings = settings.ui || {};
	var paritySettings = settings.parity || {};
	var storeApiSettings = settings.storeApi || {};
	var hydrationSettings = storeApiSettings.hydration || {};

	var mode = (typeof settings.mode === 'string') ? settings.mode.trim().toLowerCase() : 'ui';
	if (mode !== 'ui' && mode !== 'headless') {
		mode = 'ui';
	}

	var hydrationOnLoad = (typeof hydrationSettings.onLoad === 'string') ? hydrationSettings.onLoad.trim().toLowerCase() : 'never';
	if (['never', 'ifcartcookie', 'always'].indexOf(hydrationOnLoad) === -1) {
		hydrationOnLoad = 'never';
	}
	var hydrationUpdateHooksContext = (typeof hydrationSettings.updateHooksContext === 'boolean') ? hydrationSettings.updateHooksContext : true;

	var domSettings = settings.dom || {};
	var domSelectors = (domSettings && domSettings.selectors && typeof domSettings.selectors === 'object') ? domSettings.selectors : {};
	var defaultSelectors = {
		panel: '.side-cart',
		backdrop: '.js-side-cart-backdrop',
		container: '.js-side-cart-container',
		header: '.side-cart__iconic',
		form: '.js-side-cart-form',
		items: '.js-side-cart-items',
		footer: '.side-cart__footer',
		totals: '.side-cart__totals',
		item: '.item',
		floatingIcon: '.js-side-cart-icon',
		emptyTemplate: '.js-side-cart-empty-template',
		toggle: '.js-side-cart-close, .js-side-cart-open',
		remove: '.js-remove-basket-item',
		qtyInput: '.js-side-cart-change-qty',
		stepperDec: '.js-side-cart-stepper-dec',
		stepperInc: '.js-side-cart-stepper-inc'
	};

	function getSelector(key) {
		var value = (domSelectors && typeof domSelectors[key] === 'string') ? domSelectors[key].trim() : '';
		return value || defaultSelectors[key] || '';
	}

	function emit(name, detail) {
		document.body.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
	}

	function getCookieValue(name) {
		try {
			if (typeof document === 'undefined' || !document.cookie) {
				return '';
			}
			var cookie = String(document.cookie);
			var parts = cookie.split(';');
			for (var i = 0; i < parts.length; i++) {
				var part = parts[i];
				if (!part) {
					continue;
				}
				while (part.charAt(0) === ' ') {
					part = part.slice(1);
				}
				if (part.indexOf(name + '=') !== 0) {
					continue;
				}
				var value = part.slice((name + '=').length);
				try {
					return decodeURIComponent(value);
				} catch (e) {
					return value;
				}
			}
		} catch (e) {}
		return '';
	}

	function hasCartCookie() {
		var hash = getCookieValue('woocommerce_cart_hash');
		if (hash) {
			return true;
		}
		var items = getCookieValue('woocommerce_items_in_cart');
		if (!items) {
			return false;
		}
		var parsed = parseInt(items, 10);
		return !isNaN(parsed) && parsed > 0;
	}

	var badgeElementId = (typeof uiSettings.badgeElementId === 'string') ? uiSettings.badgeElementId.trim() : '';
	var openTriggerElementId = (typeof uiSettings.openTriggerElementId === 'string') ? uiSettings.openTriggerElementId.trim() : '';
	var lockPageScroll = (typeof uiSettings.lockPageScroll === 'boolean') ? uiSettings.lockPageScroll : true;
	var hideCountWhenZero = (typeof uiSettings.hideCountWhenZero === 'boolean') ? uiSettings.hideCountWhenZero : false;
	var autoOpenOnAddToCart = (typeof uiSettings.autoOpenOnAddToCart === 'boolean') ? uiSettings.autoOpenOnAddToCart : false;
	var disableUiListeners = (typeof uiSettings.disableUiListeners === 'boolean') ? uiSettings.disableUiListeners : false;

	var onCartClickBehaviour = (typeof paritySettings.onCartClickBehaviour === 'string') ? paritySettings.onCartClickBehaviour.trim().toLowerCase() : 'open_drawer';
	if (['open_drawer', 'navigate_to_checkout', 'navigate_to_cart', 'navigate_to_url'].indexOf(onCartClickBehaviour) === -1) {
		onCartClickBehaviour = 'open_drawer';
	}

	var cartState = createCartState({
		wcSideCart: wcSideCart,
		badgeElementId: badgeElementId,
		hideCountWhenZero: hideCountWhenZero
	});
	cartState.initFromSession();

	var storeApi = createStoreApiClient({
		wcSideCart: wcSideCart,
		cartState: cartState
	});

	var renderer = createRenderer({
		wcSideCart: wcSideCart,
		settings: settings,
		mode: mode,
		getSelector: getSelector,
		emit: emit,
		storeApi: storeApi,
		cartState: cartState
	});

	var a11y = createA11yController({
		getSelector: getSelector,
		emit: emit,
		mode: mode,
		openTriggerElementId: openTriggerElementId,
		lockPageScroll: lockPageScroll,
		onRenderCart: renderer.renderCart,
		onRefreshCart: storeApi.refreshCart,
		onRecoverFromStoreApiFailure: function(options) {
			return storeApi.recoverFromStoreApiFailure(options, renderer.renderCart);
		}
	});

	if (mode !== 'headless') {
		createA11yAnnouncer({ wcSideCart: wcSideCart }).bind();

		var isOpenOnBoot = document.body.classList.contains('wc-side-cart-is-open');
		var iconEl = document.querySelector(getSelector('floatingIcon'));
		if (iconEl) {
			iconEl.setAttribute('aria-expanded', isOpenOnBoot ? 'true' : 'false');
			if (isOpenOnBoot) {
				iconEl.classList.add('js-side-cart-close');
			} else {
				iconEl.classList.remove('js-side-cart-close');
			}
		}
		if (openTriggerElementId) {
			var triggerEl = document.getElementById(openTriggerElementId);
			if (triggerEl) {
				triggerEl.setAttribute('aria-expanded', isOpenOnBoot ? 'true' : 'false');
			}
		}
	}

	function updateHooksContextFromCart(cart) {
		if (!hydrationUpdateHooksContext) {
			return;
		}
		if (!wcSideCart || !wcSideCart.settings) {
			return;
		}
		if (!wcSideCart.settings.hooksContext || typeof wcSideCart.settings.hooksContext !== 'object') {
			wcSideCart.settings.hooksContext = {};
		}
		var hooksContext = wcSideCart.settings.hooksContext;
		if (!hooksContext.cart || typeof hooksContext.cart !== 'object') {
			hooksContext.cart = {};
		}
		var totals = cart && cart.totals ? cart.totals : {};

		hooksContext.cart.count = getCartItemCount(cart || {});
		hooksContext.cart.subtotal = (totals && typeof totals.total_items !== 'undefined' && totals.total_items !== null) ? moneyFormatValue(totals.total_items, totals) : '';
		hooksContext.cart.total = (totals && typeof totals.total_price !== 'undefined' && totals.total_price !== null) ? moneyFormatValue(totals.total_price, totals) : '';
	}

	// Expose the renderer extension points on the public object (contract).
	wcSideCart.renderers = renderer.renderers;
	wcSideCart.registerRenderer = renderer.registerRenderer;
	wcSideCart.registerRenderers = renderer.registerRenderers;
	wcSideCart.resetRenderers = renderer.resetRenderers;

	// Public SDK (contract): same keys + behavior.
	wcSideCart.sdk = {
		mode: mode,
		selectors: { get: getSelector },
		emit: emit,
		request: storeApi.request,
		refreshCart: function() {
			return storeApi.refreshCart().then(function(cart) {
				cartState.updateCountFromCart(cart || {});
				updateHooksContextFromCart(cart || {});
				emit('side_cart_cart_fetched', { cart: cart });
				return cart;
			}).catch(function(err) {
				emit('side_cart_error', { error: err });
				throw err;
			});
		},
		updateItemQuantity: function(cartItemKey, quantity) {
			return storeApi.updateItemQuantity(cartItemKey, quantity).then(function(cart) {
				cartState.updateCountFromCart(cart || {});
				updateHooksContextFromCart(cart || {});
				emit('side_cart_cart_updated', { cart: cart });
				return cart;
			}).catch(function(err) {
				emit('side_cart_error', { error: err });
				throw err;
			});
		},
		removeItem: function(cartItemKey) {
			return storeApi.removeItem(cartItemKey).then(function(cart) {
				cartState.updateCountFromCart(cart || {});
				updateHooksContextFromCart(cart || {});
				emit('side_cart_cart_updated', { cart: cart });
				return cart;
			}).catch(function(err) {
				emit('side_cart_error', { error: err });
				throw err;
			});
		},
		applyCoupon: function(code) {
			return storeApi.applyCoupon(code).then(function(cart) {
				cartState.updateCountFromCart(cart || {});
				updateHooksContextFromCart(cart || {});
				emit('side_cart_cart_updated', { cart: cart });
				return cart;
			}).catch(function(err) {
				emit('side_cart_error', { error: err });
				throw err;
			});
		},
		removeCoupon: function(code) {
			return storeApi.removeCoupon(code).then(function(cart) {
				cartState.updateCountFromCart(cart || {});
				updateHooksContextFromCart(cart || {});
				emit('side_cart_cart_updated', { cart: cart });
				return cart;
			}).catch(function(err) {
				emit('side_cart_error', { error: err });
				throw err;
			});
		},
		render: function(cart) {
			if (mode === 'headless') {
				emit('side_cart_refreshed', { cart: cart });
				return;
			}
			renderer.renderCart(cart);
		},
		open: function() {
			if (mode === 'headless') {
				emit('side_cart_open');
				return;
			}
			a11y.open();
		},
		close: function() {
			if (mode === 'headless') {
				emit('side_cart_close');
				return;
			}
			a11y.close();
		}
	};

	if (hydrationOnLoad !== 'never') {
		var shouldHydrate = hydrationOnLoad === 'always' ? true : hasCartCookie();
		if (shouldHydrate && wcSideCart.sdk && typeof wcSideCart.sdk.refreshCart === 'function') {
			wcSideCart.sdk.refreshCart().catch(function() {});
		}
	}

	if (mode !== 'headless' && !disableUiListeners) {
		setupUiListeners({
			wcSideCart: wcSideCart,
			getSelector: getSelector,
			emit: emit,
			onCartClickBehaviour: onCartClickBehaviour,
			autoOpenOnAddToCart: autoOpenOnAddToCart,
			openTriggerElementId: openTriggerElementId,
			storeApi: storeApi,
			cartState: cartState,
			renderCart: renderer.renderCart,
			openSideCart: a11y.open,
			openSideCartWithCart: a11y.openWithCart,
			closeSideCart: a11y.close
		});
	}

	// Keep legacy behavior: if the markup starts already opened, refresh + render.
	if (document.body.classList.contains('wc-side-cart-is-open') && mode !== 'headless') {
		storeApi.refreshCart().then(function(cart) {
			renderer.renderCart(cart);
		}).catch(function() {});
	}
});
