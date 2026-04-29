function ensureLiveRegion(options) {
	var id = options && options.id ? String(options.id) : '';
	var role = options && options.role ? String(options.role) : 'status';
	var ariaLive = options && options.ariaLive ? String(options.ariaLive) : 'polite';
	var parent = options && options.parent ? options.parent : document.body;

	if (!id || !parent) {
		return null;
	}

	var existing = document.getElementById(id);
	if (existing) {
		return existing;
	}

	var el = document.createElement('div');
	el.id = id;
	el.className = 'wcsc-sr-only';
	el.setAttribute('role', role);
	el.setAttribute('aria-live', ariaLive);
	el.setAttribute('aria-atomic', 'true');

	parent.appendChild(el);

	return el;
}

export function createA11yAnnouncer(options) {
	var wcSideCart = options && options.wcSideCart ? options.wcSideCart : null;

	var politeRegionId = options && options.politeRegionId ? options.politeRegionId : 'wcsc-live-region';
	var assertiveRegionId = options && options.assertiveRegionId ? options.assertiveRegionId : 'wcsc-alert-region';

	var politeRegion = null;
	var assertiveRegion = null;

	var ignoreNextCartUpdate = false;

	function getI18n(key) {
		if (!wcSideCart || !wcSideCart.i18n) {
			return '';
		}
		return wcSideCart.i18n[key] ? String(wcSideCart.i18n[key]) : '';
	}

	function ensureRegions() {
		if (!politeRegion) {
			politeRegion = ensureLiveRegion({ id: politeRegionId, role: 'status', ariaLive: 'polite' });
		}
		if (!assertiveRegion) {
			assertiveRegion = ensureLiveRegion({ id: assertiveRegionId, role: 'alert', ariaLive: 'assertive' });
		}
	}

	function announce(message, channel) {
		var text = message ? String(message) : '';
		if (!text) {
			return;
		}

		ensureRegions();

		var region = (channel === 'assertive') ? assertiveRegion : politeRegion;
		if (!region) {
			return;
		}

		region.textContent = '';
		window.setTimeout(function() {
			region.textContent = text;
		}, 20);
	}

	function handleOpen() {
		ignoreNextCartUpdate = true;
		announce(getI18n('cartOpened'), 'polite');
		window.setTimeout(function() {
			ignoreNextCartUpdate = false;
		}, 800);
	}

	function handleClose() {
		announce(getI18n('cartClosed'), 'polite');
	}

	function handleCartUpdated() {
		if (ignoreNextCartUpdate) {
			ignoreNextCartUpdate = false;
			return;
		}
		announce(getI18n('cartUpdated'), 'polite');
	}

	function handleCartRefreshed(e) {
		if (ignoreNextCartUpdate) {
			ignoreNextCartUpdate = false;
			return;
		}
		var cart = e && e.detail ? e.detail.cart : null;
		if (cart && (!cart.items || !cart.items.length)) {
			announce(getI18n('emptyCart'), 'polite');
		}
	}

	function handleError() {
		announce(getI18n('cartError'), 'assertive');
	}

	function bind() {
		if (!document.body || !document.body.addEventListener) {
			return;
		}
		ensureRegions();
		document.body.addEventListener('side_cart_open', handleOpen);
		document.body.addEventListener('side_cart_close', handleClose);
		document.body.addEventListener('side_cart_cart_updated', handleCartUpdated);
		document.body.addEventListener('side_cart_refreshed', handleCartRefreshed);
		document.body.addEventListener('side_cart_error', handleError);
	}

	return {
		bind: bind,
		announce: announce
	};
}
