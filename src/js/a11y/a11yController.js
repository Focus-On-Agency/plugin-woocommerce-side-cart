/**
 * Accessibility controller:
 * - Scroll lock (no layout shift)
 * - Focus trap (keyboard)
 * - Background isolation (inert / aria-hidden)
 */

import { qs, qsa } from '../utils/dom.js';

export function createA11yController(options) {
	var getSelector = options && options.getSelector ? options.getSelector : function() { return ''; };
	var emit = options && options.emit ? options.emit : function() {};
	var mode = options && options.mode ? options.mode : 'ui';
	var openTriggerElementId = options && options.openTriggerElementId ? options.openTriggerElementId : '';

	var onRenderCart = options && typeof options.onRenderCart === 'function' ? options.onRenderCart : function() {};
	var onRefreshCart = options && typeof options.onRefreshCart === 'function' ? options.onRefreshCart : function() { return Promise.reject(new Error('Missing refreshCart callback')); };
	var onRecoverFromStoreApiFailure = options && typeof options.onRecoverFromStoreApiFailure === 'function'
		? options.onRecoverFromStoreApiFailure
		: function() { return Promise.resolve(null); };

	var refreshThrottleMs = (options && typeof options.refreshThrottleMs === 'number') ? options.refreshThrottleMs : 2000;
	var lastCartRefreshAt = 0;

	var previousBodyPaddingRight = '';
	var lastOpenTrigger = null;
	var isolatedBackgroundNodes = [];
	var focusTrapEnabled = false;

	function elementInDocument(el) {
		return !!(el && document.documentElement && document.documentElement.contains(el));
	}

	function isFocusable(el) {
		if (!el || el.disabled) {
			return false;
		}
		if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') {
			return false;
		}
		if (el.tabIndex < 0) {
			return false;
		}
		if (el.matches && el.matches('a') && !el.getAttribute('href')) {
			return false;
		}
		if (el.getClientRects && el.getClientRects().length === 0 && el !== document.activeElement) {
			// Likely display:none or detached.
			return false;
		}
		return typeof el.focus === 'function';
	}

	function getFocusableElements(container) {
		if (!container) {
			return [];
		}
		var selector = 'a[href], area[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, object, embed, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';
		return qsa(selector, container).filter(function(el) {
			return isFocusable(el);
		});
	}

	function getPanel() {
		return qs(getSelector('panel'));
	}

	function getBackdrop() {
		return qs(getSelector('backdrop'));
	}

	function lockScroll() {
		if (document.body.classList.contains('wc-side-cart-scroll-lock')) {
			return;
		}
		previousBodyPaddingRight = document.body.style.paddingRight || '';
		var scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
		if (scrollbarWidth > 0) {
			document.body.style.paddingRight = scrollbarWidth + 'px';
		}
		document.body.classList.add('wc-side-cart-scroll-lock');
	}

	function unlockScroll() {
		document.body.classList.remove('wc-side-cart-scroll-lock');
		document.body.style.paddingRight = previousBodyPaddingRight;
	}

	function setPanelAria(isOpen) {
		var panel = getPanel();
		if (!panel) {
			return;
		}
		panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
		if (!panel.hasAttribute('tabindex')) {
			panel.setAttribute('tabindex', '-1');
		}
	}

	function isolateBackground() {
		var panel = getPanel();
		var backdrop = getBackdrop();
		if (!panel) {
			return;
		}

		isolatedBackgroundNodes = [];
		var supportsInert = false;
		try {
			supportsInert = ('inert' in panel);
		} catch (e) {}

		Array.prototype.forEach.call(document.body.children, function(node) {
			if (!node || node === panel || node === backdrop) {
				return;
			}
			var record = {
				node: node,
				ariaHidden: node.getAttribute ? node.getAttribute('aria-hidden') : null,
				hadInert: supportsInert ? !!node.inert : false
			};
			isolatedBackgroundNodes.push(record);

			if (supportsInert) {
				node.inert = true;
				return;
			}
			if (node.setAttribute) {
				node.setAttribute('aria-hidden', 'true');
			}
		});
	}

	function restoreBackground() {
		if (!isolatedBackgroundNodes.length) {
			return;
		}

		var panel = getPanel();
		var supportsInert = false;
		try {
			supportsInert = ('inert' in panel);
		} catch (e) {}

		isolatedBackgroundNodes.forEach(function(record) {
			if (!record || !record.node) {
				return;
			}
			if (supportsInert) {
				record.node.inert = record.hadInert;
				return;
			}
			if (!record.node.setAttribute || !record.node.removeAttribute) {
				return;
			}
			if (record.ariaHidden === null || typeof record.ariaHidden === 'undefined') {
				record.node.removeAttribute('aria-hidden');
				return;
			}
			record.node.setAttribute('aria-hidden', record.ariaHidden);
		});

		isolatedBackgroundNodes = [];
	}

	function focusInitialElement() {
		var panel = getPanel();
		if (!panel) {
			return;
		}
		var closeButton = qs('.side-cart__close', panel) || qs('.js-side-cart-close', panel);
		if (closeButton && isFocusable(closeButton)) {
			closeButton.focus();
			return;
		}
		var focusable = getFocusableElements(panel);
		if (focusable.length) {
			focusable[0].focus();
			return;
		}
		panel.focus();
	}

	function handleFocusTrapKeydown(e) {
		if (!focusTrapEnabled) {
			return;
		}

		if (e.key === 'Escape' || e.key === 'Esc') {
			e.preventDefault();
			e.stopPropagation();
			close();
			return;
		}

		if (e.key !== 'Tab') {
			return;
		}

		var panel = getPanel();
		if (!panel) {
			return;
		}

		var focusable = getFocusableElements(panel);
		if (!focusable.length) {
			e.preventDefault();
			panel.focus();
			return;
		}

		var activeEl = document.activeElement;
		var first = focusable[0];
		var last = focusable[focusable.length - 1];

		if (e.shiftKey) {
			if (activeEl === first || !panel.contains(activeEl)) {
				e.preventDefault();
				last.focus();
			}
			return;
		}

		if (activeEl === last) {
			e.preventDefault();
			first.focus();
		}
	}

	function handleFocusTrapFocusIn(e) {
		if (!focusTrapEnabled) {
			return;
		}
		var panel = getPanel();
		if (!panel) {
			return;
		}
		if (panel.contains(e.target)) {
			return;
		}
		focusInitialElement();
	}

	function enableFocusTrap() {
		if (focusTrapEnabled) {
			return;
		}
		focusTrapEnabled = true;
		document.addEventListener('keydown', handleFocusTrapKeydown, true);
		document.addEventListener('focusin', handleFocusTrapFocusIn, true);
	}

	function disableFocusTrap() {
		if (!focusTrapEnabled) {
			return;
		}
		focusTrapEnabled = false;
		document.removeEventListener('keydown', handleFocusTrapKeydown, true);
		document.removeEventListener('focusin', handleFocusTrapFocusIn, true);
	}

	function activateModalA11y() {
		if (document.body.classList.contains('wc-side-cart-is-open')) {
			return;
		}
		lastOpenTrigger = document.activeElement;
		setPanelAria(true);
		isolateBackground();
		enableFocusTrap();
	}

	function deactivateModalA11y() {
		setPanelAria(false);
		disableFocusTrap();
		restoreBackground();

		var restored = false;

		if (lastOpenTrigger && elementInDocument(lastOpenTrigger) && typeof lastOpenTrigger.focus === 'function') {
			try {
				lastOpenTrigger.focus();
				restored = true;
			} catch (e) {}
		}

		if (!restored && openTriggerElementId) {
			var trigger = document.getElementById(openTriggerElementId);
			if (trigger && elementInDocument(trigger) && typeof trigger.focus === 'function') {
				try {
					trigger.focus();
					restored = true;
				} catch (e) {}
			}
		}

		if (!restored) {
			var icon = qs(getSelector('floatingIcon'));
			if (icon && elementInDocument(icon) && typeof icon.focus === 'function') {
				try {
					icon.focus();
				} catch (e) {}
			}
		}
		lastOpenTrigger = null;
	}

	function open() {
		if (mode === 'headless') {
			emit('side_cart_open');
			return;
		}

		var icon = qs(getSelector('floatingIcon'));
		if (icon) {
			icon.setAttribute('aria-expanded', 'true');
		}

		if (openTriggerElementId) {
			var trigger = document.getElementById(openTriggerElementId);
			if (trigger) {
				trigger.setAttribute('aria-expanded', 'true');
			}
		}

		activateModalA11y();
		document.body.classList.add('wc-side-cart-is-open');
		lockScroll();

		var sideCart = getPanel();
		if (sideCart) {
			sideCart.classList.add('js-side-cart-opened');
		}

		icon = qs(getSelector('floatingIcon'));
		if (icon) {
			icon.classList.add('js-side-cart-close');
		}

		var backdrop = getBackdrop();
		if (backdrop) {
			backdrop.setAttribute('aria-hidden', 'true');
		}

		document.body.dispatchEvent(new CustomEvent('side_cart_open'));
		focusInitialElement();

		var now = Date.now();
		if (lastCartRefreshAt && (now - lastCartRefreshAt) < refreshThrottleMs) {
			return;
		}

		onRenderCart({ __loading: true });
		onRefreshCart().then(function(cart) {
			lastCartRefreshAt = Date.now();
			onRenderCart(cart);
		}).catch(function() {
			return onRecoverFromStoreApiFailure();
		});
	}

	function openWithCart(cart) {
		if (mode === 'headless') {
			emit('side_cart_open');
			return;
		}

		if (document.body.classList.contains('wc-side-cart-is-open')) {
			onRenderCart(cart);
			return;
		}

		var icon = qs(getSelector('floatingIcon'));
		if (icon) {
			icon.setAttribute('aria-expanded', 'true');
		}

		if (openTriggerElementId) {
			var trigger = document.getElementById(openTriggerElementId);
			if (trigger) {
				trigger.setAttribute('aria-expanded', 'true');
			}
		}

		activateModalA11y();
		document.body.classList.add('wc-side-cart-is-open');
		lockScroll();

		var sideCart = getPanel();
		if (sideCart) {
			sideCart.classList.add('js-side-cart-opened');
		}

		icon = qs(getSelector('floatingIcon'));
		if (icon) {
			icon.classList.add('js-side-cart-close');
		}

		var backdrop = getBackdrop();
		if (backdrop) {
			backdrop.setAttribute('aria-hidden', 'true');
		}

		document.body.dispatchEvent(new CustomEvent('side_cart_open'));
		focusInitialElement();
		onRenderCart(cart);
	}

	function close() {
		if (mode === 'headless') {
			emit('side_cart_close');
			return;
		}

		document.body.classList.remove('wc-side-cart-is-open');
		unlockScroll();

		var icon = qs(getSelector('floatingIcon'));
		if (icon) {
			icon.setAttribute('aria-expanded', 'false');
		}

		if (openTriggerElementId) {
			var trigger = document.getElementById(openTriggerElementId);
			if (trigger) {
				trigger.setAttribute('aria-expanded', 'false');
			}
		}

		var sideCart = getPanel();
		if (sideCart) {
			sideCart.classList.remove('js-side-cart-opened');
		}

		icon = qs(getSelector('floatingIcon'));
		if (icon) {
			icon.classList.remove('js-side-cart-close');
		}

		var backdrop = getBackdrop();
		if (backdrop) {
			backdrop.setAttribute('aria-hidden', 'true');
		}

		document.body.dispatchEvent(new CustomEvent('side_cart_close'));
		deactivateModalA11y();
	}

	return {
		open: open,
		openWithCart: openWithCart,
		close: close
	};
}
