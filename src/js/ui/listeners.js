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
		var preferSession = !!(options && options.preferSession);
		if (preferSession && cartState && typeof cartState.clearCartToken === 'function') {
			cartState.clearCartToken();
		}
		debugLog('refreshFromExternalCartChange:start', {
			shouldAutoOpen: shouldAutoOpen,
			preferSession: preferSession
		});

		return storeApi.refreshCart({
			preferSession: preferSession,
			omitCartToken: preferSession
		}).then(function(cart) {
			debugLog('refreshFromExternalCartChange:success', {
				shouldAutoOpen: shouldAutoOpen,
				preferSession: preferSession,
				itemsCount: cart && cart.items && cart.items.length ? cart.items.length : 0
			});
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
		}).catch(function(err) {
			debugLog('refreshFromExternalCartChange:error', {
				shouldAutoOpen: shouldAutoOpen,
				message: err && err.message ? String(err.message) : '',
				status: err && err.status ? err.status : ''
			}, 'warn');
		});
	}

	function recoverFromStoreApiFailure(options) {
		return storeApi.recoverFromStoreApiFailure(options, renderCart);
	}

	function performQuantityUpdate(inputEl, cartItemKey, quantity) {
		function findItemsScroller() {
			var panel = qs(getSelector('panel'));
			var itemsSel = getSelector('items');
			if (!itemsSel) {
				return null;
			}
			return qs(itemsSel, panel || document);
		}

		function getItemOffsetInScroller(scroller, itemEl) {
			if (!scroller || !itemEl || !scroller.getBoundingClientRect || !itemEl.getBoundingClientRect) {
				return null;
			}
			var scrollerRect = scroller.getBoundingClientRect();
			var itemRect = itemEl.getBoundingClientRect();
			return (itemRect.top - scrollerRect.top) + scroller.scrollTop;
		}

		function buildCartItemKeySelector(key) {
			var safe = String(key || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
			return '[data-cart_item_key="' + safe + '"]';
		}

		var scrollState = null;
		var scroller = findItemsScroller();
		var currentItemNode = inputEl ? inputEl.closest(getSelector('item')) : null;
		if (scroller) {
			scrollState = {
				scroller: scroller,
				scrollTop: scroller.scrollTop,
				itemOffset: getItemOffsetInScroller(scroller, currentItemNode),
				key: cartItemKey
			};
		}

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
			if (!scrollState || !scrollState.scroller) {
				return;
			}
			var scroller = scrollState.scroller;
			var prevScrollTop = scrollState.scrollTop;
			var prevOffset = scrollState.itemOffset;
			var key = scrollState.key;
			window.requestAnimationFrame(function() {
				try {
					if (prevOffset === null) {
						scroller.scrollTop = prevScrollTop;
						return;
					}
					var sel = buildCartItemKeySelector(key);
					var newItem = scroller.querySelector ? scroller.querySelector(sel) : null;
					if (!newItem) {
						scroller.scrollTop = prevScrollTop;
						return;
					}
					var newOffset = getItemOffsetInScroller(scroller, newItem);
					if (newOffset === null) {
						scroller.scrollTop = prevScrollTop;
						return;
					}
					scroller.scrollTop = prevScrollTop + (newOffset - prevOffset);
				} catch (e) {
					scroller.scrollTop = prevScrollTop;
				}
			});
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

	function debugLog(label, data, method) {
		try {
			if (typeof window === 'undefined' || !window.console || !window.console.log) {
				return;
			}
			var logMethod = (method && typeof window.console[method] === 'function') ? method : 'log';
			window.console[logMethod]('[wcsc-debug][listeners] ' + label, data || {});
		} catch (e) {}
	}

	var panelEl = null;
	var panelHandlersBound = false;

	function handleQtyInput(e) {
		var target = e.target;
		if (!qtySel || !target || !target.matches(qtySel)) {
			return;
		}
		var itemNode = target.closest(getSelector('item'));
		if (itemNode && itemNode.getAttribute && itemNode.getAttribute('data-wcsc-qty-disabled') === '1') {
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
			var inputItemNode = input ? input.closest(getSelector('item')) : null;
			if (inputItemNode && inputItemNode.getAttribute && inputItemNode.getAttribute('data-wcsc-qty-disabled') === '1') {
				return;
			}
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
			var removeItemNode = remove.closest(getSelector('item'));
			if (removeItemNode && removeItemNode.getAttribute && removeItemNode.getAttribute('data-wcsc-remove-disabled') === '1') {
				return;
			}

			var cartItemKey = remove.getAttribute('data-cart_item_key');
			var fallbackUrl = remove.getAttribute('href') || ((wcSideCart && wcSideCart.urls && wcSideCart.urls.cart) ? wcSideCart.urls.cart : '/');
			debugLog('removeClick', {
				cartItemKey: cartItemKey || '',
				fallbackUrl: fallbackUrl || ''
			});

			if (!cartItemKey) {
				window.location = fallbackUrl;
				return;
			}

			var item = remove.closest(getSelector('item'));
			setBusy(item, true);

			storeApi.removeItem(cartItemKey).then(function(cart) {
				debugLog('removeClick:success', {
					cartItemKey: cartItemKey,
					itemsCount: cart && cart.items && cart.items.length ? cart.items.length : 0
				});
				renderCart(cart);
			}).catch(function(err) {
				debugLog('removeClick:error', {
					cartItemKey: cartItemKey,
					message: err && err.message ? String(err.message) : '',
					status: err && err.status ? err.status : ''
				}, 'warn');
				return recoverFromStoreApiFailure({ fallbackUrl: fallbackUrl });
			}).finally(function() {
				setBusy(item, false);
			});

			return;
		}
	}

	function handleEscapeKeydown(e) {
		if (e.key !== 'Escape') {
			return;
		}
		if (!document.body.classList.contains('wc-side-cart-is-open')) {
			return;
		}
		e.preventDefault();
		closeSideCart();
	}

	function bindPanelHandlers() {
		if (panelHandlersBound) {
			return;
		}
		panelEl = qs(getSelector('panel'));
		if (!panelEl) {
			return;
		}
		panelHandlersBound = true;
		panelEl.addEventListener('click', handlePanelClick);
		panelEl.addEventListener('input', handleQtyInput);
		document.addEventListener('keydown', handleEscapeKeydown);
	}

	document.body.addEventListener('side_cart_open', function() {
		bindPanelHandlers();
	});

	if (document.body.classList.contains('wc-side-cart-is-open')) {
		bindPanelHandlers();
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
				if ((!fragments || !cartHash || !$button) && event && event.originalEvent && event.originalEvent.detail && event.originalEvent.detail.length === 3) {
					fragments = event.originalEvent.detail[0];
					cartHash = event.originalEvent.detail[1];
					$button = event.originalEvent.detail[2];
				}
				var buttonEl = null;
				if ($button && $button[0]) {
					buttonEl = $button[0];
				} else if ($button && $button.nodeType === 1) {
					buttonEl = $button;
				}
				var shouldAutoOpen = false;
				if (autoOpenOnAddToCart) {
					if (!buttonEl) {
						shouldAutoOpen = true;
					} else if (buttonEl.matches && buttonEl.matches('a.add_to_cart_button.ajax_add_to_cart, button.single_add_to_cart_button')) {
						shouldAutoOpen = true;
					}
				}
				debugLog('added_to_cart:event', {
					cartHash: cartHash || '',
					fragmentsPresent: !!fragments,
					buttonTag: buttonEl && buttonEl.tagName ? buttonEl.tagName : '',
					buttonClass: buttonEl && buttonEl.className ? String(buttonEl.className) : '',
					shouldAutoOpen: shouldAutoOpen
				});
				refreshFromExternalCartChange({
					shouldAutoOpen: shouldAutoOpen,
					preferSession: true
				});
			});
		}
	}

	if (autoOpenOnAddToCart) {
		document.body.addEventListener('wc-blocks_added_to_cart', function(event) {
			var detail = event && event.detail ? event.detail : {};
			if (detail && detail.source === 'wc-side-cart') {
				debugLog('wc-blocks_added_to_cart:ignored', {
					mutation: detail.mutation || '',
					cartItemKey: detail.cartItemKey || ''
				});
				return;
			}
			debugLog('wc-blocks_added_to_cart:event', {
				shouldAutoOpen: true
			});
			refreshFromExternalCartChange({
				shouldAutoOpen: true,
				preferSession: true
			});
		});
	}

	document.body.addEventListener('wc-blocks_removed_from_cart', function(event) {
		var detail = event && event.detail ? event.detail : {};
		if (detail && detail.source === 'wc-side-cart') {
			debugLog('wc-blocks_removed_from_cart:ignored', {
				mutation: detail.mutation || '',
				cartItemKey: detail.cartItemKey || ''
			});
			return;
		}
		debugLog('wc-blocks_removed_from_cart:event', {
			shouldAutoOpen: false
		});
		refreshFromExternalCartChange({
			shouldAutoOpen: false,
			preferSession: true
		});
	});
}
