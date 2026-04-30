#!/usr/bin/env bash
set -euo pipefail

wpBaseUrl="${WP_BASE_URL:-http://localhost:8080}"
wpTitle="${WP_TITLE:-WooCommerce Side Cart Dev}"
adminUser="${WP_ADMIN_USER:-admin}"
adminPassword="${WP_ADMIN_PASSWORD:-admin}"
adminEmail="${WP_ADMIN_EMAIL:-admin@example.com}"

mkdir -p .docker

docker compose up -d db wordpress

for i in {1..60}; do
	if curl -fsS "${wpBaseUrl}/wp-login.php" >/dev/null 2>&1; then
		break
	fi
	sleep 2
done

if ! curl -fsS "${wpBaseUrl}/wp-login.php" >/dev/null 2>&1; then
	echo "WordPress is not responding at ${wpBaseUrl}" >&2
	exit 1
fi

if docker compose run --rm wpcli core is-installed >/dev/null 2>&1; then
	echo "WordPress is already installed."
else
	docker compose run --rm wpcli core install \
		--url="${wpBaseUrl}" \
		--title="${wpTitle}" \
		--admin_user="${adminUser}" \
		--admin_password="${adminPassword}" \
		--admin_email="${adminEmail}" \
		--skip-email
fi

docker compose run --rm wpcli plugin install woocommerce --activate
docker compose run --rm wpcli plugin activate woocommerce-side-cart

docker compose run --rm wpcli option update woocommerce_coming_soon "no" >/dev/null 2>&1 || true
docker compose run --rm wpcli option update woocommerce_store_pages_only "no" >/dev/null 2>&1 || true
docker compose run --rm wpcli option update woocommerce_feature_site_visibility_badge_enabled "no" >/dev/null 2>&1 || true

docker compose run --rm wpcli option update permalink_structure "/%postname%/"
docker compose run --rm wpcli rewrite flush --hard

if docker compose run --rm wpcli wc tool run install_pages >/dev/null 2>&1; then
	:
fi

productName="${WP_PRODUCT_NAME:-Side Cart Test Product}"
productSku="${WP_PRODUCT_SKU:-sidecart-test-sku}"
productPrice="${WP_PRODUCT_PRICE:-9.99}"
productCountRaw="${WP_PRODUCT_COUNT:-5}"

productCount="$(echo -n "${productCountRaw}" | tr -d '[:space:]')"
if ! [[ "${productCount}" =~ ^[0-9]+$ ]]; then
	echo "WP_PRODUCT_COUNT is not valid: ${productCountRaw}" >&2
	exit 1
fi
if [[ "${productCount}" -lt 1 ]]; then
	echo "WP_PRODUCT_COUNT must be >= 1" >&2
	exit 1
fi

salePercentRaw="${WP_SALE_PERCENT:-20}"
saleFixedPrice="${WP_SALE_FIXED_PRICE:-7.99}"

salePercent="$(echo -n "${salePercentRaw}" | tr -d '[:space:]')"
if ! [[ "${salePercent}" =~ ^[0-9]+$ ]]; then
	echo "WP_SALE_PERCENT is not valid: ${salePercentRaw}" >&2
	exit 1
fi
if [[ "${salePercent}" -lt 1 || "${salePercent}" -gt 90 ]]; then
	echo "WP_SALE_PERCENT must be between 1 and 90" >&2
	exit 1
fi

function getProductIdBySku() {
	local sku="$1"
	local id=""

	id="$(docker compose run --rm wpcli wc product list --sku="${sku}" --fields=id --format=csv 2>/dev/null | tail -n +2 | head -n 1 || true)"
	id="$(echo -n "${id}" | tr -d '[:space:]')"
	if [[ -n "${id}" ]]; then
		echo "${id}"
		return 0
	fi

	id="$(docker compose run --rm wpcli post list --post_type=product --post_status=publish --meta_key=_sku --meta_value="${sku}" --field=ID --format=ids 2>/dev/null | awk '{print $1; exit}' || true)"
	id="$(echo -n "${id}" | tr -d '[:space:]')"
	if [[ -n "${id}" ]]; then
		echo "${id}"
		return 0
	fi

	return 0
}

