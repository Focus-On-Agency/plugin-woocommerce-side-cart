#!/usr/bin/env bash
set -euo pipefail

wpBaseUrl="${WP_BASE_URL:-http://localhost:8080}"
storeApiBase="${wpBaseUrl}/wp-json/wc/store/v1"

if [[ ! -f ".docker/product-id" ]]; then
	echo "Missing file: .docker/product-id. Run first: bash scripts/wp-setup.sh" >&2
	exit 1
fi

productId="$(cat .docker/product-id)"
if [[ -z "${productId}" ]]; then
	echo "Empty product ID in .docker/product-id" >&2
	exit 1
fi

tmpDir="$(mktemp -d)"
trap 'rm -rf "${tmpDir}"' EXIT

requestJson() {
	local method="$1"
	local url="$2"
	local jsonBody="${3:-}"
	local cartToken="${4:-}"
	local storeApiNonce="${5:-}"
	local headerFile="${tmpDir}/headers.txt"
	local bodyFile="${tmpDir}/body.json"

	rm -f "${headerFile}" "${bodyFile}"

	local curlArgs=(
		-sS
		-D "${headerFile}"
		-o "${bodyFile}"
		-w "%{http_code}"
		-H "Accept: application/json"
	)

	if [[ -n "${cartToken}" ]]; then
		curlArgs+=(-H "Cart-Token: ${cartToken}")
	fi
	if [[ -n "${storeApiNonce}" ]]; then
		curlArgs+=(-H "Nonce: ${storeApiNonce}" -H "X-WC-Store-API-Nonce: ${storeApiNonce}")
	fi

	if [[ -n "${jsonBody}" ]]; then
		curlArgs+=(-H "Content-Type: application/json" --data "${jsonBody}")
	fi

	local httpCode
	httpCode="$(curl "${curlArgs[@]}" -X "${method}" "${url}")"

	local newCartToken
	newCartToken="$(awk -F': ' 'tolower($1)=="cart-token"{print $2}' "${headerFile}" | tail -n 1 | tr -d '\r')"

	local newNonce
	newNonce="$(awk -F': ' 'tolower($1)=="nonce" || tolower($1)=="x-wc-store-api-nonce"{print $2}' "${headerFile}" | tail -n 1 | tr -d '\r')"

	printf "%s\t%s\t%s\t%s\n" "${httpCode}" "${newCartToken}" "${newNonce}" "${bodyFile}"
}

extractJson() {
	local bodyFile="$1"
	local pythonExpr="$2"
	python3 -c "import json,sys; data=json.load(open(sys.argv[1])); print(${pythonExpr})" "${bodyFile}"
}

echo "GET cart (fetch Cart-Token)"
read -r httpCode cartToken storeApiNonce bodyFile < <(requestJson "GET" "${storeApiBase}/cart")
if [[ "${httpCode}" != "200" ]]; then
	echo "GET cart failed (HTTP ${httpCode})" >&2
	cat "${bodyFile}" >&2
	exit 1
fi
if [[ -z "${cartToken}" ]]; then
	echo "Cart-Token not found in response (GET cart)" >&2
	exit 1
fi
if [[ -z "${storeApiNonce}" ]]; then
	echo "Store API Nonce not found in response (GET cart). Continuing anyway." >&2
fi

echo "POST add-item"
read -r httpCode cartToken storeApiNonce bodyFile < <(requestJson "POST" "${storeApiBase}/cart/add-item" "{\"id\":${productId},\"quantity\":2}" "${cartToken}" "${storeApiNonce}")
if [[ "${httpCode}" != "200" && "${httpCode}" != "201" ]]; then
	echo "add-item failed (HTTP ${httpCode})" >&2
	cat "${bodyFile}" >&2
	exit 1
fi

cartItemKey="$(extractJson "${bodyFile}" "data['items'][0]['key']")"
if [[ -z "${cartItemKey}" ]]; then
	echo "Unable to extract item key from cart after add-item" >&2
	cat "${bodyFile}" >&2
	exit 1
fi

echo "POST update-item"
read -r httpCode cartToken storeApiNonce bodyFile < <(requestJson "POST" "${storeApiBase}/cart/update-item" "{\"key\":\"${cartItemKey}\",\"quantity\":3}" "${cartToken}" "${storeApiNonce}")
if [[ "${httpCode}" != "200" && "${httpCode}" != "201" ]]; then
	echo "update-item failed (HTTP ${httpCode})" >&2
	cat "${bodyFile}" >&2
	exit 1
