/**
 * URL helpers (ES5-compatible output via esbuild).
 */

export function addQueryArgs(baseUrl, args) {
	var url;

	try {
		url = new URL(baseUrl, window.location.origin);
	} catch (e) {
		return baseUrl;
	}

	Object.keys(args || {}).forEach(function(key) {
		if (typeof args[key] === 'undefined' || args[key] === null) {
			return;
		}
		url.searchParams.set(key, String(args[key]));
	});

	return url.toString();
}
