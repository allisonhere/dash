// Classification for bookmark link checks. Kept free of any network code so the
// rules stay testable: the server module does the fetching and hands the raw
// HTTP status or thrown error in here.

/**
 * @typedef {'ok' | 'redirect' | 'blocked' | 'broken' | 'unreachable' | 'skipped'} LinkState
 */

/**
 * @typedef {Object} LinkResult
 * @property {string} id
 * @property {string} title
 * @property {string} url
 * @property {string} category
 * @property {LinkState} state
 * @property {number} status HTTP status, or 0 when the request never completed.
 * @property {string} detail Short human-readable explanation.
 * @property {string} finalUrl Set only when the link redirected somewhere else.
 */

// Sites that dislike automated requests answer these rather than serving the
// page. The link still works in a browser, so they are a warning, not a break.
const BLOCKED_STATUSES = new Set([401, 403, 405, 406, 429, 999]);

/** @type {Record<string, string>} */
const ERROR_MESSAGES = {
	ENOTFOUND: 'Host not found',
	EAI_AGAIN: 'DNS lookup failed',
	ECONNREFUSED: 'Connection refused',
	ECONNRESET: 'Connection reset',
	EHOSTUNREACH: 'Host unreachable',
	ENETUNREACH: 'Network unreachable',
	ETIMEDOUT: 'Timed out',
	UND_ERR_CONNECT_TIMEOUT: 'Timed out',
	UND_ERR_HEADERS_TIMEOUT: 'Timed out',
	UND_ERR_BODY_TIMEOUT: 'Timed out',
	CERT_HAS_EXPIRED: 'TLS certificate expired',
	DEPTH_ZERO_SELF_SIGNED_CERT: 'Self-signed certificate',
	UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'Certificate could not be verified'
};

/**
 * Only http(s) links can be checked; anything else (mailto:, magnet:, a custom
 * app scheme) is reported as skipped rather than broken.
 * @param {string} url
 * @returns {boolean}
 */
export function isCheckableUrl(url) {
	try {
		const protocol = new URL(url).protocol;
		return protocol === 'http:' || protocol === 'https:';
	} catch {
		return false;
	}
}

/**
 * @param {number} status
 * @param {string} [finalUrl] Resolved URL after redirects, when it differs.
 * @returns {{ state: LinkState, detail: string }}
 */
export function classifyStatus(status, finalUrl = '') {
	if (BLOCKED_STATUSES.has(status)) {
		return { state: 'blocked', detail: `HTTP ${status} — likely blocking automated checks` };
	}

	if (status >= 400) {
		return { state: 'broken', detail: `HTTP ${status}` };
	}

	if (status >= 200) {
		return finalUrl
			? { state: 'redirect', detail: `Redirects to ${finalUrl}` }
			: { state: 'ok', detail: `HTTP ${status}` };
	}

	return { state: 'broken', detail: `Unexpected HTTP ${status}` };
}

/**
 * @param {unknown} error
 * @returns {{ state: LinkState, detail: string }}
 */
export function classifyError(error) {
	const code = errorCode(error);
	const known = code && ERROR_MESSAGES[code];

	if (known) {
		return { state: 'unreachable', detail: known };
	}

	if (error instanceof Error && /abort|timeout/i.test(error.message)) {
		return { state: 'unreachable', detail: 'Timed out' };
	}

	return {
		state: 'unreachable',
		detail: error instanceof Error && error.message ? error.message : 'Request failed'
	};
}

/**
 * Node nests the useful code on `cause` for fetch/undici failures.
 * @param {unknown} error
 * @returns {string}
 */
function errorCode(error) {
	let current = error;

	for (let depth = 0; current && depth < 4; depth += 1) {
		const code = /** @type {{ code?: unknown, cause?: unknown }} */ (current).code;

		if (typeof code === 'string' && ERROR_MESSAGES[code]) {
			return code;
		}

		current = /** @type {{ cause?: unknown }} */ (current).cause;
	}

	return '';
}

/**
 * @param {LinkResult[]} results
 * @returns {Record<LinkState, number> & { total: number, problems: number }}
 */
export function summarize(results) {
	const summary = {
		ok: 0,
		redirect: 0,
		blocked: 0,
		broken: 0,
		unreachable: 0,
		skipped: 0,
		total: results.length,
		problems: 0
	};

	for (const result of results) {
		summary[result.state] += 1;
	}

	summary.problems = summary.broken + summary.unreachable;
	return summary;
}

// Worst first, so the list opens on the links that actually need attention.
const STATE_ORDER = ['broken', 'unreachable', 'blocked', 'redirect', 'skipped', 'ok'];

/**
 * @param {LinkResult[]} results
 * @returns {LinkResult[]}
 */
export function sortBySeverity(results) {
	return results.toSorted((left, right) => {
		const bySeverity = STATE_ORDER.indexOf(left.state) - STATE_ORDER.indexOf(right.state);
		return bySeverity || left.title.localeCompare(right.title);
	});
}
