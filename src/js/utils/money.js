/**
 * Price formatting helpers for Store API payloads.
 */

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
		decimalSeparator: (currencyData && typeof currencyData.currency_decimal_separator !== 'undefined') ? currencyData.currency_decimal_separator : '.',
		thousandSeparator: (currencyData && typeof currencyData.currency_thousand_separator !== 'undefined') ? currencyData.currency_thousand_separator : ',',
		prefix: (currencyData && currencyData.currency_prefix) ? String(currencyData.currency_prefix) : '',
		suffix: (currencyData && currencyData.currency_suffix) ? String(currencyData.currency_suffix) : ''
	};
}

function normalizeMinorValue(rawValue) {
	var rawString = (rawValue === null || typeof rawValue === 'undefined') ? '' : String(rawValue);
	rawString = rawString.trim();
	if (!rawString) {
		return null;
	}

	var sign = '';
	if (rawString[0] === '-') {
		sign = '-';
		rawString = rawString.slice(1);
	} else if (rawString[0] === '+') {
		rawString = rawString.slice(1);
	}

	if (!/^\d+$/.test(rawString)) {
		var fallbackIntValue = parseInt(rawString, 10);
		if (isNaN(fallbackIntValue)) {
			return null;
		}
		sign = fallbackIntValue < 0 ? '-' : sign;
		rawString = String(Math.abs(fallbackIntValue));
	}

	rawString = rawString.replace(/^0+(?=\d)/, '');
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

	var whole = '0';
	var decimals = '';

	if (minorUnit === 0) {
		whole = rawDigits;
	} else if (rawDigits.length <= minorUnit) {
		whole = '0';
		decimals = rawDigits.padStart(minorUnit, '0');
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

export function moneyFormatValue(rawValue, currencyData) {
	var parts = formatMinorToParts(rawValue, currencyData);
	if (!parts) {
		return '';
	}

	var numberString = parts.whole + (parts.minorUnit > 0 ? (parts.decimalSeparator + parts.decimals) : '');
	return parts.sign + parts.prefix + numberString + parts.suffix;
}

function createCurrencySymbolSpan(symbolText) {
	var symbol = document.createElement('span');
	symbol.className = 'woocommerce-Price-currencySymbol';
	symbol.textContent = symbolText;
	return symbol;
}

export function createPriceSpan(rawValue, currencyData) {
	var span = document.createElement('span');
	span.className = 'woocommerce-Price-amount amount';

	var bdi = document.createElement('bdi');
	var parts = formatMinorToParts(rawValue, currencyData);
	if (!parts) {
		bdi.textContent = '';
		span.appendChild(bdi);
		return span;
	}

	if (parts.sign) {
		bdi.appendChild(document.createTextNode(parts.sign));
	}

	var numberString = parts.whole + (parts.minorUnit > 0 ? (parts.decimalSeparator + parts.decimals) : '');

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

export function getCartItemCount(cart) {
	if (cart && typeof cart.items_count !== 'undefined') {
		return parseInt(cart.items_count, 10) || 0;
	}
	if (!cart || !cart.items || !cart.items.length) {
		return 0;
	}
	return cart.items.reduce(function(sum, item) {
		return sum + (parseInt(item.quantity, 10) || 0);
	}, 0);
}
