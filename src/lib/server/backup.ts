import { createBackupDocument, parseBackupDocument } from '$lib/backup-format.js';
import { listBookmarks } from './bookmarks';
import { listFeeds } from './feeds';
import { listGroups } from './groups';
import { readThemeSelection, writeThemeSelection, isKnownTheme } from './theme-selection';
import { listCustomThemes, writeCustomThemes, type CustomTheme } from './custom-themes';
import { writeCollection } from './store';
import { DEFAULT_BUILTIN } from './builtin-themes';

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
		theme: readThemeSelection(),
		customThemes: listCustomThemes()
	});
}

export async function restoreDashBackup(raw: string) {
	const backup = parseBackupDocument(raw);
	const previous = await createDashBackup();
	const previousThemes = listCustomThemes();

	try {
		await writeCollection('bookmarks', backup.bookmarks);
		await writeCollection('feeds', backup.feeds);
		await writeCollection('groups', backup.groups);
		writeCustomThemes(backup.customThemes as CustomTheme[]);

		// The selection is validated only now: a "custom" pick is only known once
		// its theme has been written back above. An unknown pick is not fatal —
		// fall back to the default builtin rather than losing the whole restore.
		writeThemeSelection(
			isKnownTheme(backup.theme.name)
				? backup.theme
				: { mode: 'builtin', name: DEFAULT_BUILTIN }
		);
	} catch (error) {
		await Promise.allSettled([
			writeCollection('bookmarks', previous.bookmarks),
			writeCollection('feeds', previous.feeds),
			writeCollection('groups', previous.groups),
			Promise.resolve().then(() => writeCustomThemes(previousThemes)),
			Promise.resolve().then(() => writeThemeSelection(previous.theme))
		]);

		throw new Error(
			`Restore failed. Dash attempted to put the previous data back. ${message(error)}`
		);
	}

	return {
		bookmarks: backup.bookmarks.length,
		feeds: backup.feeds.length,
		groups: backup.groups.length,
		themes: backup.customThemes.length
	};
}

function message(error: unknown) {
	return error instanceof Error ? error.message : 'Unable to write the backup data.';
}
