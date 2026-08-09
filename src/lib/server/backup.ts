import { createBackupDocument, parseBackupDocument } from '$lib/backup-format.js';
import { listBookmarks } from './bookmarks';
import { listFeeds } from './feeds';
import { listGroups } from './groups';
import { readThemeSelection, writeThemeSelection } from './theme-selection';
import { writeCollection } from './store';
import { isBuiltinTheme } from './builtin-themes';

export async function createDashBackup() {
	const [bookmarks, feeds, groups] = await Promise.all([
		listBookmarks(),
		listFeeds(),
		listGroups()
	]);

	return createBackupDocument({
		bookmarks,
		feeds,
		groups,
		theme: readThemeSelection()
	});
}

export async function restoreDashBackup(raw: string) {
	const backup = parseBackupDocument(raw);

	if (backup.theme.mode === 'builtin' && !isBuiltinTheme(backup.theme.name)) {
		throw new Error(`Unknown built-in theme: ${backup.theme.name}`);
	}

	const previous = await createDashBackup();

	try {
		await writeCollection('bookmarks', backup.bookmarks);
		await writeCollection('feeds', backup.feeds);
		await writeCollection('groups', backup.groups);
		writeThemeSelection(backup.theme);
	} catch (error) {
		await Promise.allSettled([
			writeCollection('bookmarks', previous.bookmarks),
			writeCollection('feeds', previous.feeds),
			writeCollection('groups', previous.groups),
			Promise.resolve().then(() => writeThemeSelection(previous.theme))
		]);

		throw new Error(
			`Restore failed. Dash attempted to put the previous data back. ${message(error)}`
		);
	}

	return {
		bookmarks: backup.bookmarks.length,
		feeds: backup.feeds.length,
		groups: backup.groups.length
	};
}

function message(error: unknown) {
	return error instanceof Error ? error.message : 'Unable to write the backup data.';
}
