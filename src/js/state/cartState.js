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

	var storeApiNonceStorageKey = 'wcSideCartStoreApiNonce';
	var cartTokenStorageKey = 'wcSideCartCartToken';

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
		var storedNonce = getSessionValue(storeApiNonceStorageKey);
		if (storedNonce) {
			wcSideCart.storeApiNonce = storedNonce;
		}

		var storedCartToken = getSessionValue(cartTokenStorageKey);
		if (storedCartToken) {
			wcSideCart.cartToken = storedCartToken;
		}
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
	}

	function clearTokens() {
		if (!wcSideCart) {
			return;
		}
		wcSideCart.storeApiNonce = '';
		wcSideCart.cartToken = '';
		setSessionValue(storeApiNonceStorageKey, '');
		setSessionValue(cartTokenStorageKey, '');
	}

	function updateCountFromCart(cart) {
		var count = String(getCartItemCount(cart));
		qsa('.js-side-cart-number, #wc-side-cart-panel .side-cart__number, a.js-side-cart-open .side-cart__number').forEach(function(el) {
			el.textContent = count;
		});
		if (badgeElementId) {
			var badge = document.getElementById(badgeElementId);
			if (badge) {
				badge.textContent = count;
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
		updateCountFromCart: updateCountFromCart,
		getStoreApiNonce: getStoreApiNonce,
		getCartToken: getCartToken
	};
}
