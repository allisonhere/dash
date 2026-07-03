import { XMLParser } from 'fast-xml-parser';
import type { Feed } from './feeds';

export type NewsItem = {
	id: string;
	feedId: string;
	feedTitle: string;
	title: string;
	url: string;
	summary: string;
	image: string | null;
	publishedAt: string | null;
};

export type FeedResult = {
	feed: Feed;
	status: 'ok' | 'error';
	error: string | null;
	items: NewsItem[];
};

const CACHE_TTL_MS = 5 * 60_000;
const FETCH_TIMEOUT_MS = 10_000;
const SUMMARY_LENGTH = 220;
const MAX_ITEMS_PER_FEED = 30;

const cache = new Map<string, { fetchedAt: number; result: FeedResult }>();

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: '@_',
	isArray: (name) => ['item', 'entry', 'link', 'enclosure', 'media:content'].includes(name)
});

export async function loadNews(feeds: Feed[]): Promise<FeedResult[]> {
	return Promise.all(feeds.map((feed) => loadFeed(feed)));
}

export function clearNewsCache() {
	cache.clear();
}

async function loadFeed(feed: Feed): Promise<FeedResult> {
	const cached = cache.get(feed.url);

	if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
		return { ...cached.result, feed };
	}

	try {
		const xml = await fetchText(feed.url);
		const parsed = parseFeed(xml, feed);
		const result: FeedResult = { feed, status: 'ok', error: null, items: parsed.items };
		cache.set(feed.url, { fetchedAt: Date.now(), result });
		return result;
	} catch (error) {
		// Keep showing the last good items when a refresh fails.
		return {
			feed,
			status: 'error',
			error: error instanceof Error ? error.message : 'Failed to load feed.',
			items: cached?.result.items ?? []
		};
	}
}

/**
 * Resolve a user-supplied URL to a feed: accepts direct RSS/Atom URLs and
 * HTML pages that advertise a feed via <link rel="alternate">.
 */
export async function probeFeed(rawUrl: string): Promise<{ url: string; title: string }> {
	const url = normalizeUrl(rawUrl);
	const body = await fetchText(url);
	const direct = tryParseFeed(body, url);

	if (direct) {
		return { url, title: direct.title };
	}

	const discovered = discoverFeedUrl(body, url);

	if (!discovered) {
		throw new Error('No RSS or Atom feed found at that URL.');
	}

	const feedBody = await fetchText(discovered);
	const parsed = tryParseFeed(feedBody, discovered);

	if (!parsed) {
		throw new Error('The advertised feed could not be parsed.');
	}

	return { url: discovered, title: parsed.title };
}

