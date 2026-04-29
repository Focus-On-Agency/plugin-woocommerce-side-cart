/**
 * Store API client (no jQuery, fetch only).
 *
 * Responsibilities:
 * - Attach Nonce + Cart-Token headers
 * - Refresh session tokens from response headers
 * - Deduplicate /cart requests
 * - Abort in-flight mutations on new ones (update/remove/coupon)
 */

function normalizeCouponCode(code) {
	if (typeof code === 'undefined' || code === null) {
		return '';
	}
	var trimmed = String(code).trim();
	if (!trimmed) {
		return '';
	}
	return trimmed;
}

export function createStoreApiClient(options) {
	var wcSideCart = options && options.wcSideCart ? options.wcSideCart : null;
	var cartState = options && options.cartState ? options.cartState : null;

	var refreshCartPromise = null;

	var updateItemAbort = null;
	var removeItemAbort = null;
	var couponAbort = null;

	var blocksSyncDebug = !!(wcSideCart && wcSideCart.settings && wcSideCart.settings.parity && wcSideCart.settings.parity.blocksSyncDebug);
	var cachedWpData = null;
	var cachedWpDataChecked = false;
	var cachedBlocksCartDispatch = null;
	var cachedBlocksCartDispatchChecked = false;

	function debugLog(message) {
		if (!blocksSyncDebug) {
			return;
		}
		if (typeof console === 'undefined' || !console || typeof console.log !== 'function') {
			return;
		}
		try {
			console.log('[wc-side-cart][blocksSync] ' + String(message));
		} catch (e) {}
	}

	function getWpData() {
		if (cachedWpDataChecked) {
			return cachedWpData;
		}
		cachedWpDataChecked = true;

		if (typeof window === 'undefined') {
			cachedWpData = null;
			return cachedWpData;
		}

		var wp = window.wp ? window.wp : null;
		var wpData = wp && wp.data ? wp.data : null;

		if (!wpData || typeof wpData.select !== 'function' || typeof wpData.dispatch !== 'function') {
			cachedWpData = null;
			debugLog('wp.data unavailable');
			return cachedWpData;
		}

		cachedWpData = wpData;
		debugLog('wp.data detected');
		return cachedWpData;
	}

	function hasWpDataStore(wpData, storeKey) {
		if (!wpData || !storeKey) {
			return false;
		}
		if (typeof wpData.hasStore === 'function') {
			try {
				return !!wpData.hasStore(storeKey);
			} catch (e) {
				return false;
			}
		}
		try {
			var selected = wpData.select(storeKey);
			return !!selected;
		} catch (e2) {
			return false;
		}
	}

	function getBlocksCartDispatch() {
		if (cachedBlocksCartDispatchChecked) {
			return cachedBlocksCartDispatch;
		}
		cachedBlocksCartDispatchChecked = true;

		var wpData = getWpData();
		if (!wpData) {
			cachedBlocksCartDispatch = null;
			return cachedBlocksCartDispatch;
		}

		var storeKey = 'wc/store/cart';
		if (!hasWpDataStore(wpData, storeKey)) {
			cachedBlocksCartDispatch = null;
			debugLog('store wc/store/cart unavailable');
			return cachedBlocksCartDispatch;
		}

		try {
			var dispatchObj = wpData.dispatch(storeKey);
			cachedBlocksCartDispatch = dispatchObj || null;
			debugLog('store wc/store/cart detected');
			return cachedBlocksCartDispatch;
		} catch (e3) {
			cachedBlocksCartDispatch = null;
			return cachedBlocksCartDispatch;
		}
	}

	function tryUpdateBlocksCartStore(cart) {
		if (!cart) {
			return false;
		}

		var dispatchObj = getBlocksCartDispatch();
		if (!dispatchObj) {
			return false;
		}

		var updated = false;
		var updaterNames = [ 'receiveCart', 'setCartData', 'receiveCartContents' ];

		for (var i = 0; i < updaterNames.length; i++) {
			var name = updaterNames[i];
			if (!dispatchObj || typeof dispatchObj[name] !== 'function') {
				continue;
			}

			try {
				if (name === 'receiveCartContents' && cart && cart.items && typeof cart.items.length !== 'undefined') {
					try {
						dispatchObj[name](cart);
						updated = true;
						debugLog('store updated via ' + name);
						break;
					} catch (e4) {
						dispatchObj[name](cart.items);
						updated = true;
						debugLog('store updated via ' + name + '(items)');
						break;
					}
				}

				dispatchObj[name](cart);
				updated = true;
				debugLog('store updated via ' + name);
				break;
			} catch (e5) {}
		}

		return updated;
	}

	function doWpHooksAction(name, payload) {
		if (!name || typeof name !== 'string') {
			return;
		}
		if (typeof window === 'undefined') {
			return;
		}
		var wp = window.wp ? window.wp : null;
		var hooks = wp && wp.hooks ? wp.hooks : null;
		if (!hooks || typeof hooks.doAction !== 'function') {
			return;
		}
		try {
			hooks.doAction(name, payload || {});
		} catch (e) {}
	}

	function emitBlocksEvent(name, detail) {
		if (!name || typeof name !== 'string') {
			return;
		}
		if (typeof document === 'undefined' || typeof window === 'undefined' || !window.CustomEvent) {
			return;
		}
		try {
			var payload = detail || {};
			if (document) {
				try {
					document.dispatchEvent(new window.CustomEvent(name, { detail: payload }));
				} catch (e2) {}
			}
			if (document && document.body) {
				try {
					document.body.dispatchEvent(new window.CustomEvent(name, { detail: payload }));
				} catch (e3) {}
			}
			try {
				window.dispatchEvent(new window.CustomEvent(name, { detail: payload }));
			} catch (e4) {}
		} catch (e) {}
	}

	function buildBlocksInvalidationPayload(options) {
		var payload = { preserveCartData: false };
		if (options && typeof options.cartItemKey === 'string' && options.cartItemKey) {
			payload.cartItemKey = options.cartItemKey;
		}
		return payload;
	}

	function syncBlocksAfterMutation(options, cart) {
		tryUpdateBlocksCartStore(cart);

		var invalidationPayload = buildBlocksInvalidationPayload(options);
		emitBlocksEvent('wc-blocks_added_to_cart', invalidationPayload);

		if (options && options.removedFromCart) {
			emitBlocksEvent('wc-blocks_removed_from_cart', invalidationPayload);
		}

		if (options && options.mutation === 'setQuantity') {
			if (options.removedFromCart) {
				doWpHooksAction('experimental__woocommerce_blocks-cart-remove-item', {
					key: options.cartItemKey
				});
			} else {
				doWpHooksAction('experimental__woocommerce_blocks-cart-set-item-quantity', {
					key: options.cartItemKey,
					quantity: options.quantity
				});
			}
		}

		if (options && options.mutation === 'removeItem') {
			doWpHooksAction('experimental__woocommerce_blocks-cart-remove-item', {
				key: options.cartItemKey
			});
		}
		return cart;
	}

	function normalizeUrlForCompare(url) {
		if (!url || typeof url !== 'string') {
			return '';
		}
		var base = url.split('#')[0].split('?')[0];
		while (base.length > 1 && base.charAt(base.length - 1) === '/') {
			base = base.slice(0, -1);
		}
		return base;
	}

	function getCacheBustingSettings() {
		var settings = wcSideCart && wcSideCart.settings ? wcSideCart.settings : null;
		var storeApi = settings && settings.storeApi ? settings.storeApi : null;
		var cacheBusting = storeApi && storeApi.cacheBusting ? storeApi.cacheBusting : null;
		var enabled = !!(cacheBusting && cacheBusting.enabled);
		var param = (cacheBusting && typeof cacheBusting.param === 'string') ? cacheBusting.param.trim() : '';
		var strategy = (cacheBusting && typeof cacheBusting.strategy === 'string') ? cacheBusting.strategy.trim().toLowerCase() : 'timestamp';

		if (!param) {
			param = 'wcsc_cb';
		}
		if (strategy !== 'timestamp' && strategy !== 'random') {
			strategy = 'timestamp';
		}
		return { enabled: enabled, param: param, strategy: strategy };
	}

	function getCacheBustingValue(strategy) {
		if (strategy === 'random') {
			return String(Math.random()).slice(2) + String(Date.now());
		}
		return String(Date.now());
	}

	function appendQueryParam(url, key, value) {
		if (typeof URL !== 'undefined') {
			try {
				var u = new URL(url, window.location && window.location.origin ? window.location.origin : undefined);
				u.searchParams.set(key, value);
				return u.toString();
			} catch (e) {}
		}
		var encodedKey = encodeURIComponent(key);
		var encodedValue = encodeURIComponent(value);
		var hasQuery = url.indexOf('?') !== -1;
		var separator = hasQuery ? '&' : '?';
		return url + separator + encodedKey + '=' + encodedValue;
	}

	function maybeApplyCartCacheBusting(url, method) {
		if (method !== 'GET') {
			return url;
		}
		if (!wcSideCart || !wcSideCart.endpoints || !wcSideCart.endpoints.cart) {
			return url;
		}
		var settings = getCacheBustingSettings();
		if (!settings.enabled) {
			return url;
		}

		var endpointUrl = normalizeUrlForCompare(String(wcSideCart.endpoints.cart));
		var requestUrl = normalizeUrlForCompare(String(url));
		if (!endpointUrl || !requestUrl || endpointUrl !== requestUrl) {
			return url;
		}

		var value = getCacheBustingValue(settings.strategy);
		return appendQueryParam(url, settings.param, value);
	}

	function request(url, method, body, signal) {
		var headers = {};

		var nonce = cartState ? cartState.getStoreApiNonce() : '';
		if (nonce) {
			headers['Nonce'] = nonce;
			headers['X-WC-Store-API-Nonce'] = nonce;
		}

		var cartToken = cartState ? cartState.getCartToken() : '';
		if (cartToken) {
			headers['Cart-Token'] = cartToken;
		}

		if (method !== 'GET') {
			headers['Content-Type'] = 'application/json';
		}

		var finalUrl = maybeApplyCartCacheBusting(url, method);
		return window.fetch(finalUrl, {
			method: method,
			cache: 'no-store',
			credentials: 'same-origin',
			headers: headers,
			body: (body && method !== 'GET') ? JSON.stringify(body) : undefined,
			signal: signal
		}).then(function(response) {
			function decodeHtmlEntities(input) {
				var text = input ? String(input) : '';
				if (!text) {
					return '';
				}
				if (typeof document === 'undefined' || !document.createElement) {
					return text;
				}
				var textarea = document.createElement('textarea');
				textarea.innerHTML = text;
				return textarea.value;
			}

			if (cartState) {
				cartState.updateFromResponseHeaders(response.headers);
			}
			if (!response.ok) {
				return response.text().then(function(text) {
					var raw = text ? String(text) : '';
					var data = null;
					try {
						data = raw ? JSON.parse(raw) : null;
					} catch (e) {
						data = null;
					}

					var msg = (data && data.message) ? decodeHtmlEntities(data.message) : (raw ? decodeHtmlEntities(raw) : ('Store API request failed: ' + response.status));
					var error = new Error(msg);
					error.status = response.status;
					error.code = data && data.code ? String(data.code) : '';
					error.data = data && data.data ? data.data : null;
					error.response = data || null;
					throw error;
				});
			}
			return response.json();
		});
	}

	function refreshCart() {
		if (!wcSideCart || !wcSideCart.endpoints || !wcSideCart.endpoints.cart) {
			return Promise.reject(new Error('Missing cart endpoint'));
		}
		if (refreshCartPromise) {
			return refreshCartPromise;
		}

		refreshCartPromise = request(wcSideCart.endpoints.cart, 'GET').catch(function(err) {
			if (cartState) {
				cartState.clearTokens();
			}
			return request(wcSideCart.endpoints.cart, 'GET').catch(function() {
				throw err;
			});
		});

		refreshCartPromise.then(function() {
			refreshCartPromise = null;
		}, function() {
			refreshCartPromise = null;
		});

		return refreshCartPromise;
	}

	function ensureCartToken() {
		var token = cartState ? cartState.getCartToken() : '';
		if (token) {
			return Promise.resolve(token);
		}
		return refreshCart().then(function() {
			return cartState ? (cartState.getCartToken() || null) : null;
		}).catch(function() {
			return null;
		});
	}

	function updateItemQuantity(cartItemKey, quantity) {
		if (!wcSideCart || !wcSideCart.endpoints || !wcSideCart.endpoints.cartUpdateItem) {
			return Promise.reject(new Error('Missing update item endpoint'));
		}
		return ensureCartToken().then(function() {
			if (updateItemAbort) {
				updateItemAbort.abort();
			}
			updateItemAbort = window.AbortController ? new AbortController() : null;
			return request(wcSideCart.endpoints.cartUpdateItem, 'POST', {
				key: cartItemKey,
				quantity: quantity
			}, updateItemAbort ? updateItemAbort.signal : undefined);
		}).then(function(cart) {
			return syncBlocksAfterMutation({
				mutation: 'setQuantity',
				cartItemKey: cartItemKey,
				quantity: quantity,
				removedFromCart: quantity <= 0
			}, cart);
		});
	}

	function removeItem(cartItemKey) {
		if (!wcSideCart || !wcSideCart.endpoints || !wcSideCart.endpoints.cartRemoveItem) {
			return Promise.reject(new Error('Missing remove item endpoint'));
		}
		return ensureCartToken().then(function() {
			if (removeItemAbort) {
				removeItemAbort.abort();
			}
			removeItemAbort = window.AbortController ? new AbortController() : null;
			return request(wcSideCart.endpoints.cartRemoveItem, 'POST', {
				key: cartItemKey
			}, removeItemAbort ? removeItemAbort.signal : undefined);
		}).then(function(cart) {
			return syncBlocksAfterMutation({
				mutation: 'removeItem',
				cartItemKey: cartItemKey,
				removedFromCart: true
			}, cart);
		});
	}

	function applyCoupon(code) {
		if (!wcSideCart || !wcSideCart.endpoints || !wcSideCart.endpoints.cartApplyCoupon) {
			return Promise.reject(new Error('Missing apply coupon endpoint'));
		}
		var normalized = normalizeCouponCode(code);
		if (!normalized) {
			return Promise.resolve(null);
		}
		return ensureCartToken().then(function() {
			if (couponAbort) {
				couponAbort.abort();
			}
			couponAbort = window.AbortController ? new AbortController() : null;
			return request(wcSideCart.endpoints.cartApplyCoupon, 'POST', { code: normalized }, couponAbort ? couponAbort.signal : undefined);
		}).then(function(cart) {
			return syncBlocksAfterMutation({ mutation: 'coupon', removedFromCart: false }, cart);
		});
	}

	function removeCoupon(code) {
		if (!wcSideCart || !wcSideCart.endpoints || !wcSideCart.endpoints.cartRemoveCoupon) {
			return Promise.reject(new Error('Missing remove coupon endpoint'));
		}
		var normalized = normalizeCouponCode(code);
		if (!normalized) {
			return Promise.resolve(null);
		}
		return ensureCartToken().then(function() {
			if (couponAbort) {
				couponAbort.abort();
			}
			couponAbort = window.AbortController ? new AbortController() : null;
			return request(wcSideCart.endpoints.cartRemoveCoupon, 'POST', { code: normalized }, couponAbort ? couponAbort.signal : undefined);
		}).then(function(cart) {
			return syncBlocksAfterMutation({ mutation: 'coupon', removedFromCart: false }, cart);
		});
	}

	function recoverFromStoreApiFailure(options, renderCart) {
		return refreshCart().then(function(cart) {
			if (typeof renderCart === 'function') {
				renderCart(cart);
			}
			return cart;
		}).catch(function() {
			if (options && options.fallbackUrl) {
				window.location = options.fallbackUrl;
				return null;
			}
			return null;
		});
	}

	return {
		request: request,
		refreshCart: refreshCart,
		ensureCartToken: ensureCartToken,
		updateItemQuantity: updateItemQuantity,
		removeItem: removeItem,
		applyCoupon: applyCoupon,
		removeCoupon: removeCoupon,
		recoverFromStoreApiFailure: recoverFromStoreApiFailure
	};
}
