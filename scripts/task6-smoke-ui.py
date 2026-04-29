from pathlib import Path
from playwright.sync_api import sync_playwright


def main() -> None:
	base_url = "http://localhost:8080"
	try:
		product_id = int(Path(".docker/product-id").read_text(encoding="utf-8").strip())
	except Exception:
		product_id = 18

	events_to_track = [
		"side_cart_open",
		"side_cart_close",
		"side_cart_refreshed",
		"side_cart_coupon_applied",
		"side_cart_coupon_removed",
		"wc-blocks_added_to_cart",
		"wc-blocks_removed_from_cart",
	]

	with sync_playwright() as p:
		browser = p.chromium.launch(headless=True)
		context = browser.new_context()
		page = context.new_page()

		page.goto(f"{base_url}/shop/", wait_until="networkidle")

		page.wait_for_function("() => !!window.wcSideCart && !!window.wcSideCart.sdk")
		page.wait_for_selector("#wc-side-cart-panel")

		page.evaluate(
			"""(names) => {
				window.__task6 = { events: [], pageErrors: [] };
				const push = (name, e) => {
					try {
						window.__task6.events.push({
							name,
							detail: (e && typeof e.detail !== 'undefined') ? e.detail : null,
							at: Date.now()
						});
					} catch (err) {}
				};
				names.forEach((name) => {
					document.addEventListener(name, (e) => push(name, e), true);
					if (document.body) {
						document.body.addEventListener(name, (e) => push(name, e), true);
					}
				});
			}""",
			events_to_track,
		)

		page.on(
			"pageerror",
			lambda err: page.evaluate(
				"(m) => window.__task6 && window.__task6.pageErrors && window.__task6.pageErrors.push(m)",
				{"message": str(err)},
			),
		)

		page.evaluate(
			"""async (productId) => {
				const sdk = window.wcSideCart && window.wcSideCart.sdk ? window.wcSideCart.sdk : null;
				const endpoints = window.wcSideCart && window.wcSideCart.endpoints ? window.wcSideCart.endpoints : null;
				if (!sdk || !endpoints || !endpoints.cart) {
					throw new Error('Missing sdk/endpoints');
				}

				let cart = await sdk.refreshCart();
				if (cart && Array.isArray(cart.items) && cart.items.length) {
					for (const item of cart.items) {
						if (item && item.key) {
							cart = await sdk.removeItem(item.key);
						}
					}
				}

				await sdk.request(String(endpoints.cart) + '/add-item', 'POST', { id: productId, quantity: 2 });
				cart = await sdk.refreshCart();
				sdk.render(cart);

				window.__task6.cartItemKey = (cart && Array.isArray(cart.items) && cart.items[0] && cart.items[0].key) ? cart.items[0].key : null;
				sdk.close();
				document.body.dispatchEvent(new CustomEvent('wc-blocks_added_to_cart', { detail: { preserveCartData: false } }));
				return { cartItemKey: window.__task6.cartItemKey };
			}""",
			product_id,
		)

		page.wait_for_function("() => document.body.classList.contains('wc-side-cart-is-open')", timeout=20000)
		page.wait_for_function("() => document.body.classList.contains('wc-side-cart-scroll-lock')", timeout=20000)
		page.wait_for_function("() => document.querySelectorAll('#wc-side-cart-panel .js-side-cart-items .item').length > 0", timeout=20000)
		page.wait_for_selector("#wc-side-cart-panel .side-cart__totals table.shop_table", timeout=20000)
		page.wait_for_selector("#wc-side-cart-panel .side-cart__totals tr.order-total", timeout=20000)

		before_coupon = page.evaluate("() => window.__task6.events.length")

		page.locator("#wc-side-cart-panel .wcsc-coupon__toggle").first.click()
		page.locator("#wc-side-cart-panel .wcsc-coupon__panel").wait_for(state="visible", timeout=20000)
		page.locator("#wc-side-cart-panel .wcsc-coupon__row input[type='text']").first.fill("sidecart10p")
		page.locator("#wc-side-cart-panel .wcsc-coupon__row button").first.click()

		page.wait_for_function(
			"""(start) => {
				const ev = window.__task6 && window.__task6.events ? window.__task6.events.slice(start) : [];
				const applied = ev.some(e => e && e.name === 'side_cart_coupon_applied');
				const blocks = ev.some(e => e && e.name === 'wc-blocks_added_to_cart' && e.detail && e.detail.preserveCartData === false);
				return applied && blocks;
			}""",
			arg=before_coupon,
			timeout=20000,
		)

		page.wait_for_selector("#wc-side-cart-panel .side-cart__totals tr.cart-discount", timeout=20000)

		before_remove_coupon = page.evaluate("() => window.__task6.events.length")

		page.locator("#wc-side-cart-panel .wcsc-coupon__toggle").first.click()
		page.locator("#wc-side-cart-panel .wcsc-coupon__panel").wait_for(state="visible", timeout=20000)
		page.locator("#wc-side-cart-panel .wcsc-coupon__list .wcsc-coupon__remove").first.click()

		page.wait_for_function(
			"""(start) => {
				const ev = window.__task6 && window.__task6.events ? window.__task6.events.slice(start) : [];
				return ev.some(e => e && e.name === 'side_cart_coupon_removed');
			}""",
			arg=before_remove_coupon,
			timeout=20000,
		)

		page.wait_for_function(
			"""() => !document.querySelector('#wc-side-cart-panel .side-cart__totals tr.cart-discount')""",
			timeout=20000,
		)

		before_remove_item = page.evaluate("() => window.__task6.events.length")

		page.locator("#wc-side-cart-panel .js-remove-basket-item").first.click()
		page.wait_for_function(
			"""() => {
				return !!document.querySelector('#wc-side-cart-panel .cart-empty, #wc-side-cart-panel .woocommerce-mini-cart__empty-message, #wc-side-cart-panel .woocommerce-info');
			}""",
			timeout=20000,
		)

		page.wait_for_function(
			"""(start) => {
				const ev = window.__task6 && window.__task6.events ? window.__task6.events.slice(start) : [];
				return ev.some(e => e && e.name === 'wc-blocks_removed_from_cart' && e.detail && typeof e.detail.cartItemKey === 'string' && e.detail.cartItemKey);
			}""",
			arg=before_remove_item,
			timeout=20000,
		)

		page.locator("#wc-side-cart-panel .js-side-cart-close").first.click()
		page.wait_for_function("() => !document.body.classList.contains('wc-side-cart-is-open')", timeout=20000)
		page.wait_for_function("() => !document.body.classList.contains('wc-side-cart-scroll-lock')", timeout=20000)

		page.evaluate(
			"""() => {
				document.body.dispatchEvent(new CustomEvent('wc-blocks_added_to_cart', { detail: { preserveCartData: false } }));
			}"""
		)
		page.wait_for_function("() => document.body.classList.contains('wc-side-cart-is-open')", timeout=20000)

		page.locator("#wc-side-cart-panel .js-side-cart-close").first.click()
		page.wait_for_function("() => !document.body.classList.contains('wc-side-cart-is-open')", timeout=20000)

		page.evaluate(
			"""() => {
				document.body.dispatchEvent(new CustomEvent('wc-blocks_removed_from_cart', { detail: { preserveCartData: false } }));
			}"""
		)
		page.wait_for_function("() => !document.body.classList.contains('wc-side-cart-is-open')", timeout=20000)

		page.goto(f"{base_url}/cart/", wait_until="networkidle")
		page.wait_for_timeout(1000)
		assert page.locator("#wc-side-cart-panel").count() == 0

		page.goto(f"{base_url}/checkout/", wait_until="networkidle")
		page.wait_for_timeout(1000)
		assert page.locator("#wc-side-cart-panel").count() == 0

		page_errors = page.evaluate("() => (window.__task6 && window.__task6.pageErrors) ? window.__task6.pageErrors : []")
		if page_errors:
			raise RuntimeError(f"Page errors detected: {page_errors[:3]}")

		browser.close()


if __name__ == "__main__":
	main()
