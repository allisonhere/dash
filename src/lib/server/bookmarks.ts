import { randomUUID } from 'node:crypto';
import { readCollection, writeCollection } from './store';

export type Bookmark = {
	id: string;
	title: string;
	url: string;
	category: string;
	icon: string;
};

export type BookmarkInput = Omit<Bookmark, 'id'>;

const DEFAULT_CATEGORY = 'General';
const DEFAULT_ICON = '↗';

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

	const updated = { id, ...input };
	bookmarks[index] = updated;
	await writeBookmarks(bookmarks);
	return updated;
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
		typeof bookmark.icon === 'string'
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