function createSimpleProduct() {
	local sku="$1"
	local name="$2"
	local regularPrice="$3"
	local salePrice="${4:-}"

	local existingId=""
	existingId="$(getProductIdBySku "${sku}")"
	existingId="$(echo -n "${existingId}" | tr -d '[:space:]')"
	if [[ -n "${existingId}" ]]; then
		echo "${existingId}"
		return 0
	fi

	local createdId=""

	if [[ -n "${salePrice}" ]]; then
		createdId="$(docker compose run --rm wpcli wc product create \
			--user=1 \
			--name="${name}" \
			--type=simple \
			--regular_price="${regularPrice}" \
			--sale_price="${salePrice}" \
			--sku="${sku}" \
			--status=publish \
			--porcelain 2>/dev/null || true)"
		createdId="$(echo -n "${createdId}" | tr -d '[:space:]')"
		if [[ -n "${createdId}" ]]; then
			echo "${createdId}"
			return 0
		fi

		createdId="$(docker compose run --rm wpcli post create \
			--post_type=product \
			--post_status=publish \
			--post_title="${name}" \
			--porcelain)"
		createdId="$(echo -n "${createdId}" | tr -d '[:space:]')"
		if [[ -z "${createdId}" ]]; then
			return 0
		fi
		docker compose run --rm wpcli post meta update "${createdId}" _regular_price "${regularPrice}" >/dev/null
		docker compose run --rm wpcli post meta update "${createdId}" _sale_price "${salePrice}" >/dev/null
		docker compose run --rm wpcli post meta update "${createdId}" _price "${salePrice}" >/dev/null
		docker compose run --rm wpcli post meta update "${createdId}" _sku "${sku}" >/dev/null
		docker compose run --rm wpcli post term add "${createdId}" product_type simple >/dev/null
		echo "${createdId}"
		return 0
	fi

	createdId="$(docker compose run --rm wpcli wc product create \
		--user=1 \
		--name="${name}" \
		--type=simple \
		--regular_price="${regularPrice}" \
		--sku="${sku}" \
		--status=publish \
		--porcelain 2>/dev/null || true)"
	createdId="$(echo -n "${createdId}" | tr -d '[:space:]')"
	if [[ -n "${createdId}" ]]; then
		echo "${createdId}"
		return 0
	fi

	createdId="$(docker compose run --rm wpcli post create \
		--post_type=product \
		--post_status=publish \
		--post_title="${name}" \
		--porcelain)"
	createdId="$(echo -n "${createdId}" | tr -d '[:space:]')"
	if [[ -z "${createdId}" ]]; then
		return 0
	fi
	docker compose run --rm wpcli post meta update "${createdId}" _regular_price "${regularPrice}" >/dev/null
	docker compose run --rm wpcli post meta update "${createdId}" _price "${regularPrice}" >/dev/null
	docker compose run --rm wpcli post meta update "${createdId}" _sku "${sku}" >/dev/null
	docker compose run --rm wpcli post term add "${createdId}" product_type simple >/dev/null
	echo "${createdId}"
}

createdProductIds=()

salePercentSku="${productSku}-sale-percent"
salePercentName="${productName} (SALE -${salePercent}%)"
salePercentPrice="$(awk -v p="${productPrice}" -v s="${salePercent}" 'BEGIN { printf "%.2f", (p * (100 - s) / 100) }')"
salePercentProductId="$(createSimpleProduct "${salePercentSku}" "${salePercentName}" "${productPrice}" "${salePercentPrice}")"
salePercentProductId="$(echo -n "${salePercentProductId}" | tr -d '[:space:]')"
if [[ -n "${salePercentProductId}" ]]; then
	createdProductIds+=("${salePercentProductId}")
fi

if [[ "${productCount}" -ge 2 ]]; then
	saleFixedSku="${productSku}-sale-fixed"
	saleFixedName="${productName} (SALE ${saleFixedPrice})"
	saleFixedProductId="$(createSimpleProduct "${saleFixedSku}" "${saleFixedName}" "${productPrice}" "${saleFixedPrice}")"
	saleFixedProductId="$(echo -n "${saleFixedProductId}" | tr -d '[:space:]')"
	if [[ -n "${saleFixedProductId}" ]]; then
		createdProductIds+=("${saleFixedProductId}")
	fi
fi

normalCount="$((productCount - ${#createdProductIds[@]}))"
if [[ "${normalCount}" -lt 0 ]]; then
	normalCount=0
fi

