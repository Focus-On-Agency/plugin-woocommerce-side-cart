/**
 * DOM utilities (no dependencies).
 */

export function onReady(callback) {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', callback);
		return;
	}
	callback();
}

export function qs(selector, context) {
	return (context || document).querySelector(selector);
}

export function qsa(selector, context) {
	return Array.prototype.slice.call((context || document).querySelectorAll(selector));
}

export function clearNode(node) {
	while (node && node.firstChild) {
		node.removeChild(node.firstChild);
	}
}

export function setBusy(element, isBusy) {
	if (!element) {
		return;
	}

	if (isBusy) {
		element.setAttribute('aria-busy', 'true');
		element.style.opacity = '0.6';
		element.style.pointerEvents = 'none';
		return;
	}

	element.removeAttribute('aria-busy');
	element.style.opacity = '';
	element.style.pointerEvents = '';
}
