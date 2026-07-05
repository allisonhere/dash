import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { listRecentBookmarks, markBookmarkVisited } from './bookmark-recency.js';

const baseBookmark = {
	id: 'a',
	title: 'Alpha',
	url: 'https://alpha.example',
	category: 'Apps',
	icon: '↗'
};

describe('bookmark recency helpers', () => {
	it('keeps existing bookmarks valid without usage metadata', () => {
		const recent = listRecentBookmarks([baseBookmark], 8);

		assert.deepEqual(recent, []);
	});

	it('marks a bookmark visited with last-used time and incremented count', () => {
		const result = markBookmarkVisited(
			[
				{ ...baseBookmark, id: 'a', useCount: 2, lastUsedAt: '2026-01-01T00:00:00.000Z' },
				{ ...baseBookmark, id: 'b', title: 'Beta' }
			],
			'a',
			new Date('2026-07-05T12:34:56.000Z')
		);

		assert.equal(result.updated, true);
		/** @type {any} */
		const visitedBookmark = result.bookmarks[0];
		/** @type {any} */
		const untouchedBookmark = result.bookmarks[1];
		assert.equal(visitedBookmark.lastUsedAt, '2026-07-05T12:34:56.000Z');
		assert.equal(visitedBookmark.useCount, 3);
		assert.equal(untouchedBookmark.lastUsedAt, undefined);
	});

	it('reports no update for an unknown bookmark id', () => {
		const result = markBookmarkVisited([baseBookmark], 'missing', new Date('2026-07-05T12:34:56.000Z'));

		assert.equal(result.updated, false);
		assert.deepEqual(result.bookmarks, [baseBookmark]);
	});

	it('returns the newest distinct visited bookmarks up to the requested limit', () => {
		const bookmarks = [
			{ ...baseBookmark, id: 'old', title: 'Old', lastUsedAt: '2026-07-01T00:00:00.000Z' },
			{ ...baseBookmark, id: 'never', title: 'Never' },
			{ ...baseBookmark, id: 'new', title: 'New', lastUsedAt: '2026-07-05T00:00:00.000Z' },
			{ ...baseBookmark, id: 'middle', title: 'Middle', lastUsedAt: '2026-07-03T00:00:00.000Z' }
		];

		assert.deepEqual(
			listRecentBookmarks(bookmarks, 2).map((bookmark) => bookmark.id),
			['new', 'middle']
		);
	});
});
