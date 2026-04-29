/**
 * Renderer (UI mode):
 * - Ensures required DOM nodes exist
 * - Creates empty/items/totals markup
 * - Provides renderer override registry (public contract)
 */

import { qs, qsa, clearNode, setBusy } from '../utils/dom.js';
import { addQueryArgs } from '../utils/url.js';
import { createPriceSpan } from '../utils/money.js';

function sanitizeClassString(value) {
	if (!value || typeof value !== 'string') {
		return '';
	}
	var trimmed = value.trim().replace(/\s+/g, ' ');
	if (!trimmed) {
		return '';
	}
	if (!/^[A-Za-z0-9_\- ]+$/.test(trimmed)) {
		return '';
	}
	return trimmed;
}

export function createRenderer(options) {
	var wcSideCart = options && options.wcSideCart ? options.wcSideCart : null;
	var settings = options && options.settings ? options.settings : {};
	var getSelector = options && options.getSelector ? options.getSelector : function() { return ''; };
	var emit = options && options.emit ? options.emit : function() {};
	var storeApi = options && options.storeApi ? options.storeApi : null;
	var cartState = options && options.cartState ? options.cartState : null;
	var mode = options && options.mode ? options.mode : 'ui';

	var uiSettings = settings.ui || {};
	var hooksHtml = settings.hooksHtml || {};
	var cssClasses = settings.cssClasses || {};
	var taxSettings = settings.tax || {};
	var taxDisplayCart = (taxSettings && typeof taxSettings.displayCart === 'string') ? taxSettings.displayCart : '';

	function sumMinorAmounts(a, b) {
		var aInt = parseInt(a, 10);
		var bInt = parseInt(b, 10);
		if (isNaN(aInt)) {
			aInt = 0;
		}
		if (isNaN(bInt)) {
			bInt = 0;
		}
		return String(aInt + bInt);
	}

	function shouldDisplayItemPricesIncludingTax(item) {
		if (!item || !item.prices || !item.totals) {
			return false;
		}
		var qty = parseInt(item.quantity, 10) || 0;
		if (qty <= 0) {
			return false;
		}
		if (typeof item.prices.price === 'undefined' || item.prices.price === null) {
			return false;
		}
		if (typeof item.totals.line_subtotal === 'undefined' || item.totals.line_subtotal === null) {
			return false;
		}
		if (typeof item.totals.line_subtotal_tax === 'undefined' || item.totals.line_subtotal_tax === null) {
			return false;
		}

		var unitPrice = parseInt(item.prices.price, 10);
		var lineSubtotal = parseInt(item.totals.line_subtotal, 10);
		var lineSubtotalTax = parseInt(item.totals.line_subtotal_tax, 10);
		if (isNaN(unitPrice) || isNaN(lineSubtotal) || isNaN(lineSubtotalTax) || lineSubtotalTax <= 0) {
			return false;
		}

		var expected = lineSubtotal + lineSubtotalTax;
		var actual = unitPrice * qty;
		return Math.abs(actual - expected) <= 1;
	}

	var showViewCartButton = (typeof uiSettings.showViewCartButton === 'boolean') ? uiSettings.showViewCartButton : true;
	var showCheckoutButton = (typeof uiSettings.showCheckoutButton === 'boolean') ? uiSettings.showCheckoutButton : true;
	var showItemRemove = (typeof uiSettings.showItemRemove === 'boolean') ? uiSettings.showItemRemove : true;
	var showItemQuantity = (typeof uiSettings.showItemQuantity === 'boolean') ? uiSettings.showItemQuantity : true;
	var enableQuantityEditing = (typeof uiSettings.enableQuantityEditing === 'boolean') ? uiSettings.enableQuantityEditing : true;
	var showItemLinks = (typeof uiSettings.showItemLinks === 'boolean') ? uiSettings.showItemLinks : true;
	var showItemPrice = (typeof uiSettings.showItemPrice === 'boolean') ? uiSettings.showItemPrice : true;
	var showItemThumbnail = (typeof uiSettings.showItemThumbnail === 'boolean') ? uiSettings.showItemThumbnail : true;
	var showSubtotal = (typeof uiSettings.showSubtotal === 'boolean') ? uiSettings.showSubtotal : true;
	var showShipping = (typeof uiSettings.showShipping === 'boolean') ? uiSettings.showShipping : false;
	var showTaxes = (typeof uiSettings.showTaxes === 'boolean') ? uiSettings.showTaxes : false;
	var showTotal = (typeof uiSettings.showTotal === 'boolean') ? uiSettings.showTotal : false;
	var showCoupons = (typeof uiSettings.showCoupons === 'boolean') ? uiSettings.showCoupons : false;
	var showFloatingCartIcon = (typeof uiSettings.showFloatingCartIcon === 'boolean') ? uiSettings.showFloatingCartIcon : true;

	var toastHost = null;
	var toastTimer = null;

	function ensureToastHost() {
		if (toastHost && toastHost.parentNode) {
			return toastHost;
		}
		var panel = qs(getSelector('panel'));
		if (!panel) {
			return null;
		}
		toastHost = panel.querySelector('.wcsc-toasts');
		if (toastHost) {
			return toastHost;
		}
		toastHost = document.createElement('div');
		toastHost.className = 'wcsc-toasts';
		toastHost.setAttribute('aria-hidden', 'true');
		panel.appendChild(toastHost);
		return toastHost;
	}

	function showToast(message, tone) {
		if (!message || typeof message !== 'string') {
			return;
		}
		var host = ensureToastHost();
		if (!host) {
			return;
		}

		if (toastTimer) {
			window.clearTimeout(toastTimer);
			toastTimer = null;
		}

		while (host.firstChild) {
			host.removeChild(host.firstChild);
		}

		var toast = document.createElement('div');
		toast.className = 'wcsc-toast' + (tone ? (' wcsc-toast--' + tone) : '');
		toast.textContent = message;
		host.appendChild(toast);
		host.classList.add('wcsc-toasts--show');

		toastTimer = window.setTimeout(function() {
			host.classList.remove('wcsc-toasts--show');
		}, 2600);
	}

	function getExtraClasses(key) {
		if (!cssClasses || typeof cssClasses !== 'object') {
			return '';
		}
		return sanitizeClassString(cssClasses[key]);
	}

	function addExtraClasses(el, key) {
		if (!el) {
			return;
		}
		var extra = getExtraClasses(key);
		if (!extra) {
			return;
		}
		extra.split(' ').forEach(function(className) {
			if (className) {
				el.classList.add(className);
			}
		});
	}

	function createHookTemplate(html) {
		if (!html || typeof html !== 'string') {
			return null;
		}
		var trimmed = html.trim();
		if (!trimmed) {
			return null;
		}

		// Prefer DOMParser so we don't assign arbitrary HTML strings directly via innerHTML.
		// hooksHtml is an authorized injection point, but this reduces the number of direct innerHTML usages.
		var template = document.createElement('template');
		if (window.DOMParser) {
			try {
				var parser = new window.DOMParser();
				var parsedDoc = parser.parseFromString(trimmed, 'text/html');
				if (parsedDoc && parsedDoc.body) {
					while (parsedDoc.body.firstChild) {
						template.content.appendChild(parsedDoc.body.firstChild);
					}
				}
			} catch (e) {}
		}

		if (!template.content || !template.content.childNodes || !template.content.childNodes.length) {
			// Fallback path for older browsers or parsing failures.
			template.innerHTML = trimmed;
		}

		if (!template.content || !template.content.childNodes || !template.content.childNodes.length) {
			return null;
		}
		if (template.content.querySelector && template.content.querySelector('script')) {
			return null;
		}

		if (document.createTreeWalker && typeof NodeFilter !== 'undefined') {
			var hasUnsafeAttr = false;
			var walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT, null, false);
			while (walker.nextNode()) {
				var el = walker.currentNode;
				if (!el || !el.attributes) {
					continue;
				}
				for (var i = 0; i < el.attributes.length; i++) {
					var name = el.attributes[i] && el.attributes[i].name ? String(el.attributes[i].name) : '';
					if (name && /^on/i.test(name)) {
						hasUnsafeAttr = true;
						break;
					}
					// Avoid javascript: URLs even if they slipped past server-side sanitization.
					if (name && (/^(href|src|xlink:href)$/i.test(name))) {
						var attrValue = el.attributes[i] && typeof el.attributes[i].value !== 'undefined' ? String(el.attributes[i].value) : '';
						if (attrValue && /^\s*javascript:/i.test(attrValue)) {
							hasUnsafeAttr = true;
							break;
						}
					}
				}
				if (hasUnsafeAttr) {
					break;
				}
			}
			if (hasUnsafeAttr) {
				return null;
			}
		}

		return template;
	}

	var hookTemplates = {
		aboveItems: createHookTemplate(hooksHtml.aboveItems),
		afterActions: createHookTemplate(hooksHtml.afterActions),
		afterFirstItem: createHookTemplate(hooksHtml.afterFirstItem)
	};

	function appendHook(targetNode, template, wrapperClass) {
		if (!targetNode || !template) {
			return;
		}
		var wrapper = document.createElement('div');
		wrapper.className = 'wcsc-hook' + (wrapperClass ? (' ' + wrapperClass) : '');
		wrapper.appendChild(template.content.cloneNode(true));
		targetNode.appendChild(wrapper);
	}

	function bootstrapUiDecorations() {
		if (mode === 'headless') {
			return;
		}
		addExtraClasses(qs(getSelector('panel')), 'panel');
		addExtraClasses(qs(getSelector('backdrop')), 'backdrop');
		addExtraClasses(qs(getSelector('container')), 'container');
		addExtraClasses(qs(getSelector('header')), 'header');
		addExtraClasses(qs(getSelector('form')), 'form');
		addExtraClasses(qs(getSelector('floatingIcon')), 'floatingIcon');

		if (!showFloatingCartIcon) {
			var floatingIcon = qs(getSelector('floatingIcon'));
			if (floatingIcon) {
				floatingIcon.style.display = 'none';
				floatingIcon.setAttribute('aria-hidden', 'true');
			}
		}
	}

	bootstrapUiDecorations();

	function ensureSideCartDom() {
		var form = qs(getSelector('form'));
		if (!form) {
			return null;
		}
		addExtraClasses(form, 'form');

		var items = qs(getSelector('items'), form);
		if (!items) {
			items = document.createElement('div');
			items.className = 'side-cart__items js-side-cart-items';
			form.insertBefore(items, form.firstChild);
		}
		addExtraClasses(items, 'items');

		var footer = qs(getSelector('footer'), form);
		if (!footer) {
			footer = document.createElement('div');
			footer.className = 'side-cart__footer';
			form.appendChild(footer);
		}
		addExtraClasses(footer, 'footer');

		var totals = qs(getSelector('totals'), footer);
		if (!totals) {
			totals = document.createElement('div');
			totals.className = 'side-cart__totals';
			footer.appendChild(totals);
		}
		addExtraClasses(totals, 'totals');

		qsa('.cart-empty, .return-to-shop', form).forEach(function(node) {
			if (node && !items.contains(node)) {
				node.parentNode.removeChild(node);
			}
		});

		return { form: form, items: items, footer: footer, totals: totals };
	}

	var emptyTemplateNodes = null;

	function captureEmptyTemplate(dom) {
		if (emptyTemplateNodes) {
			return;
		}
		var templateEl = qs(getSelector('emptyTemplate'), dom.form);
		if (templateEl && templateEl.content) {
			emptyTemplateNodes = [];
			Array.prototype.forEach.call(templateEl.content.childNodes, function(node) {
				if (node && node.nodeType === 1) {
					emptyTemplateNodes.push(node.cloneNode(true));
				}
			});
			if (emptyTemplateNodes.length) {
				return;
			}
		}
		var emptyNode = qs('.cart-empty', dom.items);
		var returnNode = qs('.return-to-shop', dom.items);
		if (!emptyNode && !returnNode) {
			return;
		}
		emptyTemplateNodes = [];
		if (emptyNode) {
			emptyTemplateNodes.push(emptyNode.cloneNode(true));
		}
		if (returnNode) {
			emptyTemplateNodes.push(returnNode.cloneNode(true));
		}
	}

	function renderEmpty(dom) {
		captureEmptyTemplate(dom);
		clearNode(dom.items);
		clearNode(dom.totals);
		dom.footer.style.display = 'none';
		dom.footer.hidden = true;

		if (emptyTemplateNodes && emptyTemplateNodes.length) {
			emptyTemplateNodes.forEach(function(node) {
				dom.items.appendChild(node.cloneNode(true));
			});
			return;
		}

		var empty = document.createElement('p');
		empty.className = 'cart-empty woocommerce-info';
		empty.textContent = (wcSideCart.i18n && wcSideCart.i18n.emptyCart) ? wcSideCart.i18n.emptyCart : '';
		dom.items.appendChild(empty);

		var returnWrap = document.createElement('p');
		returnWrap.className = 'return-to-shop';

		var returnLink = document.createElement('a');
		returnLink.className = 'button wc-backward';
		returnLink.href = (wcSideCart.urls && wcSideCart.urls.shop) ? wcSideCart.urls.shop : '/';
		returnLink.textContent = (wcSideCart.i18n && wcSideCart.i18n.returnToShop) ? wcSideCart.i18n.returnToShop : '';

		returnWrap.appendChild(returnLink);
		dom.items.appendChild(returnWrap);
	}

	function renderLoading(dom) {
		clearNode(dom.items);
		clearNode(dom.totals);
		dom.footer.style.display = 'none';
		dom.footer.hidden = true;

		var wrap = document.createElement('div');
		wrap.className = 'wcsc-loading';
		wrap.setAttribute('aria-hidden', 'true');

		for (var i = 0; i < 4; i++) {
			var line = document.createElement('div');
			line.className = 'wcsc-loading__line';
			wrap.appendChild(line);
		}

		dom.items.appendChild(wrap);
	}

	var couponPanelOpen = false;
	var couponUiAvailable = true;

	function renderTotals(dom, cart) {
		clearNode(dom.totals);
		dom.footer.style.display = '';
		dom.footer.hidden = false;

		var totalsData = cart && cart.totals ? cart.totals : {};

		var cartTotals = document.createElement('div');
		cartTotals.className = 'cart_totals wcsc-totals';

		var list = document.createElement('div');
		list.className = 'wcsc-totals__list';
		cartTotals.appendChild(list);

		function addRow(label, rawAmount, rowClass, metaText) {
			if (!label || typeof rawAmount === 'undefined' || rawAmount === null) {
				return;
			}

			var row = document.createElement('div');
			row.className = 'wcsc-totals__row' + (rowClass ? (' ' + rowClass) : '');

			var labelNode = document.createElement('div');
			labelNode.className = 'wcsc-totals__label';
			labelNode.textContent = label;

			var valueNode = document.createElement('div');
			valueNode.className = 'wcsc-totals__value';
			valueNode.setAttribute('data-title', label);

			if (metaText) {
				var metaNode = document.createElement('div');
				metaNode.className = 'wcsc-totals__meta';
				metaNode.textContent = metaText;
				valueNode.appendChild(metaNode);
			}

			valueNode.appendChild(createPriceSpan(rawAmount, totalsData));

			row.appendChild(labelNode);
			row.appendChild(valueNode);
			list.appendChild(row);
		}

		if (showSubtotal) {
			addRow(wcSideCart.i18n && wcSideCart.i18n.subtotal, totalsData.total_items, 'cart-subtotal');
		}

		function addShippingRow(label, rawAmount) {
			if (!label || typeof rawAmount === 'undefined' || rawAmount === null) {
				return;
			}
			addRow(label, rawAmount, 'shipping');
		}

		if (showShipping) {
			var shippingAmount = (typeof totalsData.total_shipping !== 'undefined' && totalsData.total_shipping !== null) ? totalsData.total_shipping : '0';
			addShippingRow(
				wcSideCart.i18n && wcSideCart.i18n.shipping,
				shippingAmount
			);
		}

		function normalizeNegative(rawAmount) {
			if (typeof rawAmount === 'undefined' || rawAmount === null) {
				return null;
			}
			var rawString = String(rawAmount).trim();
			if (!rawString) {
				return null;
			}
			if (rawString[0] === '-') {
				return rawString;
			}
			if (/^\d+$/.test(rawString) && parseInt(rawString, 10) > 0) {
				return '-' + rawString;
			}
			return rawString;
		}

		var totalDiscount = normalizeNegative(totalsData.total_discount);
		if (totalDiscount && parseInt(totalDiscount, 10)) {
			addRow(wcSideCart.i18n && wcSideCart.i18n.discount, totalDiscount, 'cart-discount');
		}

		if (showTaxes) {
			var taxesAmount = (typeof totalsData.total_tax !== 'undefined' && totalsData.total_tax !== null) ? totalsData.total_tax : '0';
			addRow(wcSideCart.i18n && wcSideCart.i18n.taxes, taxesAmount, 'tax-total');
		}

		if (showTotal) {
			addRow(wcSideCart.i18n && wcSideCart.i18n.total, totalsData.total_price, 'order-total');
		}

		// Coupon UI (optional; will auto-disable on 403/404).
		if (showCoupons && couponUiAvailable && wcSideCart.endpoints && wcSideCart.endpoints.cartApplyCoupon && wcSideCart.endpoints.cartRemoveCoupon && storeApi) {
			var couponBox = document.createElement('div');
			couponBox.className = 'wcsc-coupon';
			addExtraClasses(couponBox, 'coupon');

			var couponToggle = document.createElement('button');
			couponToggle.type = 'button';
			couponToggle.className = 'wcsc-coupon__toggle';
			var couponToggleLabel = document.createElement('span');
			couponToggleLabel.className = 'wcsc-coupon__label';
			couponToggleLabel.textContent = (wcSideCart.i18n && wcSideCart.i18n.couponToggle) ? wcSideCart.i18n.couponToggle : '';
			couponToggle.appendChild(couponToggleLabel);

			var couponToggleChevron = document.createElement('span');
			couponToggleChevron.className = 'wcsc-coupon__chevron';
			couponToggleChevron.setAttribute('aria-hidden', 'true');
			couponToggle.appendChild(couponToggleChevron);

			couponToggle.setAttribute('aria-expanded', couponPanelOpen ? 'true' : 'false');
			addExtraClasses(couponToggle, 'couponToggle');

			var couponPanel = document.createElement('div');
			couponPanel.className = 'wcsc-coupon__panel';
			couponPanel.id = 'wcsc-coupon-panel';
			couponPanel.hidden = !couponPanelOpen;
			addExtraClasses(couponPanel, 'couponForm');
			couponToggle.setAttribute('aria-controls', couponPanel.id);

			var couponRow = document.createElement('div');
			couponRow.className = 'wcsc-coupon__row';

			var couponInput = document.createElement('input');
			couponInput.type = 'text';
			couponInput.autocomplete = 'off';
			couponInput.placeholder = (wcSideCart.i18n && wcSideCart.i18n.couponPlaceholder) ? wcSideCart.i18n.couponPlaceholder : '';
			couponInput.className = 'input-text';
			addExtraClasses(couponInput, 'couponInput');

			var couponApply = document.createElement('button');
			couponApply.type = 'button';
			couponApply.className = 'button';
			couponApply.textContent = (wcSideCart.i18n && wcSideCart.i18n.couponApply) ? wcSideCart.i18n.couponApply : '';
			addExtraClasses(couponApply, 'couponApplyButton');

			var couponMessage = document.createElement('div');
			couponMessage.className = 'wcsc-coupon__message';
			couponMessage.setAttribute('role', 'status');
			couponMessage.setAttribute('aria-live', 'polite');

			couponRow.appendChild(couponInput);
			couponRow.appendChild(couponApply);
			couponPanel.appendChild(couponRow);
			couponPanel.appendChild(couponMessage);

			var appliedCoupons = (cart && cart.coupons && Array.isArray(cart.coupons)) ? cart.coupons : [];
			if (appliedCoupons.length) {
				var couponList = document.createElement('div');
				couponList.className = 'wcsc-coupon__list';
				addExtraClasses(couponList, 'couponList');

				appliedCoupons.forEach(function(coupon) {
					if (!coupon || !coupon.code) {
						return;
					}
					var code = String(coupon.code);

					var tag = document.createElement('div');
					tag.className = 'wcsc-coupon__tag';
					tag.textContent = code;

					var removeButton = document.createElement('button');
					removeButton.type = 'button';
					removeButton.className = 'wcsc-coupon__remove';
					removeButton.textContent = '×';
					removeButton.setAttribute('aria-label', (wcSideCart.i18n && wcSideCart.i18n.couponRemove) ? wcSideCart.i18n.couponRemove : '');
					addExtraClasses(removeButton, 'couponRemoveButton');

					removeButton.addEventListener('click', function() {
						couponPanelOpen = true;
						couponToggle.setAttribute('aria-expanded', 'true');
						couponPanel.hidden = false;
						couponMessage.textContent = '';
						setBusy(couponBox, true);
						removeButton.disabled = true;

						storeApi.removeCoupon(code).then(function(updatedCart) {
							if (updatedCart) {
								document.body.dispatchEvent(new CustomEvent('side_cart_coupon_removed', { detail: { code: code, cart: updatedCart } }));
								showToast((wcSideCart.i18n && wcSideCart.i18n.couponRemoved) ? wcSideCart.i18n.couponRemoved : '', 'success');
								couponPanelOpen = false;
								couponToggle.setAttribute('aria-expanded', 'false');
								couponPanel.hidden = true;
								couponMessage.textContent = '';
								couponInput.value = '';
								renderCart(updatedCart);
								return;
							}
							return storeApi.refreshCart().then(function(refreshed) {
								document.body.dispatchEvent(new CustomEvent('side_cart_coupon_removed', { detail: { code: code, cart: refreshed } }));
								showToast((wcSideCart.i18n && wcSideCart.i18n.couponRemoved) ? wcSideCart.i18n.couponRemoved : '', 'success');
								couponPanelOpen = false;
								couponToggle.setAttribute('aria-expanded', 'false');
								couponPanel.hidden = true;
								couponMessage.textContent = '';
								couponInput.value = '';
								renderCart(refreshed);
							});
						}).catch(function(err) {
							if (err && (err.status === 404 || err.status === 403)) {
								couponUiAvailable = false;
							}
							var removeMsg = (err && err.message) ? String(err.message) : ((wcSideCart.i18n && wcSideCart.i18n.couponError) ? wcSideCart.i18n.couponError : '');
							couponMessage.textContent = removeMsg;
							showToast(removeMsg, 'error');
						}).finally(function() {
							removeButton.disabled = false;
							setBusy(couponBox, false);
						});
					});

					tag.appendChild(removeButton);
					couponList.appendChild(tag);
				});

				couponPanel.appendChild(couponList);
			}

			couponToggle.addEventListener('click', function() {
				couponPanelOpen = !couponPanelOpen;
				couponToggle.setAttribute('aria-expanded', couponPanelOpen ? 'true' : 'false');
				couponPanel.hidden = !couponPanelOpen;
			});

			function handleCouponApply() {
				var code = (typeof couponInput.value === 'string') ? couponInput.value.trim() : '';
				if (!code) {
					return;
				}
				couponPanelOpen = true;
				couponToggle.setAttribute('aria-expanded', 'true');
				couponPanel.hidden = false;
				couponMessage.textContent = '';
				setBusy(couponBox, true);
				couponApply.disabled = true;
				couponInput.disabled = true;

				storeApi.applyCoupon(code).then(function(updatedCart) {
					if (updatedCart) {
						document.body.dispatchEvent(new CustomEvent('side_cart_coupon_applied', { detail: { code: code, cart: updatedCart } }));
						showToast((wcSideCart.i18n && wcSideCart.i18n.couponApplied) ? wcSideCart.i18n.couponApplied : '', 'success');
						couponPanelOpen = false;
						couponToggle.setAttribute('aria-expanded', 'false');
						couponPanel.hidden = true;
						couponMessage.textContent = '';
						couponInput.value = '';
						renderCart(updatedCart);
						return;
					}
					return storeApi.refreshCart().then(function(refreshed) {
						document.body.dispatchEvent(new CustomEvent('side_cart_coupon_applied', { detail: { code: code, cart: refreshed } }));
						showToast((wcSideCart.i18n && wcSideCart.i18n.couponApplied) ? wcSideCart.i18n.couponApplied : '', 'success');
						couponPanelOpen = false;
						couponToggle.setAttribute('aria-expanded', 'false');
						couponPanel.hidden = true;
						couponMessage.textContent = '';
						couponInput.value = '';
						renderCart(refreshed);
					});
				}).catch(function(err) {
					if (err && (err.status === 404 || err.status === 403)) {
						couponUiAvailable = false;
					}
					var applyMsg = (err && err.message) ? String(err.message) : ((wcSideCart.i18n && wcSideCart.i18n.couponError) ? wcSideCart.i18n.couponError : '');
					couponMessage.textContent = applyMsg;
					showToast(applyMsg, 'error');
				}).finally(function() {
					couponApply.disabled = false;
					couponInput.disabled = false;
					setBusy(couponBox, false);
				});
			}

			couponApply.addEventListener('click', handleCouponApply);
			couponInput.addEventListener('keydown', function(e) {
				if (e.key === 'Enter') {
					e.preventDefault();
					handleCouponApply();
				}
			});

			couponBox.appendChild(couponToggle);
			couponBox.appendChild(couponPanel);
			cartTotals.insertBefore(couponBox, list);
		}

		if (showCheckoutButton) {
			var proceed = document.createElement('div');
			proceed.className = 'wc-proceed-to-checkout';

			var checkoutLink = document.createElement('a');
			checkoutLink.className = 'checkout-button button alt wc-forward';
			checkoutLink.href = (wcSideCart.urls && wcSideCart.urls.checkout) ? wcSideCart.urls.checkout : '#';
			checkoutLink.textContent = (wcSideCart.i18n && wcSideCart.i18n.checkout) ? wcSideCart.i18n.checkout : '';

			proceed.appendChild(checkoutLink);
			cartTotals.appendChild(proceed);
		}

		dom.totals.appendChild(cartTotals);

		if (showViewCartButton) {
			var cartLink = document.createElement('a');
			cartLink.className = 'button wc-forward';
			cartLink.href = (wcSideCart.urls && wcSideCart.urls.cart) ? wcSideCart.urls.cart : '#';
			cartLink.textContent = (wcSideCart.i18n && wcSideCart.i18n.viewCart) ? wcSideCart.i18n.viewCart : '';
			dom.totals.appendChild(cartLink);
		}

		appendHook(dom.totals, hookTemplates.afterActions, 'wcsc-hook--after-actions');
	}

	function renderItems(dom, cart) {
		clearNode(dom.items);

		var items = cart && cart.items ? cart.items : [];
		if (!items.length) {
			renderEmpty(dom);
			return;
		}

		dom.footer.style.display = '';

		var fragment = document.createDocumentFragment();
		appendHook(fragment, hookTemplates.aboveItems, 'wcsc-hook--above-items');

		items.forEach(function(item, index) {
			if (!item || !item.key) {
				return;
			}

			var wrapper = document.createElement('div');
			var wrapperClasses = ['item', 'side-cart__item'];
			var isOdd = (index % 2) === 0;
			var extraItemClasses = getExtraClasses('item');
			if (extraItemClasses) {
				wrapperClasses.push(extraItemClasses);
			}
			var extraParityClasses = getExtraClasses(isOdd ? 'itemOdd' : 'itemEven');
			if (extraParityClasses) {
				wrapperClasses.push(extraParityClasses);
			}
			wrapper.className = wrapperClasses.join(' ').trim().replace(/\s+/g, ' ');
			wrapper.setAttribute('data-cart_item_key', item.key);

			var row = document.createElement('div');
			row.className = 'wcsc-row';

			var thumb = document.createElement('div');
			thumb.className = 'wcsc-thumb' + (showItemThumbnail ? '' : ' wcsc-thumb--placeholder');
			if (!showItemThumbnail) {
				thumb.setAttribute('aria-hidden', 'true');
			} else if (item.images && item.images.length && item.images[0] && (item.images[0].thumbnail || item.images[0].src)) {
				var img = document.createElement('img');
				img.loading = 'lazy';
				img.decoding = 'async';
				img.src = item.images[0].thumbnail || item.images[0].src;
				img.alt = item.name || '';
				thumb.appendChild(img);
			}
			row.appendChild(thumb);

			var main = document.createElement('div');

			var title = document.createElement('h5');
			title.className = 'side-cart__item_name';

			if (showItemLinks && item.permalink) {
				var nameLink = document.createElement('a');
				nameLink.href = item.permalink;
				nameLink.textContent = item.name || '';
				title.appendChild(nameLink);
			} else {
				title.appendChild(document.createTextNode(item.name || ''));
			}
			main.appendChild(title);

			var quantity = parseInt(item.quantity, 10) || 0;
			var hasUnitLine = false;
			if (showItemQuantity && quantity > 0 && item.prices && typeof item.prices.price !== 'undefined' && item.prices.price !== null) {
				var unitLine = document.createElement('div');
				unitLine.className = 'wcsc-unit';

				var qtyNode = document.createElement('span');
				qtyNode.className = 'wcsc-unit__qty';
				qtyNode.textContent = String(quantity);
				unitLine.appendChild(qtyNode);

				var timesNode = document.createElement('span');
				timesNode.className = 'wcsc-unit__times';
				timesNode.textContent = '×';
				unitLine.appendChild(timesNode);

				var unitPriceWrap = document.createElement('span');
				unitPriceWrap.className = 'wcsc-unit__price';
				unitPriceWrap.appendChild(createPriceSpan(String(item.prices.price), item.prices));
				unitLine.appendChild(unitPriceWrap);

				var regularUnit = (typeof item.prices.regular_price !== 'undefined' && item.prices.regular_price !== null) ? String(item.prices.regular_price) : '';
				var currentUnit = String(item.prices.price);
				if (regularUnit && regularUnit !== currentUnit && parseInt(regularUnit, 10) > parseInt(currentUnit, 10)) {
					var regularInt = parseInt(regularUnit, 10);
					var currentInt = parseInt(currentUnit, 10);
					if (regularInt > 0 && currentInt >= 0) {
						var discountPercent = Math.round((1 - (currentInt / regularInt)) * 100);
						if (discountPercent > 0) {
							var savingNode = document.createElement('span');
							savingNode.className = 'wcsc-unit__saving';
							savingNode.textContent = '-' + String(discountPercent) + '%';
							unitLine.appendChild(savingNode);
						}
					}
				}

				main.appendChild(unitLine);
				hasUnitLine = true;
			}

			if (item.variation && item.variation.length) {
				var meta = document.createElement('div');
				meta.className = 'wcsc-meta';
				meta.textContent = item.variation.map(function(variation) {
					if (!variation || !variation.attribute) {
						return '';
					}
					return String(variation.attribute) + ': ' + (variation.value || '');
				}).filter(Boolean).join(' · ');
				main.appendChild(meta);
			}

			row.appendChild(main);

			var actions = document.createElement('div');
			actions.className = 'wcsc-actions';
			var hasActions = false;

			if (showItemRemove) {
				var removeLink = document.createElement('a');
				removeLink.className = 'side-cart__remove_item js-remove-basket-item';
				removeLink.setAttribute('data-cart_item_key', item.key);
				removeLink.textContent = (wcSideCart.i18n && wcSideCart.i18n.remove) ? wcSideCart.i18n.remove : '';

				var fallbackRemoveUrl = (wcSideCart.urls && wcSideCart.urls.cart) ? wcSideCart.urls.cart : '#';
				var removeUrl = addQueryArgs(fallbackRemoveUrl, {
					remove_item: item.key,
					_wpnonce: wcSideCart.nonces ? wcSideCart.nonces.cart : ''
				});
				removeLink.href = removeUrl;

				actions.appendChild(removeLink);
				hasActions = true;
			}

			if (showItemPrice) {
				var price = document.createElement('div');
				price.className = 'wcsc-price';
				var strong = document.createElement('strong');
				if (item.totals && typeof item.totals.line_total !== 'undefined') {
					var includeTax = (taxDisplayCart === 'incl') ? true : shouldDisplayItemPricesIncludingTax(item);
					var hasSubtotal = typeof item.totals.line_subtotal !== 'undefined' && item.totals.line_subtotal !== null;
					var lineSubtotal = hasSubtotal ? String(item.totals.line_subtotal) : '';
					var lineTotal = String(item.totals.line_total);
					if (includeTax) {
						if (hasSubtotal && typeof item.totals.line_subtotal_tax !== 'undefined' && item.totals.line_subtotal_tax !== null) {
							lineSubtotal = sumMinorAmounts(lineSubtotal, item.totals.line_subtotal_tax);
						}
						if (typeof item.totals.line_total_tax !== 'undefined' && item.totals.line_total_tax !== null) {
							lineTotal = sumMinorAmounts(lineTotal, item.totals.line_total_tax);
						}
					}
					if (hasSubtotal && lineSubtotal !== lineTotal && parseInt(lineSubtotal, 10) > parseInt(lineTotal, 10)) {
						var del = document.createElement('del');
						del.appendChild(createPriceSpan(lineSubtotal, item.totals));
						var ins = document.createElement('ins');
						ins.appendChild(createPriceSpan(lineTotal, item.totals));
						strong.appendChild(del);
						strong.appendChild(document.createTextNode(' '));
						strong.appendChild(ins);
					} else {
						strong.appendChild(createPriceSpan(lineTotal, item.totals));
					}
				} else if (item.prices && typeof item.prices.price !== 'undefined') {
					var regular = (item.prices && typeof item.prices.regular_price !== 'undefined') ? String(item.prices.regular_price) : '';
					var current = String(item.prices.price);
					if (regular && regular !== current && parseInt(regular, 10) > parseInt(current, 10)) {
						var delPrice = document.createElement('del');
						delPrice.appendChild(createPriceSpan(regular, item.prices));
						var insPrice = document.createElement('ins');
						insPrice.appendChild(createPriceSpan(current, item.prices));
						strong.appendChild(delPrice);
						strong.appendChild(document.createTextNode(' '));
						strong.appendChild(insPrice);
					} else {
						strong.appendChild(createPriceSpan(current, item.prices));
					}
				}
				price.appendChild(strong);
				actions.appendChild(price);
				hasActions = true;
			}

			if (hasActions) {
				row.appendChild(actions);
			}
			wrapper.appendChild(row);

			var bottom = document.createElement('div');
			bottom.className = 'wcsc-bottom';
			var hasBottom = false;

			if (enableQuantityEditing) {
				var stepper = document.createElement('div');
				stepper.className = 'wcsc-stepper';

				var dec = document.createElement('button');
				dec.type = 'button';
					dec.className = 'js-side-cart-stepper-dec';
				dec.textContent = '−';

				var input = document.createElement('input');
				input.type = 'number';
				input.className = 'input-text qty text js-side-cart-change-qty';
				input.min = '0';
				input.step = '1';
				input.value = String(item.quantity || 0);
				input.setAttribute('data-cart_item_key', item.key);
				input.title = (wcSideCart.i18n && wcSideCart.i18n.qty) ? wcSideCart.i18n.qty : '';

				var inc = document.createElement('button');
				inc.type = 'button';
					inc.className = 'js-side-cart-stepper-inc';
				inc.textContent = '+';

				stepper.appendChild(dec);
				stepper.appendChild(input);
				stepper.appendChild(inc);
				bottom.appendChild(stepper);
				hasBottom = true;
			} else if (showItemQuantity && !hasUnitLine) {
				var qtyText = document.createElement('div');
				qtyText.className = 'wcsc-qty';
				qtyText.textContent = String(quantity);
				qtyText.title = (wcSideCart.i18n && wcSideCart.i18n.qty) ? wcSideCart.i18n.qty : '';
				bottom.appendChild(qtyText);
				hasBottom = true;
			}

			if (hasBottom) {
				wrapper.appendChild(bottom);
			}
			fragment.appendChild(wrapper);

			if (item === items[0]) {
				appendHook(fragment, hookTemplates.afterFirstItem, 'wcsc-hook--after-first-item');
			}
		});

		dom.items.appendChild(fragment);
	}

	var defaultRenderers = {
		empty: function(dom, cart, api) {
			renderEmpty(dom);
		},
		items: function(dom, cart, api) {
			renderItems(dom, cart);
		},
		totals: function(dom, cart, api) {
			renderTotals(dom, cart);
		}
	};

	var renderers = {
		empty: defaultRenderers.empty,
		items: defaultRenderers.items,
		totals: defaultRenderers.totals
	};

	function registerRenderer(name, renderer) {
		if (!name || typeof name !== 'string' || typeof renderer !== 'function') {
			return;
		}
		var key = name.trim();
		if (!key || !renderers[key]) {
			return;
		}
		renderers[key] = renderer;
	}

	function registerRenderers(map) {
		if (!map || typeof map !== 'object') {
			return;
		}
		Object.keys(map).forEach(function(key) {
			registerRenderer(key, map[key]);
		});
	}

	function resetRenderers() {
		renderers.empty = defaultRenderers.empty;
		renderers.items = defaultRenderers.items;
		renderers.totals = defaultRenderers.totals;
	}

	function renderCart(cart) {
		var dom = ensureSideCartDom();
		if (!dom) {
			return;
		}

		if (cart && cart.__loading) {
			emit('side_cart_before_render', { cart: cart });
			renderLoading(dom);
			emit('side_cart_after_render', { cart: cart });
			return;
		}

		if (cartState) {
			cartState.updateCountFromCart(cart || {});
		}

		var api = {
			emit: emit,
			selectors: { get: getSelector },
			refreshCart: storeApi ? storeApi.refreshCart : function() { return Promise.reject(new Error('Missing Store API client')); },
			updateItemQuantity: storeApi ? storeApi.updateItemQuantity : function() { return Promise.reject(new Error('Missing Store API client')); },
			removeItem: storeApi ? storeApi.removeItem : function() { return Promise.reject(new Error('Missing Store API client')); },
			applyCoupon: storeApi ? storeApi.applyCoupon : function() { return Promise.reject(new Error('Missing Store API client')); },
			removeCoupon: storeApi ? storeApi.removeCoupon : function() { return Promise.reject(new Error('Missing Store API client')); },
			createPriceSpan: createPriceSpan,
			addQueryArgs: addQueryArgs,
			appendHook: appendHook,
			hookTemplates: hookTemplates,
			getExtraClasses: getExtraClasses,
			addExtraClasses: addExtraClasses
		};

		emit('side_cart_before_render', { cart: cart });

		if (!cart || !cart.items || !cart.items.length) {
			renderers.empty(dom, cart, api);
			emit('side_cart_refreshed', { cart: cart });
			emit('side_cart_after_render', { cart: cart });
			return;
		}

		renderers.items(dom, cart, api);
		renderers.totals(dom, cart, api);

		emit('side_cart_refreshed', { cart: cart });
		emit('side_cart_cart_updated', { cart: cart });
		emit('side_cart_after_render', { cart: cart });
	}

	return {
		renderCart: renderCart,
		renderers: renderers,
		registerRenderer: registerRenderer,
		registerRenderers: registerRenderers,
		resetRenderers: resetRenderers
	};
}
