#!/usr/bin/env bash
set -euo pipefail

wpBaseUrl="${WP_BASE_URL:-http://localhost:8080}"
storeApiBase="${wpBaseUrl}/wp-json/wc/store/v1"

if [[ ! -f ".docker/product-id" ]]; then
	echo "File mancante: .docker/product-id. Esegui prima: bash scripts/wp-setup.sh" >&2
	exit 1
fi

productId="$(cat .docker/product-id)"
if [[ -z "${productId}" ]]; then
	echo "Product ID vuoto in .docker/product-id" >&2
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

echo "GET cart (ottenere Cart-Token)"
read -r httpCode cartToken storeApiNonce bodyFile < <(requestJson "GET" "${storeApiBase}/cart")
if [[ "${httpCode}" != "200" ]]; then
	echo "GET cart fallita (HTTP ${httpCode})" >&2
	cat "${bodyFile}" >&2
	exit 1
fi
if [[ -z "${cartToken}" ]]; then
	echo "Cart-Token non trovato in risposta (GET cart)" >&2
	exit 1
fi
if [[ -z "${storeApiNonce}" ]]; then
	echo "Store API Nonce non trovato in risposta (GET cart). Proseguo comunque." >&2
fi

echo "POST add-item"
read -r httpCode cartToken storeApiNonce bodyFile < <(requestJson "POST" "${storeApiBase}/cart/add-item" "{\"id\":${productId},\"quantity\":2}" "${cartToken}" "${storeApiNonce}")
if [[ "${httpCode}" != "200" && "${httpCode}" != "201" ]]; then
	echo "add-item fallita (HTTP ${httpCode})" >&2
	cat "${bodyFile}" >&2
	exit 1
fi

cartItemKey="$(extractJson "${bodyFile}" "data['items'][0]['key']")"
if [[ -z "${cartItemKey}" ]]; then
	echo "Impossibile estrarre item key dal carrello dopo add-item" >&2
	cat "${bodyFile}" >&2
	exit 1
fi

echo "POST update-item"
read -r httpCode cartToken storeApiNonce bodyFile < <(requestJson "POST" "${storeApiBase}/cart/update-item" "{\"key\":\"${cartItemKey}\",\"quantity\":3}" "${cartToken}" "${storeApiNonce}")
if [[ "${httpCode}" != "200" && "${httpCode}" != "201" ]]; then
	echo "update-item fallita (HTTP ${httpCode})" >&2
	cat "${bodyFile}" >&2
	exit 1
fi

updatedQty="$(extractJson "${bodyFile}" "next((i.get('quantity') for i in data.get('items',[]) if i.get('key')=='${cartItemKey}'), '')")"
if [[ "${updatedQty}" != "3" ]]; then
	echo "Quantità non aggiornata (atteso 3, ottenuto ${updatedQty})" >&2
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
		echo "SKIP: coupon endpoint non disponibile o coupons disabilitati (HTTP ${httpCode})"
	else
		if [[ "${httpCode}" != "200" && "${httpCode}" != "201" ]]; then
			echo "apply-coupon fallita (HTTP ${httpCode})" >&2
			cat "${bodyFile}" >&2
			exit 1
		fi

		hasCoupon="$(extractJson "${bodyFile}" "any((c.get('code','').lower()=='${couponCodeReq}') for c in data.get('coupons', []))")"
		if [[ "${hasCoupon}" != "True" ]]; then
			echo "Coupon non presente nel carrello dopo apply-coupon" >&2
			cat "${bodyFile}" >&2
			exit 1
		fi

		echo "POST remove-coupon (${couponCodeReq})"
		read -r httpCode cartToken storeApiNonce bodyFile < <(requestJson "POST" "${storeApiBase}/cart/remove-coupon" "{\"code\":\"${couponCodeReq}\"}" "${cartToken}" "${storeApiNonce}")
		if [[ "${httpCode}" != "200" && "${httpCode}" != "201" ]]; then
			echo "remove-coupon fallita (HTTP ${httpCode})" >&2
			cat "${bodyFile}" >&2
			exit 1
		fi

		hasCoupon="$(extractJson "${bodyFile}" "any((c.get('code','').lower()=='${couponCodeReq}') for c in data.get('coupons', []))")"
		if [[ "${hasCoupon}" != "False" ]]; then
			echo "Coupon ancora presente nel carrello dopo remove-coupon" >&2
			cat "${bodyFile}" >&2
			exit 1
		fi
	fi
else
	echo "SKIP: coupon test (imposta COUPON_CODE oppure crea .docker/coupon-code)"
fi

echo "POST remove-item"
read -r httpCode cartToken storeApiNonce bodyFile < <(requestJson "POST" "${storeApiBase}/cart/remove-item" "{\"key\":\"${cartItemKey}\"}" "${cartToken}" "${storeApiNonce}")
if [[ "${httpCode}" != "200" && "${httpCode}" != "201" ]]; then
	echo "remove-item fallita (HTTP ${httpCode})" >&2
	cat "${bodyFile}" >&2
	exit 1
fi

echo "GET cart (verifica vuoto)"
read -r httpCode cartToken storeApiNonce bodyFile < <(requestJson "GET" "${storeApiBase}/cart" "" "${cartToken}" "${storeApiNonce}")
if [[ "${httpCode}" != "200" ]]; then
	echo "GET cart fallita (HTTP ${httpCode})" >&2
	cat "${bodyFile}" >&2
	exit 1
fi

itemsCount="$(extractJson "${bodyFile}" "len(data.get('items', []))")"
if [[ "${itemsCount}" != "0" ]]; then
	echo "Carrello non vuoto dopo remove-item (items: ${itemsCount})" >&2
	cat "${bodyFile}" >&2
	exit 1
fi

echo "OK: smoke test Store API cart completato con Cart-Token."
