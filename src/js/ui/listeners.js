/**
 * UI event listeners (click/input/keyboard).
 *
 * Keeps compatibility with the legacy runtime:
 * - Debounced qty updates
 * - Toggle open/close with selectors or external trigger id
 * - Auto-refresh on add-to-cart events (classic + Blocks)
 */

import { qs, setBusy } from '../utils/dom.js';

export function setupUiListeners(options) {
	var wcSideCart = options && options.wcSideCart ? options.wcSideCart : null;
	var getSelector = options && options.getSelector ? options.getSelector : function() { return ''; };
	var emit = options && options.emit ? options.emit : function() {};

	var onCartClickBehaviour = (options && typeof options.onCartClickBehaviour === 'string') ? options.onCartClickBehaviour.trim().toLowerCase() : 'open_drawer';
	if (['open_drawer', 'navigate_to_checkout', 'navigate_to_cart', 'navigate_to_url'].indexOf(onCartClickBehaviour) === -1) {
		onCartClickBehaviour = 'open_drawer';
	}

	var autoOpenOnAddToCart = !!(options && options.autoOpenOnAddToCart);
	var openTriggerElementId = options && options.openTriggerElementId ? options.openTriggerElementId : '';

	var storeApi = options && options.storeApi ? options.storeApi : null;
	var cartState = options && options.cartState ? options.cartState : null;

	var renderCart = options && typeof options.renderCart === 'function' ? options.renderCart : function() {};
	var openSideCart = options && typeof options.openSideCart === 'function' ? options.openSideCart : function() {};
	var openSideCartWithCart = options && typeof options.openSideCartWithCart === 'function' ? options.openSideCartWithCart : function() {};
	var closeSideCart = options && typeof options.closeSideCart === 'function' ? options.closeSideCart : function() {};

	if (!storeApi) {
		return;
	}

	function getViewCartLabel() {
		if (!wcSideCart || !wcSideCart.i18n) {
			return '';
		}
		return wcSideCart.i18n.viewCart ? String(wcSideCart.i18n.viewCart) : '';
	}

	function normalizePath(url) {
		if (!url) {
			return '';
		}
		var a = document.createElement('a');
		a.href = url;
		var path = a.pathname ? String(a.pathname) : '';
		path = path.replace(/\/+$/, '');
		return path;
	}

	function getTriggerHref(el) {
		if (!el || !el.getAttribute) {
			return '';
		}
		var href = el.getAttribute('href');
		return href ? String(href) : '';
	}

	function resolveNavigateUrl(behaviour, triggerEl) {
		var urls = wcSideCart && wcSideCart.urls ? wcSideCart.urls : {};
		var triggerHref = getTriggerHref(triggerEl);
		var dataUrl = triggerEl && triggerEl.getAttribute ? triggerEl.getAttribute('data-wcsc-url') : '';
		dataUrl = dataUrl ? String(dataUrl) : '';

		if (behaviour === 'navigate_to_checkout') {
			return (urls && urls.checkout) ? String(urls.checkout) : (triggerHref || '');
		}
		if (behaviour === 'navigate_to_cart') {
			return (urls && urls.cart) ? String(urls.cart) : (triggerHref || '');
		}
		if (behaviour === 'navigate_to_url') {
			return dataUrl || triggerHref || '';
		}
		return '';
	}

	function handleTriggerClick(e, triggerEl) {
		var isOpen = document.body.classList.contains('wc-side-cart-is-open');
		if (isOpen) {
			e.preventDefault();
			e.stopPropagation();
			closeSideCart();
			return;
		}

		if (onCartClickBehaviour === 'open_drawer') {
			e.preventDefault();
			e.stopPropagation();
			openSideCart();
			return;
		}

		var desiredUrl = resolveNavigateUrl(onCartClickBehaviour, triggerEl);
		var triggerHref = getTriggerHref(triggerEl);
		if (desiredUrl && triggerHref && normalizePath(desiredUrl) === normalizePath(triggerHref)) {
			return;
		}

		if (desiredUrl) {
			e.preventDefault();
			e.stopPropagation();
			window.location = desiredUrl;
			return;
		}
	}

	function refreshFromExternalCartChange(options) {
		var shouldAutoOpen = !!(options && options.shouldAutoOpen);

		return storeApi.refreshCart().then(function(cart) {
			if (cartState) {
				cartState.updateCountFromCart(cart);
			}

			var counter = document.querySelector('.js-side-cart-number');
			if (counter) {
				counter.classList.add('side-cart__number--jump');
				window.setTimeout(function() {
					counter.classList.remove('side-cart__number--jump');
				}, 2000);
			}

			if (shouldAutoOpen && !document.body.classList.contains('wc-side-cart-is-open')) {
				openSideCartWithCart(cart);
				return;
			}

			if (document.body.classList.contains('wc-side-cart-is-open')) {
				renderCart(cart);
			}
		}).catch(function() {});
	}

	function recoverFromStoreApiFailure(options) {
		return storeApi.recoverFromStoreApiFailure(options, renderCart);
	}

	function performQuantityUpdate(inputEl, cartItemKey, quantity) {
		var item = inputEl ? inputEl.closest(getSelector('item')) : null;
		setBusy(item, true);
		if (inputEl) {
			inputEl.disabled = true;
		}
		var promise;
		if (quantity <= 0) {
			promise = storeApi.removeItem(cartItemKey);
		} else {
			promise = storeApi.updateItemQuantity(cartItemKey, quantity);
		}
		promise.then(function(cart) {
			renderCart(cart);
		}).catch(function() {
			return recoverFromStoreApiFailure();
		}).finally(function() {
			if (inputEl) {
				inputEl.disabled = false;
			}
			setBusy(item, false);
		});
	}

	var qtyTimers = new Map();

	var qtySel = getSelector('qtyInput');
	var toggleSel = getSelector('toggle');
	var stepperSel = [getSelector('stepperDec'), getSelector('stepperInc')].filter(Boolean).join(', ');
	var removeSel = getSelector('remove');
	var backdropSel = getSelector('backdrop');

	var panelEl = qs(getSelector('panel'));

	function handleQtyInput(e) {
		var target = e.target;
		if (!qtySel || !target || !target.matches(qtySel)) {
			return;
		}

		var cartItemKey = target.getAttribute('data-cart_item_key');
		var quantity = parseInt(target.value, 10);

		if (!cartItemKey || isNaN(quantity)) {
			return;
		}

		if (qtyTimers.has(cartItemKey)) {
			clearTimeout(qtyTimers.get(cartItemKey));
		}

		qtyTimers.set(cartItemKey, setTimeout(function() {
			performQuantityUpdate(target, cartItemKey, quantity);
		}, 600));
	}

	(panelEl || document).addEventListener('input', handleQtyInput);

	function handlePanelClick(e) {
		var toggle = (toggleSel && e.target && e.target.closest) ? e.target.closest(toggleSel) : null;
		if (toggle) {
			handleTriggerClick(e, toggle);
			return;
		}

		var stepperButton = (stepperSel && e.target && e.target.closest) ? e.target.closest(stepperSel) : null;
		if (stepperButton) {
			e.preventDefault();
			e.stopPropagation();

			var stepper = stepperButton.closest('.wcsc-stepper');
			var input = stepper && qtySel ? qs(qtySel, stepper) : null;
			var cartItemKey = input ? input.getAttribute('data-cart_item_key') : '';
			var currentQty = input ? parseInt(input.value, 10) : NaN;
			if (!input || !cartItemKey || isNaN(currentQty)) {
				return;
			}

			var nextQty = currentQty + (stepperButton.classList.contains('js-side-cart-stepper-inc') ? 1 : -1);
			if (nextQty < 0) {
				nextQty = 0;
			}
			input.value = String(nextQty);

			if (qtyTimers.has(cartItemKey)) {
				clearTimeout(qtyTimers.get(cartItemKey));
			}
			performQuantityUpdate(input, cartItemKey, nextQty);
			return;
		}

		var remove = (removeSel && e.target && e.target.closest) ? e.target.closest(removeSel) : null;
		if (remove) {
			e.preventDefault();
			e.stopPropagation();

			var cartItemKey = remove.getAttribute('data-cart_item_key');
			var fallbackUrl = remove.getAttribute('href') || ((wcSideCart && wcSideCart.urls && wcSideCart.urls.cart) ? wcSideCart.urls.cart : '/');

			if (!cartItemKey) {
				window.location = fallbackUrl;
				return;
			}

			var item = remove.closest(getSelector('item'));
			setBusy(item, true);

			storeApi.removeItem(cartItemKey).then(function(cart) {
				renderCart(cart);
			}).catch(function() {
				return recoverFromStoreApiFailure({ fallbackUrl: fallbackUrl });
			}).finally(function() {
				setBusy(item, false);
			});

			return;
		}
	}

	if (panelEl) {
		panelEl.addEventListener('click', handlePanelClick);
	}

	document.addEventListener('click', function(e) {
		if (panelEl && e.target && panelEl.contains(e.target)) {
			return;
		}

		var backdrop = (backdropSel && e.target && e.target.closest) ? e.target.closest(backdropSel) : null;
		if (backdrop) {
			e.preventDefault();
			closeSideCart();
			return;
		}

		if (openTriggerElementId) {
			var trigger = document.getElementById(openTriggerElementId);
			if (trigger && (e.target === trigger || (trigger.contains && trigger.contains(e.target)))) {
				handleTriggerClick(e, trigger);
				return;
			}
		}

		var toggle = (toggleSel && e.target && e.target.closest) ? e.target.closest(toggleSel) : null;
		if (toggle) {
			handleTriggerClick(e, toggle);
			return;
		}

	});

	if (typeof window !== 'undefined' && window.jQuery && typeof window.jQuery === 'function') {
		var $body = window.jQuery(document.body);
		if ($body && $body.on) {
			$body.on('added_to_cart', function(event, fragments, cartHash, $button) {
				var buttonEl = $button && $button[0] ? $button[0] : null;
				var shouldAutoOpen = autoOpenOnAddToCart && !!(buttonEl && buttonEl.matches && buttonEl.matches('a.add_to_cart_button.ajax_add_to_cart'));
				refreshFromExternalCartChange({ shouldAutoOpen: shouldAutoOpen });
			});
		}
	}

	if (autoOpenOnAddToCart) {
		document.body.addEventListener('wc-blocks_added_to_cart', function() {
			refreshFromExternalCartChange({ shouldAutoOpen: true });
		});
	}

	document.body.addEventListener('wc-blocks_removed_from_cart', function() {
		refreshFromExternalCartChange({ shouldAutoOpen: false });
	});

	document.addEventListener('keydown', function(e) {
		if (e.key !== 'Escape') {
			return;
		}
		if (!document.body.classList.contains('wc-side-cart-is-open')) {
			return;
		}
		e.preventDefault();
		closeSideCart();
	});
}
