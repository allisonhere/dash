/**
 * @typedef {Object} BookmarkUsage
 * @property {string} id
 * @property {string=} lastUsedAt
 * @property {number=} useCount
 */

/**
 * @template {BookmarkUsage} T
 * @param {T[]} bookmarks
 * @param {string} id
 * @param {Date} [visitedAt]
 * @returns {{ updated: boolean, bookmarks: T[] }}
 */
export function markBookmarkVisited(bookmarks, id, visitedAt = new Date()) {
	let updated = false;
	const lastUsedAt = visitedAt.toISOString();

	const nextBookmarks = bookmarks.map((bookmark) => {
		if (bookmark.id !== id) {
			return bookmark;
		}

		updated = true;
		return {
			...bookmark,
			lastUsedAt,
			useCount: Math.max(0, Number(bookmark.useCount) || 0) + 1
		};
	});

	return { updated, bookmarks: updated ? nextBookmarks : bookmarks };
}

/**
 * @template {BookmarkUsage} T
 * @param {T[]} bookmarks
 * @param {number} limit
 * @returns {T[]}
 */
export function listRecentBookmarks(bookmarks, limit) {
	return bookmarks
		.filter((bookmark) => typeof bookmark.lastUsedAt === 'string' && !Number.isNaN(Date.parse(bookmark.lastUsedAt)))
		.toSorted((left, right) => Date.parse(right.lastUsedAt ?? '') - Date.parse(left.lastUsedAt ?? ''))
		.slice(0, limit);
}
