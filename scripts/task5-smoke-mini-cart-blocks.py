import os
from pathlib import Path

from playwright.sync_api import sync_playwright


def main() -> None:
	base_url = os.environ.get("WP_BASE_URL", "http://localhost:8080").rstrip("/")
	try:
		product_id = int(Path(".docker/product-id").read_text(encoding="utf-8").strip())
	except Exception:
		product_id = 18

	try:
		blocks_page_slug = Path(".docker/blocks-smoke-page-slug").read_text(encoding="utf-8").strip()
	except Exception:
		blocks_page_slug = "sidecart-blocks-smoke"

	try:
		no_blocks_page_slug = Path(".docker/no-blocks-smoke-page-slug").read_text(encoding="utf-8").strip()
	except Exception:
		no_blocks_page_slug = "sidecart-no-blocks-smoke"

	events_to_track = [
		"side_cart_refreshed",
		"wc-blocks_added_to_cart",
		"wc-blocks_removed_from_cart",
	]

	with sync_playwright() as p:
		browser = p.chromium.launch(headless=True)
		context = browser.new_context()
		page = context.new_page()

		page.on(
			"pageerror",
			lambda err: page.evaluate(
				"(m) => window.__task5 && window.__task5.pageErrors && window.__task5.pageErrors.push(m)",
				{"message": str(err)},
			),
		)

		def init_event_capture() -> None:
			page.evaluate(
				"""(names) => {
					window.__task5 = { events: [], pageErrors: [] };
					const push = (target, name, e) => {
						try {
							window.__task5.events.push({
								target,
								name,
								detail: (e && typeof e.detail !== 'undefined') ? e.detail : null,
								at: Date.now()
							});
						} catch (err) {}
					};
					names.forEach((name) => {
						document.addEventListener(name, (e) => push('document', name, e), true);
						if (document.body) {
							document.body.addEventListener(name, (e) => push('body', name, e), true);
						}
						window.addEventListener(name, (e) => push('window', name, e), true);
					});
				}""",
				events_to_track,
			)

		def wait_for_side_cart_runtime() -> None:
			page.wait_for_function("() => !!window.wcSideCart && !!window.wcSideCart.sdk")
			page.wait_for_selector("#wc-side-cart-panel")

		def seed_cart(quantity: int) -> None:
			page.evaluate(
				"""async ({ productId, quantity }) => {
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

					await sdk.request(String(endpoints.cart) + '/add-item', 'POST', { id: productId, quantity });
					cart = await sdk.refreshCart();
					sdk.render(cart);
					sdk.close();

					document.body.dispatchEvent(new CustomEvent('wc-blocks_added_to_cart', { detail: { preserveCartData: false } }));
					return true;
				}""",
				{"productId": product_id, "quantity": quantity},
			)

		def open_side_cart() -> None:
			page.locator(".js-side-cart-open").first.click()
			page.wait_for_function("() => document.body.classList.contains('wc-side-cart-is-open')", timeout=20000)
			page.wait_for_function("() => document.querySelectorAll('#wc-side-cart-panel .js-side-cart-items .item').length >= 0", timeout=20000)

		def set_first_item_quantity(quantity: int) -> None:
			input_locator = page.locator("#wc-side-cart-panel .js-side-cart-change-qty").first
			input_locator.wait_for(state="visible", timeout=20000)
			input_locator.click()
			input_locator.fill(str(quantity))
			page.wait_for_timeout(750)

		def remove_first_item() -> None:
			page.locator("#wc-side-cart-panel .js-remove-basket-item").first.click()
			page.wait_for_function(
				"""() => {
					return !!document.querySelector('#wc-side-cart-panel .cart-empty, #wc-side-cart-panel .woocommerce-mini-cart__empty-message, #wc-side-cart-panel .woocommerce-info');
				}""",
				timeout=20000,
			)

		get_count_fn = """
			() => {
				const parse = (value) => {
					if (!value) return null;
					const m = String(value).match(/(\\d+)/);
					return m ? parseInt(m[1], 10) : null;
				};

				const selectors = [
					'.wc-block-mini-cart__badge',
					'.wc-block-mini-cart__quantity-badge',
					'.wc-block-mini-cart__button-badge',
					'.wp-block-woocommerce-mini-cart .wc-block-mini-cart__badge',
				];

				for (const sel of selectors) {
					const el = document.querySelector(sel);
					if (el) {
						const n = parse(el.textContent);
						if (typeof n === 'number') return n;
					}
				}

				const button = document.querySelector('.wc-block-mini-cart__button');
				if (button) {
					const label = button.getAttribute('aria-label') || button.textContent || '';
					const n = parse(label);
					if (typeof n === 'number') return n;
				}

				return null;
			}
		"""

		def wait_for_mini_cart_count(expected: int) -> None:
			page.wait_for_function(
				f"(expected) => {{ const getCount = {get_count_fn}; const c = getCount(); return typeof c === 'number' && c === expected; }}",
				arg=expected,
				timeout=20000,
			)

		def assert_blocks_store_presence(expected_present: bool) -> None:
			page.wait_for_function(
				"""(expected) => {
					try {
						const wpData = window.wp && window.wp.data ? window.wp.data : null;
						if (!wpData || typeof wpData.dispatch !== 'function' || typeof wpData.select !== 'function') {
							return expected === false;
						}
						if (typeof wpData.hasStore === 'function') {
							return wpData.hasStore('wc/store/cart') === expected;
						}
						try {
							return (!!wpData.select('wc/store/cart')) === expected;
						} catch (e) {
							return expected === false;
						}
					} catch (e2) {
						return expected === false;
					}
				}""",
				arg=expected_present,
				timeout=20000,
			)

		page.goto(f"{base_url}/{blocks_page_slug}/", wait_until="networkidle")
		wait_for_side_cart_runtime()
		init_event_capture()
		assert_blocks_store_presence(True)

		seed_cart(1)
		page.wait_for_selector(".wc-block-mini-cart__button, .wp-block-woocommerce-mini-cart", timeout=20000)
		wait_for_mini_cart_count(1)

		open_side_cart()
		set_first_item_quantity(2)
		wait_for_mini_cart_count(2)

		before_remove = page.evaluate("() => window.__task5.events.length")
		remove_first_item()
		wait_for_mini_cart_count(0)

		page.wait_for_function(
			"""(start) => {
				const ev = window.__task5 && window.__task5.events ? window.__task5.events.slice(start) : [];
				return ev.some(e => e && e.target === 'document' && e.name === 'wc-blocks_removed_from_cart');
			}""",
			arg=before_remove,
			timeout=20000,
		)

		page.goto(f"{base_url}/{no_blocks_page_slug}/", wait_until="networkidle")
		wait_for_side_cart_runtime()
		init_event_capture()
		assert_blocks_store_presence(False)

		seed_cart(1)

		open_side_cart()
		set_first_item_quantity(2)
		page.wait_for_function(
			"""(expected) => {
				const el = document.querySelector('.js-side-cart-number');
				if (!el) return false;
				const m = String(el.textContent || '').match(/(\\d+)/);
				return m ? parseInt(m[1], 10) === expected : false;
			}""",
			arg=2,
			timeout=20000,
		)

		remove_first_item()

		page_errors = page.evaluate("() => (window.__task5 && window.__task5.pageErrors) ? window.__task5.pageErrors : []")
		if page_errors:
			raise RuntimeError(f"Page errors detected: {page_errors[:3]}")

		browser.close()


if __name__ == "__main__":
	main()

