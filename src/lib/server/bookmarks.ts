import { randomUUID } from 'node:crypto';
import { listRecentBookmarks as listRecent, markBookmarkVisited } from '$lib/bookmark-recency.js';
import { readCollection, writeCollection } from './store';

export type Bookmark = {
	id: string;
	title: string;
	url: string;
	category: string;
	icon: string;
	lastUsedAt?: string;
	useCount?: number;
	pinnedAt?: string;
};

export type BookmarkInput = Pick<Bookmark, 'title' | 'url' | 'category' | 'icon'>;

const DEFAULT_CATEGORY = 'General';
const DEFAULT_ICON = '↗';

export const MAX_PINNED = 4;

export async function listBookmarks(): Promise<Bookmark[]> {
	const parsed = await readCollection<unknown>('bookmarks');

	return parsed.filter(isBookmark).sort((left, right) => {
		const categorySort = left.category.localeCompare(right.category);
		return categorySort || left.title.localeCompare(right.title);
	});
}

export async function createBookmark(input: BookmarkInput) {
	const bookmarks = await listBookmarks();
	const bookmark = {
		id: randomUUID(),
		...input
	};

	await writeBookmarks([...bookmarks, bookmark]);
	return bookmark;
}

export async function updateBookmark(id: string, input: BookmarkInput) {
	const bookmarks = await listBookmarks();
	const index = bookmarks.findIndex((bookmark) => bookmark.id === id);

	if (index === -1) {
		return null;
	}

	const existing = bookmarks[index];
	const updated = {
		...existing,
		...input,
		id
	};
	bookmarks[index] = updated;
	await writeBookmarks(bookmarks);
	return updated;
}

export async function recordBookmarkVisit(id: string) {
	const bookmarks = await listBookmarks();
	const result = markBookmarkVisited(bookmarks, id);

	if (!result.updated) {
		return null;
	}

	await writeBookmarks(result.bookmarks);
	return result.bookmarks.find((bookmark) => bookmark.id === id) ?? null;
}

export function listRecentBookmarks(bookmarks: Bookmark[], limit = 8): Bookmark[] {
	return listRecent(bookmarks, limit);
}

// Pinned bookmarks keep the order they were pinned in, oldest first, so pinning
// a new one appends rather than reshuffling the row.
export function listPinnedBookmarks(bookmarks: Bookmark[]): Bookmark[] {
	return bookmarks
		.filter((bookmark) => Boolean(bookmark.pinnedAt))
		.sort((left, right) => Date.parse(left.pinnedAt ?? '') - Date.parse(right.pinnedAt ?? ''))
		.slice(0, MAX_PINNED);
}

export async function toggleBookmarkPin(id: string) {
	const bookmarks = await listBookmarks();
	const bookmark = bookmarks.find((candidate) => candidate.id === id);

	if (!bookmark) {
		return null;
	}

	if (bookmark.pinnedAt) {
		delete bookmark.pinnedAt;
	} else {
		const pinned = bookmarks.filter((candidate) => candidate.pinnedAt).length;

		if (pinned >= MAX_PINNED) {
			throw new Error(`You can pin up to ${MAX_PINNED} bookmarks. Unpin one first.`);
		}

		bookmark.pinnedAt = new Date().toISOString();
	}

	await writeBookmarks(bookmarks);
	return bookmark;
}

// Bookmarks reference their group by name, so renaming or deleting a group has
// to rewrite every bookmark pointing at the old name.
export async function reassignCategory(from: string, to: string) {
	const bookmarks = await listBookmarks();
	let changed = 0;

	const next = bookmarks.map((bookmark) => {
		if (bookmark.category !== from) {
			return bookmark;
		}

		changed += 1;
		return { ...bookmark, category: to };
	});

	if (changed > 0) {
		await writeBookmarks(next);
	}

	return changed;
}

export async function deleteBookmark(id: string) {
	const bookmarks = await listBookmarks();
	const nextBookmarks = bookmarks.filter((bookmark) => bookmark.id !== id);

	if (nextBookmarks.length === bookmarks.length) {
		return false;
	}

	await writeBookmarks(nextBookmarks);
	return true;
}

export function bookmarkInputFromForm(formData: FormData): BookmarkInput {
	const title = normalizeText(formData.get('title'));
	const url = normalizeUrl(formData.get('url'));
	const category = normalizeText(formData.get('category')) || DEFAULT_CATEGORY;
	const icon = normalizeText(formData.get('icon')) || DEFAULT_ICON;

	if (!title) {
		throw new Error('Title is required.');
	}

	if (!url) {
		throw new Error('A valid URL is required.');
	}

	return { title, url, category, icon };
}

function writeBookmarks(bookmarks: Bookmark[]) {
	return writeCollection('bookmarks', bookmarks);
}

function isBookmark(value: unknown): value is Bookmark {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const bookmark = value as Bookmark;
	return (
		typeof bookmark.id === 'string' &&
		typeof bookmark.title === 'string' &&
		typeof bookmark.url === 'string' &&
		typeof bookmark.category === 'string' &&
		typeof bookmark.icon === 'string' &&
		(bookmark.lastUsedAt === undefined || typeof bookmark.lastUsedAt === 'string') &&
		(bookmark.useCount === undefined || typeof bookmark.useCount === 'number') &&
		(bookmark.pinnedAt === undefined || typeof bookmark.pinnedAt === 'string')
	);
}

function normalizeText(value: FormDataEntryValue | null) {
	return typeof value === 'string' ? value.trim() : '';
}

function normalizeUrl(value: FormDataEntryValue | null) {
	const rawUrl = normalizeText(value);

	if (!rawUrl) {
		return '';
	}

	try {
		const url = new URL(rawUrl.includes('://') ? rawUrl : `https://${rawUrl}`);
		return url.toString();
	} catch {
		return '';
	}
}
