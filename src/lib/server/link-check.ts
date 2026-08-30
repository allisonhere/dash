import { Agent, request } from 'undici';
import { classifyError, classifyStatus, isCheckableUrl } from '$lib/link-check.js';
import type { LinkResult } from '$lib/link-check.js';
import { listBookmarks } from './bookmarks';

const TIMEOUT_MS = 8_000;
const CONCURRENCY = 6;
const MAX_REDIRECTS = 5;

// A browser user agent: plenty of sites answer a bare client with a 403, which
// would show up as a broken bookmark that opens fine when clicked.
const USER_AGENT =
	'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

// Homelab services mostly serve their own certs, so LAN hosts get a dispatcher
// that skips verification. Public hosts keep full TLS checks — a bad cert there
// is a real problem worth reporting.
const lanAgent = new Agent({ connect: { rejectUnauthorized: false } });

export type { LinkResult };

/**
 * Checks every bookmark, calling `onResult` as each one finishes so the caller
 * can stream progress. Results arrive in completion order, not list order.
 */
export async function checkBookmarkLinks(
	onResult: (result: LinkResult, done: number, total: number) => void,
	signal?: AbortSignal
): Promise<LinkResult[]> {
	const bookmarks = await listBookmarks();
	const results: LinkResult[] = [];
	let next = 0;
	let done = 0;

	const worker = async () => {
		while (next < bookmarks.length && !signal?.aborted) {
			const bookmark = bookmarks[next];
			next += 1;

			const result = await checkOne(bookmark, signal);
			results.push(result);
			done += 1;
			onResult(result, done, bookmarks.length);
		}
	};

	await Promise.all(
		Array.from({ length: Math.min(CONCURRENCY, bookmarks.length) }, () => worker())
	);

	return results;
}

export async function countBookmarksToCheck(): Promise<number> {
	return (await listBookmarks()).length;
}

type CheckableBookmark = { id: string; title: string; url: string; category: string };

async function checkOne(bookmark: CheckableBookmark, signal?: AbortSignal): Promise<LinkResult> {
	const base: LinkResult = {
		id: bookmark.id,
		title: bookmark.title,
		url: bookmark.url,
		category: bookmark.category,
		state: 'skipped',
		status: 0,
		detail: '',
		finalUrl: ''
	};

	if (!isCheckableUrl(bookmark.url)) {
		return { ...base, detail: 'Not an http(s) link' };
	}

	try {
		// HEAD is cheap, but a fair number of servers answer it with 405 or an
		// error, so anything other than a clear verdict is retried as a GET.
		let response = await send(bookmark.url, 'HEAD', signal);

		if (response.statusCode >= 400) {
			response = await send(bookmark.url, 'GET', signal);
		}

		const { state, detail } = classifyStatus(response.statusCode, response.finalUrl);

		return { ...base, state, detail, status: response.statusCode, finalUrl: response.finalUrl };
	} catch (error) {
		try {
			const response = await send(bookmark.url, 'GET', signal);
			const { state, detail } = classifyStatus(response.statusCode, response.finalUrl);

			return { ...base, state, detail, status: response.statusCode, finalUrl: response.finalUrl };
		} catch (retryError) {
			return { ...base, ...classifyError(retryError) };
		}
	}
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

// Redirects are followed by hand rather than with undici's interceptor, because
// the point of the check is to report *where* a bookmark ended up — and the
// interceptor's history does not include the final destination.
async function send(url: string, method: 'HEAD' | 'GET', signal?: AbortSignal) {
	let current = url;

	for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
		const response = await request(current, {
			method,
			signal,
			headersTimeout: TIMEOUT_MS,
			bodyTimeout: TIMEOUT_MS,
			dispatcher: isLanHost(current) ? lanAgent : undefined,
			headers: { 'user-agent': USER_AGENT, accept: '*/*' }
		});

		// The body has to be drained or the connection is held open until it times out.
		await response.body.dump();

		const location = header(response.headers.location);

		if (!REDIRECT_STATUSES.has(response.statusCode) || !location) {
			return {
				statusCode: response.statusCode,
				finalUrl: movedHost(url, current) ? current : ''
			};
		}

		current = new URL(location, current).toString();
	}

	throw new Error(`Too many redirects (stopped at ${current})`);
}

function header(value: string | string[] | undefined): string {
	return (Array.isArray(value) ? value[0] : value) ?? '';
}

// Only a redirect that leaves the host is worth reporting. Self-hosted apps
// almost all bounce "/" to "/login" or "/web", which is normal, not a move.
function movedHost(from: string, to: string): boolean {
	try {
		return new URL(from).host.toLowerCase() !== new URL(to).host.toLowerCase();
	} catch {
		return false;
	}
}

function isLanHost(url: string): boolean {
	try {
		const { hostname } = new URL(url);

		return (
			hostname === 'localhost' ||
			!hostname.includes('.') ||
			/\.(local|lan|home|internal)$/i.test(hostname) ||
			/^10\./.test(hostname) ||
			/^192\.168\./.test(hostname) ||
			/^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
			/^127\./.test(hostname)
		);
	} catch {
		return false;
	}
}