if [[ "${normalCount}" -gt 0 ]]; then
	for i in $(seq 1 "${normalCount}"); do
		sku="${productSku}-${i}"
		name="${productName} #${i}"
		productId="$(createSimpleProduct "${sku}" "${name}" "${productPrice}")"
		productId="$(echo -n "${productId}" | tr -d '[:space:]')"
		if [[ -n "${productId}" ]]; then
			createdProductIds+=("${productId}")
		fi
	done
fi

if [[ "${#createdProductIds[@]}" -lt "${productCount}" ]]; then
	echo "Unable to create/detect ${productCount} products (got: ${#createdProductIds[@]})." >&2
	exit 1
fi

{
	for i in $(seq 0 "$((productCount - 1))"); do
		echo "${createdProductIds[$i]}"
	done
} > ".docker/product-ids"

printf "%s" "${createdProductIds[0]}" > ".docker/product-id"

couponPercentCode="${WP_COUPON_PERCENT_CODE:-SIDECART10P}"
couponFixedCode="${WP_COUPON_FIXED_CODE:-SIDECART10F}"
couponFreeShipCode="${WP_COUPON_FREESHIP_CODE:-SIDECARTFREESHIP}"
couponPercentAmount="${WP_COUPON_PERCENT_AMOUNT:-10}"
couponFixedAmount="${WP_COUPON_FIXED_AMOUNT:-10}"

function getCouponIdByCode() {
	local code="$1"
	docker compose run --rm wpcli post list --post_type=shop_coupon --post_status=publish,draft --fields=ID,post_title --format=csv 2>/dev/null | tail -n +2 | awk -F',' -v c="${code}" '$2==c{print $1; exit}' || true
}

function ensureCoupon() {
	local code="$1"
	local discountType="$2"
	local amount="$3"
	local freeShipping="${4:-false}"

	local existingId=""
	existingId="$(getCouponIdByCode "${code}")"
	existingId="$(echo -n "${existingId}" | tr -d '[:space:]')"
	if [[ -n "${existingId}" ]]; then
		echo "${existingId}"
		return 0
	fi

	local createdId=""
	createdId="$(docker compose run --rm wpcli post create \
		--post_type=shop_coupon \
		--post_status=publish \
		--post_title="${code}" \
		--porcelain)"
	createdId="$(echo -n "${createdId}" | tr -d '[:space:]')"
	if [[ -z "${createdId}" ]]; then
		return 0
	fi

	docker compose run --rm wpcli post meta update "${createdId}" discount_type "${discountType}" >/dev/null
	docker compose run --rm wpcli post meta update "${createdId}" coupon_amount "${amount}" >/dev/null
	docker compose run --rm wpcli post meta update "${createdId}" individual_use "yes" >/dev/null
	if [[ "${freeShipping}" == "true" ]]; then
		docker compose run --rm wpcli post meta update "${createdId}" free_shipping "yes" >/dev/null
	else
		docker compose run --rm wpcli post meta update "${createdId}" free_shipping "no" >/dev/null
	fi

	echo "${createdId}"
}

declare -a createdCouponIds
createdCouponIds=()
couponPercentId="$(ensureCoupon "${couponPercentCode}" "percent" "${couponPercentAmount}" "false")"
couponPercentId="$(echo -n "${couponPercentId}" | tr -d '[:space:]')"
if [[ -n "${couponPercentId}" ]]; then
	createdCouponIds+=("${couponPercentId}")
fi

couponFixedId="$(ensureCoupon "${couponFixedCode}" "fixed_cart" "${couponFixedAmount}" "false")"
couponFixedId="$(echo -n "${couponFixedId}" | tr -d '[:space:]')"
if [[ -n "${couponFixedId}" ]]; then
	createdCouponIds+=("${couponFixedId}")
fi

couponFreeShipId="$(ensureCoupon "${couponFreeShipCode}" "fixed_cart" "0" "true")"
couponFreeShipId="$(echo -n "${couponFreeShipId}" | tr -d '[:space:]')"
if [[ -n "${couponFreeShipId}" ]]; then
	createdCouponIds+=("${couponFreeShipId}")
fi

{
	for id in "${createdCouponIds[@]-}"; do
		echo "${id}"
	done
} > ".docker/coupon-ids"

if [[ "${#createdCouponIds[@]}" -gt 0 ]]; then
	printf "%s" "${createdCouponIds[0]}" > ".docker/coupon-id"
fi

