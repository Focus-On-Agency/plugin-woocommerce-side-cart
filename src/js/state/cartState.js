/**
 * Lightweight state/cache layer:
 * - Session persistence for Store API Nonce + Cart Token
 * - Cart counter updates
 */

import { qsa } from '../utils/dom.js';
import { getCartItemCount } from '../utils/money.js';

export function createCartState(options) {
	var wcSideCart = options && options.wcSideCart ? options.wcSideCart : null;
	var badgeElementId = options && options.badgeElementId ? options.badgeElementId : '';
	var hideCountWhenZero = (options && typeof options.hideCountWhenZero === 'boolean') ? options.hideCountWhenZero : false;

	var storeApiNonceStorageKey = 'wcSideCartStoreApiNonce';
	var cartTokenStorageKey = 'wcSideCartCartToken';
	var wooCartHashStorageKey = 'wcSideCartWooCartHash';
	var authStateStorageKey = 'wcSideCartAuthState';

	function debugLog(label, data) {
		try {
			if (typeof window === 'undefined' || !window.console || !window.console.log) {
				return;
			}
			window.console.log('[wcsc-debug][cartState] ' + label, data || {});
		} catch (e) {}
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

	function getWooCartHash() {
		return getCookieValue('woocommerce_cart_hash') || '';
	}

	function getAuthState() {
		return wcSideCart && wcSideCart.auth && wcSideCart.auth.isUserLoggedIn ? 'logged-in' : 'guest';
	}

	function getSessionValue(key) {
		try {
			if (!window.sessionStorage) {
				return null;
			}
			return window.sessionStorage.getItem(key);
		} catch (e) {
			return null;
		}
	}

	function setSessionValue(key, value) {
		try {
			if (!window.sessionStorage) {
				return;
			}
			if (value) {
				window.sessionStorage.setItem(key, value);
				return;
			}
			window.sessionStorage.removeItem(key);
		} catch (e) {}
	}

	function initFromSession() {
		if (!wcSideCart) {
			return;
		}
		var currentWooCartHash = getWooCartHash();
		var storedWooCartHash = getSessionValue(wooCartHashStorageKey);
		var currentAuthState = getAuthState();
		var storedAuthState = getSessionValue(authStateStorageKey);
		debugLog('initFromSession:start', {
			currentAuthState: currentAuthState,
			storedAuthState: storedAuthState || '',
			currentWooCartHash: currentWooCartHash || '',
			storedWooCartHash: storedWooCartHash || '',
			localizedNoncePresent: !!(wcSideCart && wcSideCart.storeApiNonce),
			localizedCartTokenPresent: !!(wcSideCart && wcSideCart.cartToken),
			storedNoncePresent: !!getSessionValue(storeApiNonceStorageKey),
			storedCartTokenPresent: !!getSessionValue(cartTokenStorageKey)
		});
		if (storedAuthState && storedAuthState !== currentAuthState) {
			wcSideCart.storeApiNonce = '';
			wcSideCart.cartToken = '';
			setSessionValue(storeApiNonceStorageKey, '');
			setSessionValue(cartTokenStorageKey, '');
			setSessionValue(wooCartHashStorageKey, currentWooCartHash);
			debugLog('initFromSession:authStateChanged', {
				storedAuthState: storedAuthState,
				currentAuthState: currentAuthState
			});
		}
		setSessionValue(authStateStorageKey, currentAuthState);
		if (storedWooCartHash && currentWooCartHash && storedWooCartHash !== currentWooCartHash) {
			wcSideCart.cartToken = '';
			setSessionValue(storeApiNonceStorageKey, '');
			setSessionValue(cartTokenStorageKey, '');
			setSessionValue(wooCartHashStorageKey, currentWooCartHash);
			debugLog('initFromSession:wooCartHashChanged', {
				storedWooCartHash: storedWooCartHash,
				currentWooCartHash: currentWooCartHash
			});
			return;
		}
		var storedNonce = getSessionValue(storeApiNonceStorageKey);
		if (storedNonce && currentAuthState !== 'logged-in') {
			wcSideCart.storeApiNonce = storedNonce;
		}

		var storedCartToken = getSessionValue(cartTokenStorageKey);
		if (storedCartToken) {
			wcSideCart.cartToken = storedCartToken;
		}
		if (currentWooCartHash && !storedWooCartHash) {
			setSessionValue(wooCartHashStorageKey, currentWooCartHash);
		}
		debugLog('initFromSession:end', {
			activeAuthState: currentAuthState,
			activeWooCartHash: getWooCartHash() || '',
			activeNoncePresent: !!(wcSideCart && wcSideCart.storeApiNonce),
			activeCartTokenPresent: !!(wcSideCart && wcSideCart.cartToken),
			nonceSource: (storedNonce && currentAuthState !== 'logged-in') ? 'session' : 'localized-or-empty',
			cartTokenSource: storedCartToken ? 'session' : 'localized-or-empty'
		});
	}

	function updateFromResponseHeaders(headers) {
		if (!wcSideCart || !headers) {
			return;
		}

		var refreshedNonce = headers.get('Nonce') || headers.get('X-WC-Store-API-Nonce');
		if (refreshedNonce) {
			wcSideCart.storeApiNonce = refreshedNonce;
			setSessionValue(storeApiNonceStorageKey, refreshedNonce);
		}

		var refreshedCartToken = headers.get('Cart-Token');
		if (refreshedCartToken) {
			wcSideCart.cartToken = refreshedCartToken;
			setSessionValue(cartTokenStorageKey, refreshedCartToken);
		}
		var currentWooCartHash = getWooCartHash();
		if (currentWooCartHash) {
			setSessionValue(wooCartHashStorageKey, currentWooCartHash);
		}
		setSessionValue(authStateStorageKey, getAuthState());
		debugLog('updateFromResponseHeaders', {
			refreshedNoncePresent: !!refreshedNonce,
			refreshedCartTokenPresent: !!refreshedCartToken,
			currentWooCartHash: currentWooCartHash || '',
			currentAuthState: getAuthState()
		});
	}

	function clearTokens() {
		if (!wcSideCart) {
			return;
		}
		wcSideCart.storeApiNonce = '';
		wcSideCart.cartToken = '';
		setSessionValue(storeApiNonceStorageKey, '');
		setSessionValue(cartTokenStorageKey, '');
		debugLog('clearTokens', {
			currentWooCartHash: getWooCartHash() || '',
			currentAuthState: getAuthState()
		});
	}

	function clearCartToken() {
		if (!wcSideCart) {
			return;
		}
		wcSideCart.cartToken = '';
		setSessionValue(cartTokenStorageKey, '');
		debugLog('clearCartToken', {
			currentWooCartHash: getWooCartHash() || '',
			currentAuthState: getAuthState()
		});
	}

	function updateCountFromCart(cart) {
		var count = String(getCartItemCount(cart));
		var isZero = count === '0';

		function setHidden(el, value) {
			if (!el || !el.setAttribute || !el.removeAttribute) {
				return;
			}
			if (value) {
				el.setAttribute('hidden', 'hidden');
				return;
			}
			el.removeAttribute('hidden');
		}

		qsa('.js-side-cart-number, #wc-side-cart-panel .side-cart__number, a.js-side-cart-open .side-cart__number').forEach(function(el) {
			el.textContent = count;
			if (hideCountWhenZero) {
				setHidden(el, isZero);
				return;
			}
			setHidden(el, false);
		});
		if (badgeElementId) {
			var badge = document.getElementById(badgeElementId);
			if (badge) {
				badge.textContent = count;
				if (hideCountWhenZero) {
					setHidden(badge, isZero);
					return;
				}
				setHidden(badge, false);
			}
		}
	}

	function getStoreApiNonce() {
		return wcSideCart && wcSideCart.storeApiNonce ? wcSideCart.storeApiNonce : '';
	}

	function getCartToken() {
		return wcSideCart && wcSideCart.cartToken ? wcSideCart.cartToken : '';
	}

	return {
		initFromSession: initFromSession,
		updateFromResponseHeaders: updateFromResponseHeaders,
		clearTokens: clearTokens,
		clearCartToken: clearCartToken,
		updateCountFromCart: updateCountFromCart,
		getStoreApiNonce: getStoreApiNonce,
		getCartToken: getCartToken
	};
}