async function fetchText(url: string): Promise<string> {
	const response = await fetch(url, {
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		headers: {
			'User-Agent': 'custom-dash/0.1 (personal dashboard)',
			Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html'
		}
	});

	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`);
	}

	return response.text();
}

function tryParseFeed(body: string, url: string): { title: string } | null {
	try {
		const feed = { id: 'probe', title: '', url };
		const parsed = parseFeed(body, feed);
		return { title: parsed.title || hostOf(url) };
	} catch {
		return null;
	}
}

function discoverFeedUrl(html: string, baseUrl: string): string | null {
	const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];

	for (const tag of linkTags) {
		if (!/rel=["']?alternate["']?/i.test(tag)) {
			continue;
		}

		if (!/type=["']?application\/(rss|atom)\+xml/i.test(tag)) {
			continue;
		}

		const href = tag.match(/href=["']([^"']+)["']/i)?.[1];

		if (href) {
			try {
				return new URL(href, baseUrl).toString();
			} catch {
				continue;
			}
		}
	}

	return null;
}

function parseFeed(xml: string, feed: Feed): { title: string; items: NewsItem[] } {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const doc = parser.parse(xml) as Record<string, any>;

	const channel = (firstOf(doc.rss?.channel) ?? firstOf(doc['rdf:RDF']?.channel)) as
		| Record<string, unknown>
		| undefined;
	const atom = doc.feed as Record<string, unknown> | undefined;

	if (channel) {
		const rawItems = asArray(channel.item ?? doc['rdf:RDF']?.item) as Record<string, unknown>[];
		return {
			title: text(channel.title),
			items: rawItems.slice(0, MAX_ITEMS_PER_FEED).map((item, index) => rssItem(item, feed, index))
		};
	}

	if (atom) {
		const rawItems = asArray(atom.entry) as Record<string, unknown>[];
		return {
			title: text(atom.title),
			items: rawItems.slice(0, MAX_ITEMS_PER_FEED).map((entry, index) => atomItem(entry, feed, index))
		};
	}

	throw new Error('Not a recognizable RSS or Atom feed.');
}

function rssItem(item: Record<string, unknown>, feed: Feed, index: number): NewsItem {
	const url = text(item.link) || text(item.guid);
	const html = text(item['content:encoded']) || text(item.description);

	return {
		id: text(item.guid) || url || `${feed.id}-${index}`,
		feedId: feed.id,
		feedTitle: feed.title,
		title: decodeEntities(text(item.title)) || 'Untitled',
		url,
		summary: summarize(html),
		image: itemImage(item, html),
		publishedAt: toIsoDate(text(item.pubDate) || text(item['dc:date']))
	};
}

function atomItem(entry: Record<string, unknown>, feed: Feed, index: number): NewsItem {
	const links = asArray(entry.link) as Array<Record<string, unknown>>;
	const alternate =
		links.find((link) => !link['@_rel'] || link['@_rel'] === 'alternate') ?? links[0];
	const url = String(alternate?.['@_href'] ?? '');
	const html = text(entry.content) || text(entry.summary);

	return {
		id: text(entry.id) || url || `${feed.id}-${index}`,
		feedId: feed.id,
		feedTitle: feed.title,
		title: decodeEntities(text(entry.title)) || 'Untitled',
		url,
		summary: summarize(html),
		image: itemImage(entry, html),
		publishedAt: toIsoDate(text(entry.published) || text(entry.updated))
	};
}

function itemImage(item: Record<string, unknown>, html: string): string | null {
	for (const enclosure of asArray(item.enclosure) as Array<Record<string, unknown>>) {
		const type = String(enclosure['@_type'] ?? '');
		const url = String(enclosure['@_url'] ?? '');

		if (url && (type.startsWith('image/') || /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(url))) {
			return url;
		}
	}

	for (const media of asArray(item['media:content']) as Array<Record<string, unknown>>) {
		const url = String(media['@_url'] ?? '');
		const medium = String(media['@_medium'] ?? '');
		const type = String(media['@_type'] ?? '');

		if (url && (medium === 'image' || type.startsWith('image/') || (!medium && !type))) {
			return url;
		}
	}

	const thumbnail = firstOf(item['media:thumbnail']) as Record<string, unknown> | undefined;

	if (thumbnail?.['@_url']) {
		return String(thumbnail['@_url']);
	}

	const inline = html.match(/<img\b[^>]*src=["']([^"']+)["']/i)?.[1];
	return inline && /^https?:\/\//.test(inline) ? inline : null;
}

function summarize(html: string): string {
	const stripped = decodeEntities(html.replace(/<[^>]+>/g, ' '))
		.replaceAll(/\s+/g, ' ')
		.trim();

	if (stripped.length <= SUMMARY_LENGTH) {
		return stripped;
	}

	return `${stripped.slice(0, SUMMARY_LENGTH).replace(/\s+\S*$/, '')}…`;
}

function decodeEntities(value: string): string {
	// Named entities first: feeds often double-encode (&amp;#8217;), so this
	// unwraps the outer layer before the numeric pass resolves the code point.
	return value
		.replaceAll('&amp;', '&')
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&quot;', '"')
		.replaceAll('&apos;', "'")
		.replaceAll('&nbsp;', ' ')
		.replaceAll(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replaceAll(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function toIsoDate(value: string): string | null {
	if (!value) {
		return null;
	}

	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function text(value: unknown): string {
	if (typeof value === 'string') {
		return value.trim();
	}

	if (typeof value === 'number') {
		return String(value);
	}

	if (Array.isArray(value)) {
		return text(value[0]);
	}

	if (value && typeof value === 'object') {
		return text((value as Record<string, unknown>)['#text']);
	}

	return '';
}

function asArray(value: unknown): unknown[] {
	if (value == null) {
		return [];
	}

	return Array.isArray(value) ? value : [value];
}

function firstOf(value: unknown): unknown {
	return Array.isArray(value) ? value[0] : value;
}

function hostOf(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return url;
	}
}

function normalizeUrl(rawUrl: string): string {
	const trimmed = rawUrl.trim();

	if (!trimmed) {
		throw new Error('A feed URL is required.');
	}

	try {
		return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).toString();
	} catch {
		throw new Error('That is not a valid URL.');
	}
}