function getPageIdBySlug() {
	local slug="$1"
	local id=""

	id="$(docker compose run --rm wpcli post list --post_type=page --post_status=publish --name="${slug}" --field=ID --format=ids 2>/dev/null | awk '{print $1; exit}' || true)"
	id="$(echo -n "${id}" | tr -d '[:space:]')"
	if [[ -n "${id}" ]]; then
		echo "${id}"
		return 0
	fi

	id="$(docker compose run --rm wpcli post list --post_type=page --post_status=publish --s="${slug}" --field=ID --format=ids 2>/dev/null | awk '{print $1; exit}' || true)"
	id="$(echo -n "${id}" | tr -d '[:space:]')"
	if [[ -n "${id}" ]]; then
		echo "${id}"
		return 0
	fi

	return 0
}

function ensurePage() {
	local slug="$1"
	local title="$2"
	local content="$3"
	local existingId=""

	existingId="$(getPageIdBySlug "${slug}")"
	existingId="$(echo -n "${existingId}" | tr -d '[:space:]')"

	if [[ -n "${existingId}" ]]; then
		docker compose run --rm wpcli post update "${existingId}" --post_title="${title}" --post_content="${content}" >/dev/null
		echo "${existingId}"
		return 0
	fi

	local createdId=""
	createdId="$(docker compose run --rm wpcli post create \
		--post_type=page \
		--post_status=publish \
		--post_title="${title}" \
		--post_name="${slug}" \
		--post_content="${content}" \
		--porcelain 2>/dev/null || true)"
	createdId="$(echo -n "${createdId}" | tr -d '[:space:]')"
	if [[ -n "${createdId}" ]]; then
		echo "${createdId}"
		return 0
	fi

	return 0
}

blocksSmokeSlug="${WP_SIDECART_BLOCKS_SMOKE_SLUG:-sidecart-blocks-smoke}"
noBlocksSmokeSlug="${WP_SIDECART_NO_BLOCKS_SMOKE_SLUG:-sidecart-no-blocks-smoke}"

blocksSmokeContent=$'<!-- wp:woocommerce/mini-cart /-->\n\n<!-- wp:paragraph -->\n<p>Pagina smoke test: Mini-Cart Blocks presente.</p>\n<!-- /wp:paragraph -->'
noBlocksSmokeContent=$'<!-- wp:paragraph -->\n<p>Pagina smoke test: nessun Woo Blocks.</p>\n<!-- /wp:paragraph -->'

blocksSmokePageId="$(ensurePage "${blocksSmokeSlug}" "Side Cart Smoke - Mini Cart Blocks" "${blocksSmokeContent}")"
blocksSmokePageId="$(echo -n "${blocksSmokePageId}" | tr -d '[:space:]')"
if [[ -n "${blocksSmokePageId}" ]]; then
	printf "%s" "${blocksSmokePageId}" > ".docker/blocks-smoke-page-id"
	printf "%s" "${blocksSmokeSlug}" > ".docker/blocks-smoke-page-slug"
fi

noBlocksSmokePageId="$(ensurePage "${noBlocksSmokeSlug}" "Side Cart Smoke - No Blocks" "${noBlocksSmokeContent}")"
noBlocksSmokePageId="$(echo -n "${noBlocksSmokePageId}" | tr -d '[:space:]')"
if [[ -n "${noBlocksSmokePageId}" ]]; then
	printf "%s" "${noBlocksSmokePageId}" > ".docker/no-blocks-smoke-page-id"
	printf "%s" "${noBlocksSmokeSlug}" > ".docker/no-blocks-smoke-page-slug"
fi

echo "WP URL: ${wpBaseUrl}"
echo "Admin: ${adminUser} / ${adminPassword}"
echo "Product IDs:"
for i in $(seq 0 "$((productCount - 1))"); do
	echo "- ${createdProductIds[$i]}"
done
echo "Coupons:"
echo "- ${couponPercentCode} (${couponPercentAmount}%): ${couponPercentId}"
echo "- ${couponFixedCode} (${couponFixedAmount}): ${couponFixedId}"
echo "- ${couponFreeShipCode} (free shipping): ${couponFreeShipId}"
echo "Smoke pages:"
echo "- Blocks: ${wpBaseUrl}/${blocksSmokeSlug}/"
echo "- No Blocks: ${wpBaseUrl}/${noBlocksSmokeSlug}/"
