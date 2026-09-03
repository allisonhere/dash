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
		const document = { ...createBackupDocument(sample), version: 99 };
		assert.throws(() => parseBackupDocument(document), /not supported/);
	});

	it('restores a v1 backup with no customThemes field', () => {
		const { customThemes, ...rest } = createBackupDocument(sample);
		void customThemes;
		const v1 = { ...rest, version: 1 };

		const parsed = parseBackupDocument(v1);
		assert.equal(parsed.version, 1);
		assert.deepEqual(parsed.customThemes, []);
	});

	it('round-trips imported custom themes', () => {
		const withTheme = {
			...sample,
			theme: /** @type {const} */ ({ mode: 'custom', name: 'osaka-jade' }),
			customThemes: [
				{
					id: 'theme-1',
					slug: 'osaka-jade',
					label: 'Osaka Jade',
					mode: /** @type {const} */ ('dark'),
					colors: { background: '#111111', foreground: '#eeeeee', accent: '#14b9b5' },
					settings: { opacity: '0.95' },
					source: 'https://github.com/user/omarchy-osaka-jade-theme',
					importedAt: '2026-09-01T00:00:00.000Z'
				}
			]
		};

		const document = createBackupDocument(withTheme, new Date('2026-09-02T00:00:00.000Z'));
		assert.deepEqual(parseBackupDocument(JSON.stringify(document)), document);
	});

	it('rejects a custom theme with a non-hex colour', () => {
		const document = createBackupDocument({
			...sample,
			customThemes: [
				{
					id: 'theme-1',
					slug: 'bad',
					label: 'Bad',
					mode: /** @type {const} */ ('dark'),
					colors: { background: 'rebeccapurple' },
					settings: {},
					source: null,
					importedAt: '2026-09-01T00:00:00.000Z'
				}
			]
		});
		assert.throws(() => parseBackupDocument(document), /invalid value/);
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
			theme: /** @type {any} */ ({ mode: 'external', name: '' })
		});
		assert.throws(() => parseBackupDocument(document), /Theme mode must be builtin/);
	});
});
