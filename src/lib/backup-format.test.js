import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createBackupDocument, parseBackupDocument } from './backup-format.js';

const sample = {
	bookmarks: [
		{
			id: 'bookmark-1',
			title: 'Example',
			url: 'https://example.com/',
			category: 'General',
			icon: '↗',
			useCount: 2,
			pinnedAt: '2026-08-09T12:00:00.000Z'
		}
	],
	feeds: [{ id: 'feed-1', title: 'Example feed', url: 'https://example.com/feed.xml' }],
	groups: [{ id: 'group-1', name: 'General', color: '--theme-accent' }],
	theme: { mode: /** @type {const} */ ('builtin'), name: 'aetheria' }
};

describe('Dash backup format', () => {
	it('round-trips all user-managed collections and theme selection', () => {
		const document = createBackupDocument(sample, new Date('2026-08-09T13:00:00.000Z'));
		assert.deepEqual(parseBackupDocument(JSON.stringify(document)), document);
	});

	it('rejects an unsupported backup version', () => {
		const document = { ...createBackupDocument(sample), version: 2 };
		assert.throws(() => parseBackupDocument(document), /not supported/);
	});

	it('rejects malformed collection entries before restore', () => {
		const document = createBackupDocument(sample);
		const malformed = {
			...document,
			bookmarks: [{ ...document.bookmarks[0], url: 'not a url' }]
		};
		assert.throws(() => parseBackupDocument(malformed), /Bookmark URL is invalid/);
	});

	it('rejects duplicate ids', () => {
		const document = createBackupDocument({
			...sample,
			feeds: [...sample.feeds, { ...sample.feeds[0] }]
		});
		assert.throws(() => parseBackupDocument(document), /duplicate feeds/);
	});

	it('rejects removed theme modes', () => {
		const document = createBackupDocument({
			...sample,
			theme: { mode: 'external', name: '' }
		});
		assert.throws(() => parseBackupDocument(document), /Theme mode must be builtin/);
	});
});
