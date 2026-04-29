(function() {
  // src/js/utils/dom.js
  function onReady(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback);
      return;
    }
    callback();
  }
  function qs(selector, context) {
    return (context || document).querySelector(selector);
  }
  function qsa(selector, context) {
    return Array.prototype.slice.call((context || document).querySelectorAll(selector));
  }
  function clearNode(node) {
    while (node && node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }
  function setBusy(element, isBusy) {
    if (!element) {
      return;
    }
    if (isBusy) {
      element.setAttribute("aria-busy", "true");
      element.style.opacity = "0.6";
      element.style.pointerEvents = "none";
      return;
    }
    element.removeAttribute("aria-busy");
    element.style.opacity = "";
    element.style.pointerEvents = "";
  }

  // src/js/utils/money.js
  function getCurrencyParts(currencyData) {
    var minorUnit = 2;
    var parsedMinorUnit = parseInt(currencyData && currencyData.currency_minor_unit, 10);
    if (!isNaN(parsedMinorUnit)) {
      minorUnit = parsedMinorUnit;
    }
    if (isNaN(minorUnit) || minorUnit < 0) {
      minorUnit = 0;
    }
    return {
      minorUnit: minorUnit,
      decimalSeparator: currencyData && typeof currencyData.currency_decimal_separator !== "undefined" ? currencyData.currency_decimal_separator : ".",
      thousandSeparator: currencyData && typeof currencyData.currency_thousand_separator !== "undefined" ? currencyData.currency_thousand_separator : ",",
      prefix: currencyData && currencyData.currency_prefix ? String(currencyData.currency_prefix) : "",
      suffix: currencyData && currencyData.currency_suffix ? String(currencyData.currency_suffix) : ""
    };
  }
  function normalizeMinorValue(rawValue) {
    var rawString = rawValue === null || typeof rawValue === "undefined" ? "" : String(rawValue);
    rawString = rawString.trim();
    if (!rawString) {
      return null;
    }
    var sign = "";
    if (rawString[0] === "-") {
      sign = "-";
      rawString = rawString.slice(1);
    } else if (rawString[0] === "+") {
      rawString = rawString.slice(1);
    }
    if (!/^\d+$/.test(rawString)) {
      var fallbackIntValue = parseInt(rawString, 10);
      if (isNaN(fallbackIntValue)) {
        return null;
      }
      sign = fallbackIntValue < 0 ? "-" : sign;
      rawString = String(Math.abs(fallbackIntValue));
    }
    rawString = rawString.replace(/^0+(?=\d)/, "");
    return { sign: sign, digits: rawString };
  }
  function formatMinorToParts(rawValue, currencyData) {
    var currencyParts = getCurrencyParts(currencyData);
    var normalized = normalizeMinorValue(rawValue);
    if (!normalized) {
      return null;
    }
    var rawDigits = normalized.digits;
    var minorUnit = currencyParts.minorUnit;
    var whole = "0";
    var decimals = "";
    if (minorUnit === 0) {
      whole = rawDigits;
    } else if (rawDigits.length <= minorUnit) {
      whole = "0";
      decimals = rawDigits.padStart(minorUnit, "0");
    } else {
      whole = rawDigits.slice(0, rawDigits.length - minorUnit);
      decimals = rawDigits.slice(rawDigits.length - minorUnit);
    }
    whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, currencyParts.thousandSeparator);
    return {
      sign: normalized.sign,
      whole: whole,
      decimals: decimals,
      minorUnit: minorUnit,
      decimalSeparator: currencyParts.decimalSeparator,
      prefix: currencyParts.prefix,
      suffix: currencyParts.suffix
    };
  }
  function createCurrencySymbolSpan(symbolText) {
    var symbol = document.createElement("span");
    symbol.className = "woocommerce-Price-currencySymbol";
    symbol.textContent = symbolText;
    return symbol;
  }
  function createPriceSpan(rawValue, currencyData) {
    var span = document.createElement("span");
    span.className = "woocommerce-Price-amount amount";
    var bdi = document.createElement("bdi");
    var parts = formatMinorToParts(rawValue, currencyData);
    if (!parts) {
      bdi.textContent = "";
      span.appendChild(bdi);
      return span;
    }
    if (parts.sign) {
      bdi.appendChild(document.createTextNode(parts.sign));
    }
    var numberString = parts.whole + (parts.minorUnit > 0 ? parts.decimalSeparator + parts.decimals : "");
    if (parts.prefix) {
      bdi.appendChild(createCurrencySymbolSpan(parts.prefix));
      bdi.appendChild(document.createTextNode(numberString));
      span.appendChild(bdi);
      return span;
    }
    if (parts.suffix) {
      bdi.appendChild(document.createTextNode(numberString));
      bdi.appendChild(createCurrencySymbolSpan(parts.suffix));
      span.appendChild(bdi);
      return span;
    }
    bdi.appendChild(document.createTextNode(numberString));
    span.appendChild(bdi);
    return span;
  }
  function getCartItemCount(cart) {
    if (cart && typeof cart.items_count !== "undefined") {
      return parseInt(cart.items_count, 10) || 0;
    }
    if (!cart || !cart.items || !cart.items.length) {
      return 0;
    }
    return cart.items.reduce(function(sum, item) {
      return sum + (parseInt(item.quantity, 10) || 0);
    }, 0);
  }

  // src/js/state/cartState.js
  function createCartState(options) {
    var wcSideCart = options && options.wcSideCart ? options.wcSideCart : null;
    var badgeElementId = options && options.badgeElementId ? options.badgeElementId : "";
    var storeApiNonceStorageKey = "wcSideCartStoreApiNonce";
    var cartTokenStorageKey = "wcSideCartCartToken";
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
      } catch (e) {
      }
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
      var refreshedNonce = headers.get("Nonce") || headers.get("X-WC-Store-API-Nonce");
      if (refreshedNonce) {
        wcSideCart.storeApiNonce = refreshedNonce;
        setSessionValue(storeApiNonceStorageKey, refreshedNonce);
      }
      var refreshedCartToken = headers.get("Cart-Token");
      if (refreshedCartToken) {
        wcSideCart.cartToken = refreshedCartToken;
        setSessionValue(cartTokenStorageKey, refreshedCartToken);
      }
    }
    function clearTokens() {
      if (!wcSideCart) {
        return;
      }
      wcSideCart.storeApiNonce = "";
      wcSideCart.cartToken = "";
      setSessionValue(storeApiNonceStorageKey, "");
      setSessionValue(cartTokenStorageKey, "");
    }
    function updateCountFromCart(cart) {
      var count = String(getCartItemCount(cart));
      qsa(".js-side-cart-number, #wc-side-cart-panel .side-cart__number, a.js-side-cart-open .side-cart__number").forEach(function(el) {
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
      return wcSideCart && wcSideCart.storeApiNonce ? wcSideCart.storeApiNonce : "";
    }
    function getCartToken() {
      return wcSideCart && wcSideCart.cartToken ? wcSideCart.cartToken : "";
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

  // src/js/storeApi/client.js
  function normalizeCouponCode(code) {
    if (typeof code === "undefined" || code === null) {
      return "";
    }
    var trimmed = String(code).trim();
    if (!trimmed) {
      return "";
    }
    return trimmed;
  }
  function createStoreApiClient(options) {
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
      if (typeof console === "undefined" || !console || typeof console.log !== "function") {
        return;
      }
      try {
        console.log("[wc-side-cart][blocksSync] " + String(message));
      } catch (e) {
      }
    }
    function getWpData() {
      if (cachedWpDataChecked) {
        return cachedWpData;
      }
      cachedWpDataChecked = true;
      if (typeof window === "undefined") {
        cachedWpData = null;
        return cachedWpData;
      }
      var wp = window.wp ? window.wp : null;
      var wpData = wp && wp.data ? wp.data : null;
      if (!wpData || typeof wpData.select !== "function" || typeof wpData.dispatch !== "function") {
        cachedWpData = null;
        debugLog("wp.data unavailable");
        return cachedWpData;
      }
      cachedWpData = wpData;
      debugLog("wp.data detected");
      return cachedWpData;
    }
    function hasWpDataStore(wpData, storeKey) {
      if (!wpData || !storeKey) {
        return false;
      }
      if (typeof wpData.hasStore === "function") {
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
      var storeKey = "wc/store/cart";
      if (!hasWpDataStore(wpData, storeKey)) {
        cachedBlocksCartDispatch = null;
        debugLog("store wc/store/cart unavailable");
        return cachedBlocksCartDispatch;
      }
      try {
        var dispatchObj = wpData.dispatch(storeKey);
        cachedBlocksCartDispatch = dispatchObj || null;
        debugLog("store wc/store/cart detected");
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
      var updaterNames = ["receiveCart", "setCartData", "receiveCartContents"];
      for (var i = 0; i < updaterNames.length; i++) {
        var name = updaterNames[i];
        if (!dispatchObj || typeof dispatchObj[name] !== "function") {
          continue;
        }
        try {
          if (name === "receiveCartContents" && cart && cart.items && typeof cart.items.length !== "undefined") {
            try {
              dispatchObj[name](cart);
              updated = true;
              debugLog("store updated via " + name);
              break;
            } catch (e4) {
              dispatchObj[name](cart.items);
              updated = true;
              debugLog("store updated via " + name + "(items)");
              break;
            }
          }
          dispatchObj[name](cart);
          updated = true;
          debugLog("store updated via " + name);
          break;
        } catch (e5) {
        }
      }
      return updated;
    }
    function doWpHooksAction(name, payload) {
      if (!name || typeof name !== "string") {
        return;
      }
      if (typeof window === "undefined") {
        return;
      }
      var wp = window.wp ? window.wp : null;
      var hooks = wp && wp.hooks ? wp.hooks : null;
      if (!hooks || typeof hooks.doAction !== "function") {
        return;
      }
      try {
        hooks.doAction(name, payload || {});
      } catch (e) {
      }
    }
    function emitBlocksEvent(name, detail) {
      if (!name || typeof name !== "string") {
        return;
      }
      if (typeof document === "undefined" || typeof window === "undefined" || !window.CustomEvent) {
        return;
      }
      try {
        var payload = detail || {};
        if (document) {
          try {
            document.dispatchEvent(new window.CustomEvent(name, { detail: payload }));
          } catch (e2) {
          }
        }
        if (document && document.body) {
          try {
            document.body.dispatchEvent(new window.CustomEvent(name, { detail: payload }));
          } catch (e3) {
          }
        }
        try {
          window.dispatchEvent(new window.CustomEvent(name, { detail: payload }));
        } catch (e4) {
        }
      } catch (e) {
      }
    }
    function buildBlocksInvalidationPayload(options2) {
      var payload = { preserveCartData: false };
      if (options2 && typeof options2.cartItemKey === "string" && options2.cartItemKey) {
        payload.cartItemKey = options2.cartItemKey;
      }
      return payload;
    }
    function syncBlocksAfterMutation(options2, cart) {
      tryUpdateBlocksCartStore(cart);
      var invalidationPayload = buildBlocksInvalidationPayload(options2);
      emitBlocksEvent("wc-blocks_added_to_cart", invalidationPayload);
      if (options2 && options2.removedFromCart) {
        emitBlocksEvent("wc-blocks_removed_from_cart", invalidationPayload);
      }
      if (options2 && options2.mutation === "setQuantity") {
        if (options2.removedFromCart) {
          doWpHooksAction("experimental__woocommerce_blocks-cart-remove-item", {
            key: options2.cartItemKey
          });
        } else {
          doWpHooksAction("experimental__woocommerce_blocks-cart-set-item-quantity", {
            key: options2.cartItemKey,
            quantity: options2.quantity
          });
        }
      }
      if (options2 && options2.mutation === "removeItem") {
        doWpHooksAction("experimental__woocommerce_blocks-cart-remove-item", {
          key: options2.cartItemKey
        });
      }
      return cart;
    }
    function normalizeUrlForCompare(url) {
      if (!url || typeof url !== "string") {
        return "";
      }
      var base = url.split("#")[0].split("?")[0];
      while (base.length > 1 && base.charAt(base.length - 1) === "/") {
        base = base.slice(0, -1);
      }
      return base;
    }
    function getCacheBustingSettings() {
      var settings = wcSideCart && wcSideCart.settings ? wcSideCart.settings : null;
      var storeApi = settings && settings.storeApi ? settings.storeApi : null;
      var cacheBusting = storeApi && storeApi.cacheBusting ? storeApi.cacheBusting : null;
      var enabled = !!(cacheBusting && cacheBusting.enabled);
      var param = cacheBusting && typeof cacheBusting.param === "string" ? cacheBusting.param.trim() : "";
      var strategy = cacheBusting && typeof cacheBusting.strategy === "string" ? cacheBusting.strategy.trim().toLowerCase() : "timestamp";
      if (!param) {
        param = "wcsc_cb";
      }
      if (strategy !== "timestamp" && strategy !== "random") {
        strategy = "timestamp";
      }
      return { enabled: enabled, param: param, strategy: strategy };
    }
    function getCacheBustingValue(strategy) {
      if (strategy === "random") {
        return String(Math.random()).slice(2) + String(Date.now());
      }
      return String(Date.now());
    }
    function appendQueryParam(url, key, value) {
      if (typeof URL !== "undefined") {
        try {
          var u = new URL(url, window.location && window.location.origin ? window.location.origin : void 0);
          u.searchParams.set(key, value);
          return u.toString();
        } catch (e) {
        }
      }
      var encodedKey = encodeURIComponent(key);
      var encodedValue = encodeURIComponent(value);
      var hasQuery = url.indexOf("?") !== -1;
      var separator = hasQuery ? "&" : "?";
      return url + separator + encodedKey + "=" + encodedValue;
    }
    function maybeApplyCartCacheBusting(url, method) {
      if (method !== "GET") {
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
      var nonce = cartState ? cartState.getStoreApiNonce() : "";
      if (nonce) {
        headers["Nonce"] = nonce;
        headers["X-WC-Store-API-Nonce"] = nonce;
      }
      var cartToken = cartState ? cartState.getCartToken() : "";
      if (cartToken) {
        headers["Cart-Token"] = cartToken;
      }
      if (method !== "GET") {
        headers["Content-Type"] = "application/json";
      }
      var finalUrl = maybeApplyCartCacheBusting(url, method);
      return window.fetch(finalUrl, {
        method: method,
        cache: "no-store",
        credentials: "same-origin",
        headers: headers,
        body: body && method !== "GET" ? JSON.stringify(body) : void 0,
        signal: signal
      }).then(function(response) {
        function decodeHtmlEntities(input) {
          var text = input ? String(input) : "";
          if (!text) {
            return "";
          }
          if (typeof document === "undefined" || !document.createElement) {
            return text;
          }
          var textarea = document.createElement("textarea");
          textarea.innerHTML = text;
          return textarea.value;
        }
        if (cartState) {
          cartState.updateFromResponseHeaders(response.headers);
        }
        if (!response.ok) {
          return response.text().then(function(text) {
            var raw = text ? String(text) : "";
            var data = null;
            try {
              data = raw ? JSON.parse(raw) : null;
            } catch (e) {
              data = null;
            }
            var msg = data && data.message ? decodeHtmlEntities(data.message) : raw ? decodeHtmlEntities(raw) : "Store API request failed: " + response.status;
            var error = new Error(msg);
            error.status = response.status;
            error.code = data && data.code ? String(data.code) : "";
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
        return Promise.reject(new Error("Missing cart endpoint"));
      }
      if (refreshCartPromise) {
        return refreshCartPromise;
      }
      refreshCartPromise = request(wcSideCart.endpoints.cart, "GET").catch(function(err) {
        if (cartState) {
          cartState.clearTokens();
        }
        return request(wcSideCart.endpoints.cart, "GET").catch(function() {
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
      var token = cartState ? cartState.getCartToken() : "";
      if (token) {
        return Promise.resolve(token);
      }
      return refreshCart().then(function() {
        return cartState ? cartState.getCartToken() || null : null;
      }).catch(function() {
        return null;
      });
    }
    function updateItemQuantity(cartItemKey, quantity) {
      if (!wcSideCart || !wcSideCart.endpoints || !wcSideCart.endpoints.cartUpdateItem) {
        return Promise.reject(new Error("Missing update item endpoint"));
      }
      return ensureCartToken().then(function() {
        if (updateItemAbort) {
          updateItemAbort.abort();
        }
        updateItemAbort = window.AbortController ? new AbortController() : null;
        return request(wcSideCart.endpoints.cartUpdateItem, "POST", {
          key: cartItemKey,
          quantity: quantity
        }, updateItemAbort ? updateItemAbort.signal : void 0);
      }).then(function(cart) {
        return syncBlocksAfterMutation({
          mutation: "setQuantity",
          cartItemKey: cartItemKey,
          quantity: quantity,
          removedFromCart: quantity <= 0
        }, cart);
      });
    }
    function removeItem(cartItemKey) {
      if (!wcSideCart || !wcSideCart.endpoints || !wcSideCart.endpoints.cartRemoveItem) {
        return Promise.reject(new Error("Missing remove item endpoint"));
      }
      return ensureCartToken().then(function() {
        if (removeItemAbort) {
          removeItemAbort.abort();
        }
        removeItemAbort = window.AbortController ? new AbortController() : null;
        return request(wcSideCart.endpoints.cartRemoveItem, "POST", {
          key: cartItemKey
        }, removeItemAbort ? removeItemAbort.signal : void 0);
      }).then(function(cart) {
        return syncBlocksAfterMutation({
          mutation: "removeItem",
          cartItemKey: cartItemKey,
          removedFromCart: true
        }, cart);
      });
    }
    function applyCoupon(code) {
      if (!wcSideCart || !wcSideCart.endpoints || !wcSideCart.endpoints.cartApplyCoupon) {
        return Promise.reject(new Error("Missing apply coupon endpoint"));
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
        return request(wcSideCart.endpoints.cartApplyCoupon, "POST", { code: normalized }, couponAbort ? couponAbort.signal : void 0);
      }).then(function(cart) {
        return syncBlocksAfterMutation({ mutation: "coupon", removedFromCart: false }, cart);
      });
    }
    function removeCoupon(code) {
      if (!wcSideCart || !wcSideCart.endpoints || !wcSideCart.endpoints.cartRemoveCoupon) {
        return Promise.reject(new Error("Missing remove coupon endpoint"));
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
        return request(wcSideCart.endpoints.cartRemoveCoupon, "POST", { code: normalized }, couponAbort ? couponAbort.signal : void 0);
      }).then(function(cart) {
        return syncBlocksAfterMutation({ mutation: "coupon", removedFromCart: false }, cart);
      });
    }
    function recoverFromStoreApiFailure(options2, renderCart) {
      return refreshCart().then(function(cart) {
        if (typeof renderCart === "function") {
          renderCart(cart);
        }
        return cart;
      }).catch(function() {
        if (options2 && options2.fallbackUrl) {
          window.location = options2.fallbackUrl;
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

  // src/js/utils/url.js
  function addQueryArgs(baseUrl, args) {
    var url;
    try {
      url = new URL(baseUrl, window.location.origin);
    } catch (e) {
      return baseUrl;
    }
    Object.keys(args || {}).forEach(function(key) {
      if (typeof args[key] === "undefined" || args[key] === null) {
        return;
      }
      url.searchParams.set(key, String(args[key]));
    });
    return url.toString();
  }

  // src/js/renderer/renderer.js
  function sanitizeClassString(value) {
    if (!value || typeof value !== "string") {
      return "";
    }
    var trimmed = value.trim().replace(/\s+/g, " ");
    if (!trimmed) {
      return "";
    }
    if (!/^[A-Za-z0-9_\- ]+$/.test(trimmed)) {
      return "";
    }
    return trimmed;
  }
  function createRenderer(options) {
    var wcSideCart = options && options.wcSideCart ? options.wcSideCart : null;
    var settings = options && options.settings ? options.settings : {};
    var getSelector = options && options.getSelector ? options.getSelector : function() {
      return "";
    };
    var emit = options && options.emit ? options.emit : function() {
    };
    var storeApi = options && options.storeApi ? options.storeApi : null;
    var cartState = options && options.cartState ? options.cartState : null;
    var mode = options && options.mode ? options.mode : "ui";
    var uiSettings = settings.ui || {};
    var hooksHtml = settings.hooksHtml || {};
    var cssClasses = settings.cssClasses || {};
    var taxSettings = settings.tax || {};
    var taxDisplayCart = taxSettings && typeof taxSettings.displayCart === "string" ? taxSettings.displayCart : "";
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
      if (typeof item.prices.price === "undefined" || item.prices.price === null) {
        return false;
      }
      if (typeof item.totals.line_subtotal === "undefined" || item.totals.line_subtotal === null) {
        return false;
      }
      if (typeof item.totals.line_subtotal_tax === "undefined" || item.totals.line_subtotal_tax === null) {
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
    var showViewCartButton = typeof uiSettings.showViewCartButton === "boolean" ? uiSettings.showViewCartButton : true;
    var showCheckoutButton = typeof uiSettings.showCheckoutButton === "boolean" ? uiSettings.showCheckoutButton : true;
    var showItemRemove = typeof uiSettings.showItemRemove === "boolean" ? uiSettings.showItemRemove : true;
    var showItemQuantity = typeof uiSettings.showItemQuantity === "boolean" ? uiSettings.showItemQuantity : true;
    var enableQuantityEditing = typeof uiSettings.enableQuantityEditing === "boolean" ? uiSettings.enableQuantityEditing : true;
    var showItemLinks = typeof uiSettings.showItemLinks === "boolean" ? uiSettings.showItemLinks : true;
    var showItemPrice = typeof uiSettings.showItemPrice === "boolean" ? uiSettings.showItemPrice : true;
    var showItemThumbnail = typeof uiSettings.showItemThumbnail === "boolean" ? uiSettings.showItemThumbnail : true;
    var showSubtotal = typeof uiSettings.showSubtotal === "boolean" ? uiSettings.showSubtotal : true;
    var showShipping = typeof uiSettings.showShipping === "boolean" ? uiSettings.showShipping : false;
    var showTaxes = typeof uiSettings.showTaxes === "boolean" ? uiSettings.showTaxes : false;
    var showTotal = typeof uiSettings.showTotal === "boolean" ? uiSettings.showTotal : false;
    var showCoupons = typeof uiSettings.showCoupons === "boolean" ? uiSettings.showCoupons : false;
    var showFloatingCartIcon = typeof uiSettings.showFloatingCartIcon === "boolean" ? uiSettings.showFloatingCartIcon : true;
    var toastHost = null;
    var toastTimer = null;
    function ensureToastHost() {
      if (toastHost && toastHost.parentNode) {
        return toastHost;
      }
      var panel = qs(getSelector("panel"));
      if (!panel) {
        return null;
      }
      toastHost = panel.querySelector(".wcsc-toasts");
      if (toastHost) {
        return toastHost;
      }
      toastHost = document.createElement("div");
      toastHost.className = "wcsc-toasts";
      toastHost.setAttribute("aria-hidden", "true");
      panel.appendChild(toastHost);
      return toastHost;
    }
    function showToast(message, tone) {
      if (!message || typeof message !== "string") {
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
      var toast = document.createElement("div");
      toast.className = "wcsc-toast" + (tone ? " wcsc-toast--" + tone : "");
      toast.textContent = message;
      host.appendChild(toast);
      host.classList.add("wcsc-toasts--show");
      toastTimer = window.setTimeout(function() {
        host.classList.remove("wcsc-toasts--show");
      }, 2600);
    }
    function getExtraClasses(key) {
      if (!cssClasses || typeof cssClasses !== "object") {
        return "";
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
      extra.split(" ").forEach(function(className) {
        if (className) {
          el.classList.add(className);
        }
      });
    }
    function createHookTemplate(html) {
      if (!html || typeof html !== "string") {
        return null;
      }
      var trimmed = html.trim();
      if (!trimmed) {
        return null;
      }
      var template = document.createElement("template");
      if (window.DOMParser) {
        try {
          var parser = new window.DOMParser();
          var parsedDoc = parser.parseFromString(trimmed, "text/html");
          if (parsedDoc && parsedDoc.body) {
            while (parsedDoc.body.firstChild) {
              template.content.appendChild(parsedDoc.body.firstChild);
            }
          }
        } catch (e) {
        }
      }
      if (!template.content || !template.content.childNodes || !template.content.childNodes.length) {
        template.innerHTML = trimmed;
      }
      if (!template.content || !template.content.childNodes || !template.content.childNodes.length) {
        return null;
      }
      if (template.content.querySelector && template.content.querySelector("script")) {
        return null;
      }
      if (document.createTreeWalker && typeof NodeFilter !== "undefined") {
        var hasUnsafeAttr = false;
        var walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT, null, false);
        while (walker.nextNode()) {
          var el = walker.currentNode;
          if (!el || !el.attributes) {
            continue;
          }
          for (var i = 0; i < el.attributes.length; i++) {
            var name = el.attributes[i] && el.attributes[i].name ? String(el.attributes[i].name) : "";
            if (name && /^on/i.test(name)) {
              hasUnsafeAttr = true;
              break;
            }
            if (name && /^(href|src|xlink:href)$/i.test(name)) {
              var attrValue = el.attributes[i] && typeof el.attributes[i].value !== "undefined" ? String(el.attributes[i].value) : "";
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
      var wrapper = document.createElement("div");
      wrapper.className = "wcsc-hook" + (wrapperClass ? " " + wrapperClass : "");
      wrapper.appendChild(template.content.cloneNode(true));
      targetNode.appendChild(wrapper);
    }
    function bootstrapUiDecorations() {
      if (mode === "headless") {
        return;
      }
      addExtraClasses(qs(getSelector("panel")), "panel");
      addExtraClasses(qs(getSelector("backdrop")), "backdrop");
      addExtraClasses(qs(getSelector("container")), "container");
      addExtraClasses(qs(getSelector("header")), "header");
      addExtraClasses(qs(getSelector("form")), "form");
      addExtraClasses(qs(getSelector("floatingIcon")), "floatingIcon");
      if (!showFloatingCartIcon) {
        var floatingIcon = qs(getSelector("floatingIcon"));
        if (floatingIcon) {
          floatingIcon.style.display = "none";
          floatingIcon.setAttribute("aria-hidden", "true");
        }
      }
    }
    bootstrapUiDecorations();
    function ensureSideCartDom() {
      var form = qs(getSelector("form"));
      if (!form) {
        return null;
      }
      addExtraClasses(form, "form");
      var items = qs(getSelector("items"), form);
      if (!items) {
        items = document.createElement("div");
        items.className = "side-cart__items js-side-cart-items";
        form.insertBefore(items, form.firstChild);
      }
      addExtraClasses(items, "items");
      var footer = qs(getSelector("footer"), form);
      if (!footer) {
        footer = document.createElement("div");
        footer.className = "side-cart__footer";
        form.appendChild(footer);
      }
      addExtraClasses(footer, "footer");
      var totals = qs(getSelector("totals"), footer);
      if (!totals) {
        totals = document.createElement("div");
        totals.className = "side-cart__totals";
        footer.appendChild(totals);
      }
      addExtraClasses(totals, "totals");
      qsa(".cart-empty, .return-to-shop", form).forEach(function(node) {
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
      var templateEl = qs(getSelector("emptyTemplate"), dom.form);
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
      var emptyNode = qs(".cart-empty", dom.items);
      var returnNode = qs(".return-to-shop", dom.items);
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
      dom.footer.style.display = "none";
      dom.footer.hidden = true;
      if (emptyTemplateNodes && emptyTemplateNodes.length) {
        emptyTemplateNodes.forEach(function(node) {
          dom.items.appendChild(node.cloneNode(true));
        });
        return;
      }
      var empty = document.createElement("p");
      empty.className = "cart-empty woocommerce-info";
      empty.textContent = wcSideCart.i18n && wcSideCart.i18n.emptyCart ? wcSideCart.i18n.emptyCart : "";
      dom.items.appendChild(empty);
      var returnWrap = document.createElement("p");
      returnWrap.className = "return-to-shop";
      var returnLink = document.createElement("a");
      returnLink.className = "button wc-backward";
      returnLink.href = wcSideCart.urls && wcSideCart.urls.shop ? wcSideCart.urls.shop : "/";
      returnLink.textContent = wcSideCart.i18n && wcSideCart.i18n.returnToShop ? wcSideCart.i18n.returnToShop : "";
      returnWrap.appendChild(returnLink);
      dom.items.appendChild(returnWrap);
    }
    function renderLoading(dom) {
      clearNode(dom.items);
      clearNode(dom.totals);
      dom.footer.style.display = "none";
      dom.footer.hidden = true;
      var wrap = document.createElement("div");
      wrap.className = "wcsc-loading";
      wrap.setAttribute("aria-hidden", "true");
      for (var i = 0; i < 4; i++) {
        var line = document.createElement("div");
        line.className = "wcsc-loading__line";
        wrap.appendChild(line);
      }
      dom.items.appendChild(wrap);
    }
    var couponPanelOpen = false;
    var couponUiAvailable = true;
    function renderTotals(dom, cart) {
      clearNode(dom.totals);
      dom.footer.style.display = "";
      dom.footer.hidden = false;
      var totalsData = cart && cart.totals ? cart.totals : {};
      var cartTotals = document.createElement("div");
      cartTotals.className = "cart_totals wcsc-totals";
      var list = document.createElement("div");
      list.className = "wcsc-totals__list";
      cartTotals.appendChild(list);
      function addRow(label, rawAmount, rowClass, metaText) {
        if (!label || typeof rawAmount === "undefined" || rawAmount === null) {
          return;
        }
        var row = document.createElement("div");
        row.className = "wcsc-totals__row" + (rowClass ? " " + rowClass : "");
        var labelNode = document.createElement("div");
        labelNode.className = "wcsc-totals__label";
        labelNode.textContent = label;
        var valueNode = document.createElement("div");
        valueNode.className = "wcsc-totals__value";
        valueNode.setAttribute("data-title", label);
        if (metaText) {
          var metaNode = document.createElement("div");
          metaNode.className = "wcsc-totals__meta";
          metaNode.textContent = metaText;
          valueNode.appendChild(metaNode);
        }
        valueNode.appendChild(createPriceSpan(rawAmount, totalsData));
        row.appendChild(labelNode);
        row.appendChild(valueNode);
        list.appendChild(row);
      }
      if (showSubtotal) {
        addRow(wcSideCart.i18n && wcSideCart.i18n.subtotal, totalsData.total_items, "cart-subtotal");
      }
      function addShippingRow(label, rawAmount) {
        if (!label || typeof rawAmount === "undefined" || rawAmount === null) {
          return;
        }
        addRow(label, rawAmount, "shipping");
      }
      if (showShipping) {
        var shippingAmount = typeof totalsData.total_shipping !== "undefined" && totalsData.total_shipping !== null ? totalsData.total_shipping : "0";
        addShippingRow(
          wcSideCart.i18n && wcSideCart.i18n.shipping,
          shippingAmount
        );
      }
      function normalizeNegative(rawAmount) {
        if (typeof rawAmount === "undefined" || rawAmount === null) {
          return null;
        }
        var rawString = String(rawAmount).trim();
        if (!rawString) {
          return null;
        }
        if (rawString[0] === "-") {
          return rawString;
        }
        if (/^\d+$/.test(rawString) && parseInt(rawString, 10) > 0) {
          return "-" + rawString;
        }
        return rawString;
      }
      var totalDiscount = normalizeNegative(totalsData.total_discount);
      if (totalDiscount && parseInt(totalDiscount, 10)) {
        addRow(wcSideCart.i18n && wcSideCart.i18n.discount, totalDiscount, "cart-discount");
      }
      if (showTaxes) {
        var taxesAmount = typeof totalsData.total_tax !== "undefined" && totalsData.total_tax !== null ? totalsData.total_tax : "0";
        addRow(wcSideCart.i18n && wcSideCart.i18n.taxes, taxesAmount, "tax-total");
      }
      if (showTotal) {
        addRow(wcSideCart.i18n && wcSideCart.i18n.total, totalsData.total_price, "order-total");
      }
      if (showCoupons && couponUiAvailable && wcSideCart.endpoints && wcSideCart.endpoints.cartApplyCoupon && wcSideCart.endpoints.cartRemoveCoupon && storeApi) {
        var handleCouponApply = function() {
          var code = typeof couponInput.value === "string" ? couponInput.value.trim() : "";
          if (!code) {
            return;
          }
          couponPanelOpen = true;
          couponToggle.setAttribute("aria-expanded", "true");
          couponPanel.hidden = false;
          couponMessage.textContent = "";
          setBusy(couponBox, true);
          couponApply.disabled = true;
          couponInput.disabled = true;
          storeApi.applyCoupon(code).then(function(updatedCart) {
            if (updatedCart) {
              document.body.dispatchEvent(new CustomEvent("side_cart_coupon_applied", { detail: { code: code, cart: updatedCart } }));
              showToast(wcSideCart.i18n && wcSideCart.i18n.couponApplied ? wcSideCart.i18n.couponApplied : "", "success");
              couponPanelOpen = false;
              couponToggle.setAttribute("aria-expanded", "false");
              couponPanel.hidden = true;
              couponMessage.textContent = "";
              couponInput.value = "";
              renderCart(updatedCart);
              return;
            }
            return storeApi.refreshCart().then(function(refreshed) {
              document.body.dispatchEvent(new CustomEvent("side_cart_coupon_applied", { detail: { code: code, cart: refreshed } }));
              showToast(wcSideCart.i18n && wcSideCart.i18n.couponApplied ? wcSideCart.i18n.couponApplied : "", "success");
              couponPanelOpen = false;
              couponToggle.setAttribute("aria-expanded", "false");
              couponPanel.hidden = true;
              couponMessage.textContent = "";
              couponInput.value = "";
              renderCart(refreshed);
            });
          }).catch(function(err) {
            if (err && (err.status === 404 || err.status === 403)) {
              couponUiAvailable = false;
            }
            var applyMsg = err && err.message ? String(err.message) : wcSideCart.i18n && wcSideCart.i18n.couponError ? wcSideCart.i18n.couponError : "";
            couponMessage.textContent = applyMsg;
            showToast(applyMsg, "error");
          }).finally(function() {
            couponApply.disabled = false;
            couponInput.disabled = false;
            setBusy(couponBox, false);
          });
        };
        var couponBox = document.createElement("div");
        couponBox.className = "wcsc-coupon";
        addExtraClasses(couponBox, "coupon");
        var couponToggle = document.createElement("button");
        couponToggle.type = "button";
        couponToggle.className = "wcsc-coupon__toggle";
        var couponToggleLabel = document.createElement("span");
        couponToggleLabel.className = "wcsc-coupon__label";
        couponToggleLabel.textContent = wcSideCart.i18n && wcSideCart.i18n.couponToggle ? wcSideCart.i18n.couponToggle : "";
        couponToggle.appendChild(couponToggleLabel);
        var couponToggleChevron = document.createElement("span");
        couponToggleChevron.className = "wcsc-coupon__chevron";
        couponToggleChevron.setAttribute("aria-hidden", "true");
        couponToggle.appendChild(couponToggleChevron);
        couponToggle.setAttribute("aria-expanded", couponPanelOpen ? "true" : "false");
        addExtraClasses(couponToggle, "couponToggle");
        var couponPanel = document.createElement("div");
        couponPanel.className = "wcsc-coupon__panel";
        couponPanel.id = "wcsc-coupon-panel";
        couponPanel.hidden = !couponPanelOpen;
        addExtraClasses(couponPanel, "couponForm");
        couponToggle.setAttribute("aria-controls", couponPanel.id);
        var couponRow = document.createElement("div");
        couponRow.className = "wcsc-coupon__row";
        var couponInput = document.createElement("input");
        couponInput.type = "text";
        couponInput.autocomplete = "off";
        couponInput.placeholder = wcSideCart.i18n && wcSideCart.i18n.couponPlaceholder ? wcSideCart.i18n.couponPlaceholder : "";
        couponInput.className = "input-text";
        addExtraClasses(couponInput, "couponInput");
        var couponApply = document.createElement("button");
        couponApply.type = "button";
        couponApply.className = "button";
        couponApply.textContent = wcSideCart.i18n && wcSideCart.i18n.couponApply ? wcSideCart.i18n.couponApply : "";
        addExtraClasses(couponApply, "couponApplyButton");
        var couponMessage = document.createElement("div");
        couponMessage.className = "wcsc-coupon__message";
        couponMessage.setAttribute("role", "status");
        couponMessage.setAttribute("aria-live", "polite");
        couponRow.appendChild(couponInput);
        couponRow.appendChild(couponApply);
        couponPanel.appendChild(couponRow);
        couponPanel.appendChild(couponMessage);
        var appliedCoupons = cart && cart.coupons && Array.isArray(cart.coupons) ? cart.coupons : [];
        if (appliedCoupons.length) {
          var couponList = document.createElement("div");
          couponList.className = "wcsc-coupon__list";
          addExtraClasses(couponList, "couponList");
          appliedCoupons.forEach(function(coupon) {
            if (!coupon || !coupon.code) {
              return;
            }
            var code = String(coupon.code);
            var tag = document.createElement("div");
            tag.className = "wcsc-coupon__tag";
            tag.textContent = code;
            var removeButton = document.createElement("button");
            removeButton.type = "button";
            removeButton.className = "wcsc-coupon__remove";
            removeButton.textContent = "\xD7";
            removeButton.setAttribute("aria-label", wcSideCart.i18n && wcSideCart.i18n.couponRemove ? wcSideCart.i18n.couponRemove : "");
            addExtraClasses(removeButton, "couponRemoveButton");
            removeButton.addEventListener("click", function() {
              couponPanelOpen = true;
              couponToggle.setAttribute("aria-expanded", "true");
              couponPanel.hidden = false;
              couponMessage.textContent = "";
              setBusy(couponBox, true);
              removeButton.disabled = true;
              storeApi.removeCoupon(code).then(function(updatedCart) {
                if (updatedCart) {
                  document.body.dispatchEvent(new CustomEvent("side_cart_coupon_removed", { detail: { code: code, cart: updatedCart } }));
                  showToast(wcSideCart.i18n && wcSideCart.i18n.couponRemoved ? wcSideCart.i18n.couponRemoved : "", "success");
                  couponPanelOpen = false;
                  couponToggle.setAttribute("aria-expanded", "false");
                  couponPanel.hidden = true;
                  couponMessage.textContent = "";
                  couponInput.value = "";
                  renderCart(updatedCart);
                  return;
                }
                return storeApi.refreshCart().then(function(refreshed) {
                  document.body.dispatchEvent(new CustomEvent("side_cart_coupon_removed", { detail: { code: code, cart: refreshed } }));
                  showToast(wcSideCart.i18n && wcSideCart.i18n.couponRemoved ? wcSideCart.i18n.couponRemoved : "", "success");
                  couponPanelOpen = false;
                  couponToggle.setAttribute("aria-expanded", "false");
                  couponPanel.hidden = true;
                  couponMessage.textContent = "";
                  couponInput.value = "";
                  renderCart(refreshed);
                });
              }).catch(function(err) {
                if (err && (err.status === 404 || err.status === 403)) {
                  couponUiAvailable = false;
                }
                var removeMsg = err && err.message ? String(err.message) : wcSideCart.i18n && wcSideCart.i18n.couponError ? wcSideCart.i18n.couponError : "";
                couponMessage.textContent = removeMsg;
                showToast(removeMsg, "error");
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
        couponToggle.addEventListener("click", function() {
          couponPanelOpen = !couponPanelOpen;
          couponToggle.setAttribute("aria-expanded", couponPanelOpen ? "true" : "false");
          couponPanel.hidden = !couponPanelOpen;
        });
        couponApply.addEventListener("click", handleCouponApply);
        couponInput.addEventListener("keydown", function(e) {
          if (e.key === "Enter") {
            e.preventDefault();
            handleCouponApply();
          }
        });
        couponBox.appendChild(couponToggle);
        couponBox.appendChild(couponPanel);
        cartTotals.insertBefore(couponBox, list);
      }
      if (showCheckoutButton) {
        var proceed = document.createElement("div");
        proceed.className = "wc-proceed-to-checkout";
        var checkoutLink = document.createElement("a");
        checkoutLink.className = "checkout-button button alt wc-forward";
        checkoutLink.href = wcSideCart.urls && wcSideCart.urls.checkout ? wcSideCart.urls.checkout : "#";
        checkoutLink.textContent = wcSideCart.i18n && wcSideCart.i18n.checkout ? wcSideCart.i18n.checkout : "";
        proceed.appendChild(checkoutLink);
        cartTotals.appendChild(proceed);
      }
      dom.totals.appendChild(cartTotals);
      if (showViewCartButton) {
        var cartLink = document.createElement("a");
        cartLink.className = "button wc-forward";
        cartLink.href = wcSideCart.urls && wcSideCart.urls.cart ? wcSideCart.urls.cart : "#";
        cartLink.textContent = wcSideCart.i18n && wcSideCart.i18n.viewCart ? wcSideCart.i18n.viewCart : "";
        dom.totals.appendChild(cartLink);
      }
      appendHook(dom.totals, hookTemplates.afterActions, "wcsc-hook--after-actions");
    }
    function renderItems(dom, cart) {
      clearNode(dom.items);
      var items = cart && cart.items ? cart.items : [];
      if (!items.length) {
        renderEmpty(dom);
        return;
      }
      dom.footer.style.display = "";
      var fragment = document.createDocumentFragment();
      appendHook(fragment, hookTemplates.aboveItems, "wcsc-hook--above-items");
      items.forEach(function(item, index) {
        if (!item || !item.key) {
          return;
        }
        var wrapper = document.createElement("div");
        var wrapperClasses = ["item", "side-cart__item"];
        var isOdd = index % 2 === 0;
        var extraItemClasses = getExtraClasses("item");
        if (extraItemClasses) {
          wrapperClasses.push(extraItemClasses);
        }
        var extraParityClasses = getExtraClasses(isOdd ? "itemOdd" : "itemEven");
        if (extraParityClasses) {
          wrapperClasses.push(extraParityClasses);
        }
        wrapper.className = wrapperClasses.join(" ").trim().replace(/\s+/g, " ");
        wrapper.setAttribute("data-cart_item_key", item.key);
        var row = document.createElement("div");
        row.className = "wcsc-row";
        var thumb = document.createElement("div");
        thumb.className = "wcsc-thumb" + (showItemThumbnail ? "" : " wcsc-thumb--placeholder");
        if (!showItemThumbnail) {
          thumb.setAttribute("aria-hidden", "true");
        } else if (item.images && item.images.length && item.images[0] && (item.images[0].thumbnail || item.images[0].src)) {
          var img = document.createElement("img");
          img.loading = "lazy";
          img.decoding = "async";
          img.src = item.images[0].thumbnail || item.images[0].src;
          img.alt = item.name || "";
          thumb.appendChild(img);
        }
        row.appendChild(thumb);
        var main = document.createElement("div");
        var title = document.createElement("h5");
        title.className = "side-cart__item_name";
        if (showItemLinks && item.permalink) {
          var nameLink = document.createElement("a");
          nameLink.href = item.permalink;
          nameLink.textContent = item.name || "";
          title.appendChild(nameLink);
        } else {
          title.appendChild(document.createTextNode(item.name || ""));
        }
        main.appendChild(title);
        var quantity = parseInt(item.quantity, 10) || 0;
        var hasUnitLine = false;
        if (showItemQuantity && quantity > 0 && item.prices && typeof item.prices.price !== "undefined" && item.prices.price !== null) {
          var unitLine = document.createElement("div");
          unitLine.className = "wcsc-unit";
          var qtyNode = document.createElement("span");
          qtyNode.className = "wcsc-unit__qty";
          qtyNode.textContent = String(quantity);
          unitLine.appendChild(qtyNode);
          var timesNode = document.createElement("span");
          timesNode.className = "wcsc-unit__times";
          timesNode.textContent = "\xD7";
          unitLine.appendChild(timesNode);
          var unitPriceWrap = document.createElement("span");
          unitPriceWrap.className = "wcsc-unit__price";
          unitPriceWrap.appendChild(createPriceSpan(String(item.prices.price), item.prices));
          unitLine.appendChild(unitPriceWrap);
          var regularUnit = typeof item.prices.regular_price !== "undefined" && item.prices.regular_price !== null ? String(item.prices.regular_price) : "";
          var currentUnit = String(item.prices.price);
          if (regularUnit && regularUnit !== currentUnit && parseInt(regularUnit, 10) > parseInt(currentUnit, 10)) {
            var regularInt = parseInt(regularUnit, 10);
            var currentInt = parseInt(currentUnit, 10);
            if (regularInt > 0 && currentInt >= 0) {
              var discountPercent = Math.round((1 - currentInt / regularInt) * 100);
              if (discountPercent > 0) {
                var savingNode = document.createElement("span");
                savingNode.className = "wcsc-unit__saving";
                savingNode.textContent = "-" + String(discountPercent) + "%";
                unitLine.appendChild(savingNode);
              }
            }
          }
          main.appendChild(unitLine);
          hasUnitLine = true;
        }
        if (item.variation && item.variation.length) {
          var meta = document.createElement("div");
          meta.className = "wcsc-meta";
          meta.textContent = item.variation.map(function(variation) {
            if (!variation || !variation.attribute) {
              return "";
            }
            return String(variation.attribute) + ": " + (variation.value || "");
          }).filter(Boolean).join(" \xB7 ");
          main.appendChild(meta);
        }
        row.appendChild(main);
        var actions = document.createElement("div");
        actions.className = "wcsc-actions";
        var hasActions = false;
        if (showItemRemove) {
          var removeLink = document.createElement("a");
          removeLink.className = "side-cart__remove_item js-remove-basket-item";
          removeLink.setAttribute("data-cart_item_key", item.key);
          removeLink.textContent = wcSideCart.i18n && wcSideCart.i18n.remove ? wcSideCart.i18n.remove : "";
          var fallbackRemoveUrl = wcSideCart.urls && wcSideCart.urls.cart ? wcSideCart.urls.cart : "#";
          var removeUrl = addQueryArgs(fallbackRemoveUrl, {
            remove_item: item.key,
            _wpnonce: wcSideCart.nonces ? wcSideCart.nonces.cart : ""
          });
          removeLink.href = removeUrl;
          actions.appendChild(removeLink);
          hasActions = true;
        }
        if (showItemPrice) {
          var price = document.createElement("div");
          price.className = "wcsc-price";
          var strong = document.createElement("strong");
          if (item.totals && typeof item.totals.line_total !== "undefined") {
            var includeTax = taxDisplayCart === "incl" ? true : shouldDisplayItemPricesIncludingTax(item);
            var hasSubtotal = typeof item.totals.line_subtotal !== "undefined" && item.totals.line_subtotal !== null;
            var lineSubtotal = hasSubtotal ? String(item.totals.line_subtotal) : "";
            var lineTotal = String(item.totals.line_total);
            if (includeTax) {
              if (hasSubtotal && typeof item.totals.line_subtotal_tax !== "undefined" && item.totals.line_subtotal_tax !== null) {
                lineSubtotal = sumMinorAmounts(lineSubtotal, item.totals.line_subtotal_tax);
              }
              if (typeof item.totals.line_total_tax !== "undefined" && item.totals.line_total_tax !== null) {
                lineTotal = sumMinorAmounts(lineTotal, item.totals.line_total_tax);
              }
            }
            if (hasSubtotal && lineSubtotal !== lineTotal && parseInt(lineSubtotal, 10) > parseInt(lineTotal, 10)) {
              var del = document.createElement("del");
              del.appendChild(createPriceSpan(lineSubtotal, item.totals));
              var ins = document.createElement("ins");
              ins.appendChild(createPriceSpan(lineTotal, item.totals));
              strong.appendChild(del);
              strong.appendChild(document.createTextNode(" "));
              strong.appendChild(ins);
            } else {
              strong.appendChild(createPriceSpan(lineTotal, item.totals));
            }
          } else if (item.prices && typeof item.prices.price !== "undefined") {
            var regular = item.prices && typeof item.prices.regular_price !== "undefined" ? String(item.prices.regular_price) : "";
            var current = String(item.prices.price);
            if (regular && regular !== current && parseInt(regular, 10) > parseInt(current, 10)) {
              var delPrice = document.createElement("del");
              delPrice.appendChild(createPriceSpan(regular, item.prices));
              var insPrice = document.createElement("ins");
              insPrice.appendChild(createPriceSpan(current, item.prices));
              strong.appendChild(delPrice);
              strong.appendChild(document.createTextNode(" "));
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
        var bottom = document.createElement("div");
        bottom.className = "wcsc-bottom";
        var hasBottom = false;
        if (enableQuantityEditing) {
          var stepper = document.createElement("div");
          stepper.className = "wcsc-stepper";
          var dec = document.createElement("button");
          dec.type = "button";
          dec.className = "js-side-cart-stepper-dec";
          dec.textContent = "\u2212";
          var input = document.createElement("input");
          input.type = "number";
          input.className = "input-text qty text js-side-cart-change-qty";
          input.min = "0";
          input.step = "1";
          input.value = String(item.quantity || 0);
          input.setAttribute("data-cart_item_key", item.key);
          input.title = wcSideCart.i18n && wcSideCart.i18n.qty ? wcSideCart.i18n.qty : "";
          var inc = document.createElement("button");
          inc.type = "button";
          inc.className = "js-side-cart-stepper-inc";
          inc.textContent = "+";
          stepper.appendChild(dec);
          stepper.appendChild(input);
          stepper.appendChild(inc);
          bottom.appendChild(stepper);
          hasBottom = true;
        } else if (showItemQuantity && !hasUnitLine) {
          var qtyText = document.createElement("div");
          qtyText.className = "wcsc-qty";
          qtyText.textContent = String(quantity);
          qtyText.title = wcSideCart.i18n && wcSideCart.i18n.qty ? wcSideCart.i18n.qty : "";
          bottom.appendChild(qtyText);
          hasBottom = true;
        }
        if (hasBottom) {
          wrapper.appendChild(bottom);
        }
        fragment.appendChild(wrapper);
        if (item === items[0]) {
          appendHook(fragment, hookTemplates.afterFirstItem, "wcsc-hook--after-first-item");
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
      if (!name || typeof name !== "string" || typeof renderer !== "function") {
        return;
      }
      var key = name.trim();
      if (!key || !renderers[key]) {
        return;
      }
      renderers[key] = renderer;
    }
    function registerRenderers(map) {
      if (!map || typeof map !== "object") {
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
        emit("side_cart_before_render", { cart: cart });
        renderLoading(dom);
        emit("side_cart_after_render", { cart: cart });
        return;
      }
      if (cartState) {
        cartState.updateCountFromCart(cart || {});
      }
      var api = {
        emit: emit,
        selectors: { get: getSelector },
        refreshCart: storeApi ? storeApi.refreshCart : function() {
          return Promise.reject(new Error("Missing Store API client"));
        },
        updateItemQuantity: storeApi ? storeApi.updateItemQuantity : function() {
          return Promise.reject(new Error("Missing Store API client"));
        },
        removeItem: storeApi ? storeApi.removeItem : function() {
          return Promise.reject(new Error("Missing Store API client"));
        },
        applyCoupon: storeApi ? storeApi.applyCoupon : function() {
          return Promise.reject(new Error("Missing Store API client"));
        },
        removeCoupon: storeApi ? storeApi.removeCoupon : function() {
          return Promise.reject(new Error("Missing Store API client"));
        },
        createPriceSpan: createPriceSpan,
        addQueryArgs: addQueryArgs,
        appendHook: appendHook,
        hookTemplates: hookTemplates,
        getExtraClasses: getExtraClasses,
        addExtraClasses: addExtraClasses
      };
      emit("side_cart_before_render", { cart: cart });
      if (!cart || !cart.items || !cart.items.length) {
        renderers.empty(dom, cart, api);
        emit("side_cart_refreshed", { cart: cart });
        emit("side_cart_after_render", { cart: cart });
        return;
      }
      renderers.items(dom, cart, api);
      renderers.totals(dom, cart, api);
      emit("side_cart_refreshed", { cart: cart });
      emit("side_cart_cart_updated", { cart: cart });
      emit("side_cart_after_render", { cart: cart });
    }
    return {
      renderCart: renderCart,
      renderers: renderers,
      registerRenderer: registerRenderer,
      registerRenderers: registerRenderers,
      resetRenderers: resetRenderers
    };
  }

  // src/js/a11y/a11yController.js
  function createA11yController(options) {
    var getSelector = options && options.getSelector ? options.getSelector : function() {
      return "";
    };
    var emit = options && options.emit ? options.emit : function() {
    };
    var mode = options && options.mode ? options.mode : "ui";
    var openTriggerElementId = options && options.openTriggerElementId ? options.openTriggerElementId : "";
    var onRenderCart = options && typeof options.onRenderCart === "function" ? options.onRenderCart : function() {
    };
    var onRefreshCart = options && typeof options.onRefreshCart === "function" ? options.onRefreshCart : function() {
      return Promise.reject(new Error("Missing refreshCart callback"));
    };
    var onRecoverFromStoreApiFailure = options && typeof options.onRecoverFromStoreApiFailure === "function" ? options.onRecoverFromStoreApiFailure : function() {
      return Promise.resolve(null);
    };
    var refreshThrottleMs = options && typeof options.refreshThrottleMs === "number" ? options.refreshThrottleMs : 2e3;
    var lastCartRefreshAt = 0;
    var previousBodyPaddingRight = "";
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
      if (el.getAttribute && el.getAttribute("aria-hidden") === "true") {
        return false;
      }
      if (el.tabIndex < 0) {
        return false;
      }
      if (el.matches && el.matches("a") && !el.getAttribute("href")) {
        return false;
      }
      if (el.getClientRects && el.getClientRects().length === 0 && el !== document.activeElement) {
        return false;
      }
      return typeof el.focus === "function";
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
      return qs(getSelector("panel"));
    }
    function getBackdrop() {
      return qs(getSelector("backdrop"));
    }
    function lockScroll() {
      if (document.body.classList.contains("wc-side-cart-scroll-lock")) {
        return;
      }
      previousBodyPaddingRight = document.body.style.paddingRight || "";
      var scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = scrollbarWidth + "px";
      }
      document.body.classList.add("wc-side-cart-scroll-lock");
    }
    function unlockScroll() {
      document.body.classList.remove("wc-side-cart-scroll-lock");
      document.body.style.paddingRight = previousBodyPaddingRight;
    }
    function setPanelAria(isOpen) {
      var panel = getPanel();
      if (!panel) {
        return;
      }
      panel.setAttribute("aria-hidden", isOpen ? "false" : "true");
      if (!panel.hasAttribute("tabindex")) {
        panel.setAttribute("tabindex", "-1");
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
        supportsInert = "inert" in panel;
      } catch (e) {
      }
      Array.prototype.forEach.call(document.body.children, function(node) {
        if (!node || node === panel || node === backdrop) {
          return;
        }
        var record = {
          node: node,
          ariaHidden: node.getAttribute ? node.getAttribute("aria-hidden") : null,
          hadInert: supportsInert ? !!node.inert : false
        };
        isolatedBackgroundNodes.push(record);
        if (supportsInert) {
          node.inert = true;
          return;
        }
        if (node.setAttribute) {
          node.setAttribute("aria-hidden", "true");
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
        supportsInert = "inert" in panel;
      } catch (e) {
      }
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
        if (record.ariaHidden === null || typeof record.ariaHidden === "undefined") {
          record.node.removeAttribute("aria-hidden");
          return;
        }
        record.node.setAttribute("aria-hidden", record.ariaHidden);
      });
      isolatedBackgroundNodes = [];
    }
    function focusInitialElement() {
      var panel = getPanel();
      if (!panel) {
        return;
      }
      var closeButton = qs(".side-cart__close", panel) || qs(".js-side-cart-close", panel);
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
      if (e.key === "Escape" || e.key === "Esc") {
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== "Tab") {
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
      document.addEventListener("keydown", handleFocusTrapKeydown, true);
      document.addEventListener("focusin", handleFocusTrapFocusIn, true);
    }
    function disableFocusTrap() {
      if (!focusTrapEnabled) {
        return;
      }
      focusTrapEnabled = false;
      document.removeEventListener("keydown", handleFocusTrapKeydown, true);
      document.removeEventListener("focusin", handleFocusTrapFocusIn, true);
    }
    function activateModalA11y() {
      if (document.body.classList.contains("wc-side-cart-is-open")) {
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
      if (lastOpenTrigger && elementInDocument(lastOpenTrigger) && typeof lastOpenTrigger.focus === "function") {
        try {
          lastOpenTrigger.focus();
          restored = true;
        } catch (e) {
        }
      }
      if (!restored && openTriggerElementId) {
        var trigger = document.getElementById(openTriggerElementId);
        if (trigger && elementInDocument(trigger) && typeof trigger.focus === "function") {
          try {
            trigger.focus();
            restored = true;
          } catch (e) {
          }
        }
      }
      if (!restored) {
        var icon = qs(getSelector("floatingIcon"));
        if (icon && elementInDocument(icon) && typeof icon.focus === "function") {
          try {
            icon.focus();
          } catch (e) {
          }
        }
      }
      lastOpenTrigger = null;
    }
    function open() {
      if (mode === "headless") {
        emit("side_cart_open");
        return;
      }
      var icon = qs(getSelector("floatingIcon"));
      if (icon) {
        icon.setAttribute("aria-expanded", "true");
      }
      if (openTriggerElementId) {
        var trigger = document.getElementById(openTriggerElementId);
        if (trigger) {
          trigger.setAttribute("aria-expanded", "true");
        }
      }
      activateModalA11y();
      document.body.classList.add("wc-side-cart-is-open");
      lockScroll();
      var sideCart = getPanel();
      if (sideCart) {
        sideCart.classList.add("js-side-cart-opened");
      }
      icon = qs(getSelector("floatingIcon"));
      if (icon) {
        icon.classList.add("js-side-cart-close");
      }
      var backdrop = getBackdrop();
      if (backdrop) {
        backdrop.setAttribute("aria-hidden", "true");
      }
      document.body.dispatchEvent(new CustomEvent("side_cart_open"));
      focusInitialElement();
      var now = Date.now();
      if (lastCartRefreshAt && now - lastCartRefreshAt < refreshThrottleMs) {
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
      if (mode === "headless") {
        emit("side_cart_open");
        return;
      }
      if (document.body.classList.contains("wc-side-cart-is-open")) {
        onRenderCart(cart);
        return;
      }
      var icon = qs(getSelector("floatingIcon"));
      if (icon) {
        icon.setAttribute("aria-expanded", "true");
      }
      if (openTriggerElementId) {
        var trigger = document.getElementById(openTriggerElementId);
        if (trigger) {
          trigger.setAttribute("aria-expanded", "true");
        }
      }
      activateModalA11y();
      document.body.classList.add("wc-side-cart-is-open");
      lockScroll();
      var sideCart = getPanel();
      if (sideCart) {
        sideCart.classList.add("js-side-cart-opened");
      }
      icon = qs(getSelector("floatingIcon"));
      if (icon) {
        icon.classList.add("js-side-cart-close");
      }
      var backdrop = getBackdrop();
      if (backdrop) {
        backdrop.setAttribute("aria-hidden", "true");
      }
      document.body.dispatchEvent(new CustomEvent("side_cart_open"));
      focusInitialElement();
      onRenderCart(cart);
    }
    function close() {
      if (mode === "headless") {
        emit("side_cart_close");
        return;
      }
      document.body.classList.remove("wc-side-cart-is-open");
      unlockScroll();
      var icon = qs(getSelector("floatingIcon"));
      if (icon) {
        icon.setAttribute("aria-expanded", "false");
      }
      if (openTriggerElementId) {
        var trigger = document.getElementById(openTriggerElementId);
        if (trigger) {
          trigger.setAttribute("aria-expanded", "false");
        }
      }
      var sideCart = getPanel();
      if (sideCart) {
        sideCart.classList.remove("js-side-cart-opened");
      }
      icon = qs(getSelector("floatingIcon"));
      if (icon) {
        icon.classList.remove("js-side-cart-close");
      }
      var backdrop = getBackdrop();
      if (backdrop) {
        backdrop.setAttribute("aria-hidden", "true");
      }
      document.body.dispatchEvent(new CustomEvent("side_cart_close"));
      deactivateModalA11y();
    }
    return {
      open: open,
      openWithCart: openWithCart,
      close: close
    };
  }

  // src/js/a11y/announcer.js
  function ensureLiveRegion(options) {
    var id = options && options.id ? String(options.id) : "";
    var role = options && options.role ? String(options.role) : "status";
    var ariaLive = options && options.ariaLive ? String(options.ariaLive) : "polite";
    var parent = options && options.parent ? options.parent : document.body;
    if (!id || !parent) {
      return null;
    }
    var existing = document.getElementById(id);
    if (existing) {
      return existing;
    }
    var el = document.createElement("div");
    el.id = id;
    el.className = "wcsc-sr-only";
    el.setAttribute("role", role);
    el.setAttribute("aria-live", ariaLive);
    el.setAttribute("aria-atomic", "true");
    parent.appendChild(el);
    return el;
  }
  function createA11yAnnouncer(options) {
    var wcSideCart = options && options.wcSideCart ? options.wcSideCart : null;
    var politeRegionId = options && options.politeRegionId ? options.politeRegionId : "wcsc-live-region";
    var assertiveRegionId = options && options.assertiveRegionId ? options.assertiveRegionId : "wcsc-alert-region";
    var politeRegion = null;
    var assertiveRegion = null;
    var ignoreNextCartUpdate = false;
    function getI18n(key) {
      if (!wcSideCart || !wcSideCart.i18n) {
        return "";
      }
      return wcSideCart.i18n[key] ? String(wcSideCart.i18n[key]) : "";
    }
    function ensureRegions() {
      if (!politeRegion) {
        politeRegion = ensureLiveRegion({ id: politeRegionId, role: "status", ariaLive: "polite" });
      }
      if (!assertiveRegion) {
        assertiveRegion = ensureLiveRegion({ id: assertiveRegionId, role: "alert", ariaLive: "assertive" });
      }
    }
    function announce(message, channel) {
      var text = message ? String(message) : "";
      if (!text) {
        return;
      }
      ensureRegions();
      var region = channel === "assertive" ? assertiveRegion : politeRegion;
      if (!region) {
        return;
      }
      region.textContent = "";
      window.setTimeout(function() {
        region.textContent = text;
      }, 20);
    }
    function handleOpen() {
      ignoreNextCartUpdate = true;
      announce(getI18n("cartOpened"), "polite");
      window.setTimeout(function() {
        ignoreNextCartUpdate = false;
      }, 800);
    }
    function handleClose() {
      announce(getI18n("cartClosed"), "polite");
    }
    function handleCartUpdated() {
      if (ignoreNextCartUpdate) {
        ignoreNextCartUpdate = false;
        return;
      }
      announce(getI18n("cartUpdated"), "polite");
    }
    function handleCartRefreshed(e) {
      if (ignoreNextCartUpdate) {
        ignoreNextCartUpdate = false;
        return;
      }
      var cart = e && e.detail ? e.detail.cart : null;
      if (cart && (!cart.items || !cart.items.length)) {
        announce(getI18n("emptyCart"), "polite");
      }
    }
    function handleError() {
      announce(getI18n("cartError"), "assertive");
    }
    function bind() {
      if (!document.body || !document.body.addEventListener) {
        return;
      }
      ensureRegions();
      document.body.addEventListener("side_cart_open", handleOpen);
      document.body.addEventListener("side_cart_close", handleClose);
      document.body.addEventListener("side_cart_cart_updated", handleCartUpdated);
      document.body.addEventListener("side_cart_refreshed", handleCartRefreshed);
      document.body.addEventListener("side_cart_error", handleError);
    }
    return {
      bind: bind,
      announce: announce
    };
  }

  // src/js/ui/listeners.js
  function setupUiListeners(options) {
    var wcSideCart = options && options.wcSideCart ? options.wcSideCart : null;
    var getSelector = options && options.getSelector ? options.getSelector : function() {
      return "";
    };
    var emit = options && options.emit ? options.emit : function() {
    };
    var onCartClickBehaviour = options && typeof options.onCartClickBehaviour === "string" ? options.onCartClickBehaviour.trim().toLowerCase() : "open_drawer";
    if (["open_drawer", "navigate_to_checkout", "navigate_to_cart", "navigate_to_url"].indexOf(onCartClickBehaviour) === -1) {
      onCartClickBehaviour = "open_drawer";
    }
    var autoOpenOnAddToCart = !!(options && options.autoOpenOnAddToCart);
    var openTriggerElementId = options && options.openTriggerElementId ? options.openTriggerElementId : "";
    var storeApi = options && options.storeApi ? options.storeApi : null;
    var cartState = options && options.cartState ? options.cartState : null;
    var renderCart = options && typeof options.renderCart === "function" ? options.renderCart : function() {
    };
    var openSideCart = options && typeof options.openSideCart === "function" ? options.openSideCart : function() {
    };
    var openSideCartWithCart = options && typeof options.openSideCartWithCart === "function" ? options.openSideCartWithCart : function() {
    };
    var closeSideCart = options && typeof options.closeSideCart === "function" ? options.closeSideCart : function() {
    };
    if (!storeApi) {
      return;
    }
    function getViewCartLabel() {
      if (!wcSideCart || !wcSideCart.i18n) {
        return "";
      }
      return wcSideCart.i18n.viewCart ? String(wcSideCart.i18n.viewCart) : "";
    }
    function normalizePath(url) {
      if (!url) {
        return "";
      }
      var a = document.createElement("a");
      a.href = url;
      var path = a.pathname ? String(a.pathname) : "";
      path = path.replace(/\/+$/, "");
      return path;
    }
    function getTriggerHref(el) {
      if (!el || !el.getAttribute) {
        return "";
      }
      var href = el.getAttribute("href");
      return href ? String(href) : "";
    }
    function resolveNavigateUrl(behaviour, triggerEl) {
      var urls = wcSideCart && wcSideCart.urls ? wcSideCart.urls : {};
      var triggerHref = getTriggerHref(triggerEl);
      var dataUrl = triggerEl && triggerEl.getAttribute ? triggerEl.getAttribute("data-wcsc-url") : "";
      dataUrl = dataUrl ? String(dataUrl) : "";
      if (behaviour === "navigate_to_checkout") {
        return urls && urls.checkout ? String(urls.checkout) : triggerHref || "";
      }
      if (behaviour === "navigate_to_cart") {
        return urls && urls.cart ? String(urls.cart) : triggerHref || "";
      }
      if (behaviour === "navigate_to_url") {
        return dataUrl || triggerHref || "";
      }
      return "";
    }
    function handleTriggerClick(e, triggerEl) {
      var isOpen = document.body.classList.contains("wc-side-cart-is-open");
      if (isOpen) {
        e.preventDefault();
        e.stopPropagation();
        closeSideCart();
        return;
      }
      if (onCartClickBehaviour === "open_drawer") {
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
    function refreshFromExternalCartChange(options2) {
      var shouldAutoOpen = !!(options2 && options2.shouldAutoOpen);
      return storeApi.refreshCart().then(function(cart) {
        if (cartState) {
          cartState.updateCountFromCart(cart);
        }
        var counter = document.querySelector(".js-side-cart-number");
        if (counter) {
          counter.classList.add("side-cart__number--jump");
          window.setTimeout(function() {
            counter.classList.remove("side-cart__number--jump");
          }, 2e3);
        }
        if (shouldAutoOpen && !document.body.classList.contains("wc-side-cart-is-open")) {
          openSideCartWithCart(cart);
          return;
        }
        if (document.body.classList.contains("wc-side-cart-is-open")) {
          renderCart(cart);
        }
      }).catch(function() {
      });
    }
    function recoverFromStoreApiFailure(options2) {
      return storeApi.recoverFromStoreApiFailure(options2, renderCart);
    }
    function performQuantityUpdate(inputEl, cartItemKey, quantity) {
      var item = inputEl ? inputEl.closest(getSelector("item")) : null;
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
    var qtyTimers = /* @__PURE__ */ new Map();
    var qtySel = getSelector("qtyInput");
    var toggleSel = getSelector("toggle");
    var stepperSel = [getSelector("stepperDec"), getSelector("stepperInc")].filter(Boolean).join(", ");
    var removeSel = getSelector("remove");
    var backdropSel = getSelector("backdrop");
    var panelEl = qs(getSelector("panel"));
    function handleQtyInput(e) {
      var target = e.target;
      if (!qtySel || !target || !target.matches(qtySel)) {
        return;
      }
      var cartItemKey = target.getAttribute("data-cart_item_key");
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
    (panelEl || document).addEventListener("input", handleQtyInput);
    function handlePanelClick(e) {
      var toggle = toggleSel && e.target && e.target.closest ? e.target.closest(toggleSel) : null;
      if (toggle) {
        handleTriggerClick(e, toggle);
        return;
      }
      var stepperButton = stepperSel && e.target && e.target.closest ? e.target.closest(stepperSel) : null;
      if (stepperButton) {
        e.preventDefault();
        e.stopPropagation();
        var stepper = stepperButton.closest(".wcsc-stepper");
        var input = stepper && qtySel ? qs(qtySel, stepper) : null;
        var cartItemKey = input ? input.getAttribute("data-cart_item_key") : "";
        var currentQty = input ? parseInt(input.value, 10) : NaN;
        if (!input || !cartItemKey || isNaN(currentQty)) {
          return;
        }
        var nextQty = currentQty + (stepperButton.classList.contains("js-side-cart-stepper-inc") ? 1 : -1);
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
      var remove = removeSel && e.target && e.target.closest ? e.target.closest(removeSel) : null;
      if (remove) {
        e.preventDefault();
        e.stopPropagation();
        var cartItemKey = remove.getAttribute("data-cart_item_key");
        var fallbackUrl = remove.getAttribute("href") || (wcSideCart && wcSideCart.urls && wcSideCart.urls.cart ? wcSideCart.urls.cart : "/");
        if (!cartItemKey) {
          window.location = fallbackUrl;
          return;
        }
        var item = remove.closest(getSelector("item"));
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
      panelEl.addEventListener("click", handlePanelClick);
    }
    document.addEventListener("click", function(e) {
      if (panelEl && e.target && panelEl.contains(e.target)) {
        return;
      }
      var backdrop = backdropSel && e.target && e.target.closest ? e.target.closest(backdropSel) : null;
      if (backdrop) {
        e.preventDefault();
        closeSideCart();
        return;
      }
      if (openTriggerElementId) {
        var trigger = document.getElementById(openTriggerElementId);
        if (trigger && (e.target === trigger || trigger.contains && trigger.contains(e.target))) {
          handleTriggerClick(e, trigger);
          return;
        }
      }
      var toggle = toggleSel && e.target && e.target.closest ? e.target.closest(toggleSel) : null;
      if (toggle) {
        handleTriggerClick(e, toggle);
        return;
      }
    });
    if (typeof window !== "undefined" && window.jQuery && typeof window.jQuery === "function") {
      var $body = window.jQuery(document.body);
      if ($body && $body.on) {
        $body.on("added_to_cart", function(event, fragments, cartHash, $button) {
          var buttonEl = $button && $button[0] ? $button[0] : null;
          var shouldAutoOpen = autoOpenOnAddToCart && !!(buttonEl && buttonEl.matches && buttonEl.matches("a.add_to_cart_button.ajax_add_to_cart"));
          refreshFromExternalCartChange({ shouldAutoOpen: shouldAutoOpen });
        });
      }
    }
    if (autoOpenOnAddToCart) {
      document.body.addEventListener("wc-blocks_added_to_cart", function() {
        refreshFromExternalCartChange({ shouldAutoOpen: true });
      });
    }
    document.body.addEventListener("wc-blocks_removed_from_cart", function() {
      refreshFromExternalCartChange({ shouldAutoOpen: false });
    });
    document.addEventListener("keydown", function(e) {
      if (e.key !== "Escape") {
        return;
      }
      if (!document.body.classList.contains("wc-side-cart-is-open")) {
        return;
      }
      e.preventDefault();
      closeSideCart();
    });
  }

  // src/js/index.js
  onReady(function() {
    var wcSideCart = window.wcSideCart || null;
    if (!wcSideCart || !wcSideCart.endpoints || !window.fetch) {
      return;
    }
    document.body.classList.remove("js-side-cart-opened");
    var settings = wcSideCart.settings || {};
    var uiSettings = settings.ui || {};
    var paritySettings = settings.parity || {};
    var mode = typeof settings.mode === "string" ? settings.mode.trim().toLowerCase() : "ui";
    if (mode !== "ui" && mode !== "headless") {
      mode = "ui";
    }
    var domSettings = settings.dom || {};
    var domSelectors = domSettings && domSettings.selectors && typeof domSettings.selectors === "object" ? domSettings.selectors : {};
    var defaultSelectors = {
      panel: ".side-cart",
      backdrop: ".js-side-cart-backdrop",
      container: ".js-side-cart-container",
      header: ".side-cart__iconic",
      form: ".js-side-cart-form",
      items: ".js-side-cart-items",
      footer: ".side-cart__footer",
      totals: ".side-cart__totals",
      item: ".item",
      floatingIcon: ".js-side-cart-icon",
      emptyTemplate: ".js-side-cart-empty-template",
      toggle: ".js-side-cart-close, .js-side-cart-open",
      remove: ".js-remove-basket-item",
      qtyInput: ".js-side-cart-change-qty",
      stepperDec: ".js-side-cart-stepper-dec",
      stepperInc: ".js-side-cart-stepper-inc"
    };
    function getSelector(key) {
      var value = domSelectors && typeof domSelectors[key] === "string" ? domSelectors[key].trim() : "";
      return value || defaultSelectors[key] || "";
    }
    function emit(name, detail) {
      document.body.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    }
    var badgeElementId = typeof uiSettings.badgeElementId === "string" ? uiSettings.badgeElementId.trim() : "";
    var openTriggerElementId = typeof uiSettings.openTriggerElementId === "string" ? uiSettings.openTriggerElementId.trim() : "";
    var autoOpenOnAddToCart = typeof uiSettings.autoOpenOnAddToCart === "boolean" ? uiSettings.autoOpenOnAddToCart : false;
    var disableUiListeners = typeof uiSettings.disableUiListeners === "boolean" ? uiSettings.disableUiListeners : false;
    var onCartClickBehaviour = typeof paritySettings.onCartClickBehaviour === "string" ? paritySettings.onCartClickBehaviour.trim().toLowerCase() : "open_drawer";
    if (["open_drawer", "navigate_to_checkout", "navigate_to_cart", "navigate_to_url"].indexOf(onCartClickBehaviour) === -1) {
      onCartClickBehaviour = "open_drawer";
    }
    var cartState = createCartState({
      wcSideCart: wcSideCart,
      badgeElementId: badgeElementId
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
      onRenderCart: renderer.renderCart,
      onRefreshCart: storeApi.refreshCart,
      onRecoverFromStoreApiFailure: function(options) {
        return storeApi.recoverFromStoreApiFailure(options, renderer.renderCart);
      }
    });
    if (mode !== "headless") {
      createA11yAnnouncer({ wcSideCart: wcSideCart }).bind();
      var isOpenOnBoot = document.body.classList.contains("wc-side-cart-is-open");
      var iconEl = document.querySelector(getSelector("floatingIcon"));
      if (iconEl) {
        iconEl.setAttribute("aria-expanded", isOpenOnBoot ? "true" : "false");
        if (isOpenOnBoot) {
          iconEl.classList.add("js-side-cart-close");
        } else {
          iconEl.classList.remove("js-side-cart-close");
        }
      }
      if (openTriggerElementId) {
        var triggerEl = document.getElementById(openTriggerElementId);
        if (triggerEl) {
          triggerEl.setAttribute("aria-expanded", isOpenOnBoot ? "true" : "false");
        }
      }
    }
    wcSideCart.renderers = renderer.renderers;
    wcSideCart.registerRenderer = renderer.registerRenderer;
    wcSideCart.registerRenderers = renderer.registerRenderers;
    wcSideCart.resetRenderers = renderer.resetRenderers;
    wcSideCart.sdk = {
      mode: mode,
      selectors: { get: getSelector },
      emit: emit,
      request: storeApi.request,
      refreshCart: function() {
        return storeApi.refreshCart().then(function(cart) {
          cartState.updateCountFromCart(cart || {});
          emit("side_cart_cart_fetched", { cart: cart });
          return cart;
        }).catch(function(err) {
          emit("side_cart_error", { error: err });
          throw err;
        });
      },
      updateItemQuantity: function(cartItemKey, quantity) {
        return storeApi.updateItemQuantity(cartItemKey, quantity).then(function(cart) {
          cartState.updateCountFromCart(cart || {});
          emit("side_cart_cart_updated", { cart: cart });
          return cart;
        }).catch(function(err) {
          emit("side_cart_error", { error: err });
          throw err;
        });
      },
      removeItem: function(cartItemKey) {
        return storeApi.removeItem(cartItemKey).then(function(cart) {
          cartState.updateCountFromCart(cart || {});
          emit("side_cart_cart_updated", { cart: cart });
          return cart;
        }).catch(function(err) {
          emit("side_cart_error", { error: err });
          throw err;
        });
      },
      applyCoupon: function(code) {
        return storeApi.applyCoupon(code).then(function(cart) {
          cartState.updateCountFromCart(cart || {});
          emit("side_cart_cart_updated", { cart: cart });
          return cart;
        }).catch(function(err) {
          emit("side_cart_error", { error: err });
          throw err;
        });
      },
      removeCoupon: function(code) {
        return storeApi.removeCoupon(code).then(function(cart) {
          cartState.updateCountFromCart(cart || {});
          emit("side_cart_cart_updated", { cart: cart });
          return cart;
        }).catch(function(err) {
          emit("side_cart_error", { error: err });
          throw err;
        });
      },
      render: function(cart) {
        if (mode === "headless") {
          emit("side_cart_refreshed", { cart: cart });
          return;
        }
        renderer.renderCart(cart);
      },
      open: function() {
        if (mode === "headless") {
          emit("side_cart_open");
          return;
        }
        a11y.open();
      },
      close: function() {
        if (mode === "headless") {
          emit("side_cart_close");
          return;
        }
        a11y.close();
      }
    };
    if (mode !== "headless" && !disableUiListeners) {
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
    if (document.body.classList.contains("wc-side-cart-is-open") && mode !== "headless") {
      storeApi.refreshCart().then(function(cart) {
        renderer.renderCart(cart);
      }).catch(function() {
      });
    }
  });
})();