fi

updatedQty="$(extractJson "${bodyFile}" "next((i.get('quantity') for i in data.get('items',[]) if i.get('key')=='${cartItemKey}'), '')")"
if [[ "${updatedQty}" != "3" ]]; then
	echo "Quantity not updated (expected 3, got ${updatedQty})" >&2
	cat "${bodyFile}" >&2
	exit 1
fi

couponCode=""
if [[ -f ".docker/coupon-code" ]]; then
	couponCode="$(cat .docker/coupon-code || true)"
	couponCode="$(echo -n "${couponCode}" | tr -d '[:space:]')"
fi
couponCode="${COUPON_CODE:-${couponCode}}"
couponCodeReq="$(echo -n "${couponCode}" | tr '[:upper:]' '[:lower:]')"

if [[ -n "${couponCodeReq}" ]]; then
	echo "POST apply-coupon (${couponCodeReq})"
	read -r httpCode cartToken storeApiNonce bodyFile < <(requestJson "POST" "${storeApiBase}/cart/apply-coupon" "{\"code\":\"${couponCodeReq}\"}" "${cartToken}" "${storeApiNonce}")
	if [[ "${httpCode}" == "404" || "${httpCode}" == "403" ]]; then
		echo "SKIP: coupon endpoint not available or coupons disabled (HTTP ${httpCode})"
	else
		if [[ "${httpCode}" != "200" && "${httpCode}" != "201" ]]; then
			echo "apply-coupon failed (HTTP ${httpCode})" >&2
			cat "${bodyFile}" >&2
			exit 1
		fi

		hasCoupon="$(extractJson "${bodyFile}" "any((c.get('code','').lower()=='${couponCodeReq}') for c in data.get('coupons', []))")"
		if [[ "${hasCoupon}" != "True" ]]; then
			echo "Coupon not present in cart after apply-coupon" >&2
			cat "${bodyFile}" >&2
			exit 1
		fi

		echo "POST remove-coupon (${couponCodeReq})"
		read -r httpCode cartToken storeApiNonce bodyFile < <(requestJson "POST" "${storeApiBase}/cart/remove-coupon" "{\"code\":\"${couponCodeReq}\"}" "${cartToken}" "${storeApiNonce}")
		if [[ "${httpCode}" != "200" && "${httpCode}" != "201" ]]; then
			echo "remove-coupon failed (HTTP ${httpCode})" >&2
			cat "${bodyFile}" >&2
			exit 1
		fi

		hasCoupon="$(extractJson "${bodyFile}" "any((c.get('code','').lower()=='${couponCodeReq}') for c in data.get('coupons', []))")"
		if [[ "${hasCoupon}" != "False" ]]; then
			echo "Coupon still present in cart after remove-coupon" >&2
			cat "${bodyFile}" >&2
			exit 1
		fi
	fi
else
	echo "SKIP: coupon test (set COUPON_CODE or create .docker/coupon-code)"
fi

echo "POST remove-item"
read -r httpCode cartToken storeApiNonce bodyFile < <(requestJson "POST" "${storeApiBase}/cart/remove-item" "{\"key\":\"${cartItemKey}\"}" "${cartToken}" "${storeApiNonce}")
if [[ "${httpCode}" != "200" && "${httpCode}" != "201" ]]; then
	echo "remove-item failed (HTTP ${httpCode})" >&2
	cat "${bodyFile}" >&2
	exit 1
fi

echo "GET cart (verify empty)"
read -r httpCode cartToken storeApiNonce bodyFile < <(requestJson "GET" "${storeApiBase}/cart" "" "${cartToken}" "${storeApiNonce}")
if [[ "${httpCode}" != "200" ]]; then
	echo "GET cart failed (HTTP ${httpCode})" >&2
	cat "${bodyFile}" >&2
	exit 1
fi

itemsCount="$(extractJson "${bodyFile}" "len(data.get('items', []))")"
if [[ "${itemsCount}" != "0" ]]; then
	echo "Cart not empty after remove-item (items: ${itemsCount})" >&2
	cat "${bodyFile}" >&2
	exit 1
fi

echo "OK: Store API cart smoke test completed with Cart-Token."
