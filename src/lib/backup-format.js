export const BACKUP_FORMAT = 'dash-backup';
export const BACKUP_VERSION = 1;

/**
 * @typedef {{
 *   id: string;
 *   title: string;
 *   url: string;
 *   category: string;
 *   icon: string;
 *   lastUsedAt?: string;
 *   useCount?: number;
 *   pinnedAt?: string;
 * }} BackupBookmark
 */

/** @typedef {{ id: string; title: string; url: string }} BackupFeed */
/** @typedef {{ id: string; name: string; color: string }} BackupGroup */
/** @typedef {{ mode: 'builtin' | 'omarchy'; name: string }} BackupTheme */

/**
 * @typedef {{
 *   format: typeof BACKUP_FORMAT;
 *   version: typeof BACKUP_VERSION;
 *   exportedAt: string;
 *   bookmarks: BackupBookmark[];
 *   feeds: BackupFeed[];
 *   groups: BackupGroup[];
 *   theme: BackupTheme;
 * }} DashBackup
 */

/**
 * @param {{ bookmarks: BackupBookmark[]; feeds: BackupFeed[]; groups: BackupGroup[]; theme: BackupTheme }} data
 * @param {Date} [exportedAt]
 * @returns {DashBackup}
 */
export function createBackupDocument(data, exportedAt = new Date()) {
	return {
		format: BACKUP_FORMAT,
		version: BACKUP_VERSION,
		exportedAt: exportedAt.toISOString(),
		bookmarks: data.bookmarks,
		feeds: data.feeds,
		groups: data.groups,
		theme: data.theme
	};
}

/**
 * Parses and sanitizes a backup before any live data is replaced.
 * @param {string | unknown} input
 * @returns {DashBackup}
 */
export function parseBackupDocument(input) {
	let parsed = input;

	if (typeof input === 'string') {
		try {
			parsed = JSON.parse(input);
		} catch {
			throw new Error('The selected file is not valid JSON.');
		}
	}

	const root = record(parsed, 'The selected file is not a Dash backup.');

	if (root.format !== BACKUP_FORMAT || root.version !== BACKUP_VERSION) {
		throw new Error('This backup format or version is not supported.');
	}

	const exportedAt = dateString(root.exportedAt, 'Backup date');
	const bookmarks = array(root.bookmarks, 'Bookmarks').map(bookmark);
	const feeds = array(root.feeds, 'Feeds').map(feed);
	const groups = array(root.groups, 'Groups').map(group);
	const theme = backupTheme(root.theme);

	uniqueIds(bookmarks, 'bookmarks');
	uniqueIds(feeds, 'feeds');
	uniqueIds(groups, 'groups');
	uniqueValues(
		groups.map((item) => item.name.toLowerCase()),
		'group names'
	);

	return {
		format: BACKUP_FORMAT,
		version: BACKUP_VERSION,
		exportedAt,
		bookmarks,
		feeds,
		groups,
		theme
	};
}

/** @param {unknown} value @returns {BackupBookmark} */
function bookmark(value) {
	const item = record(value, 'A bookmark in the backup is invalid.');
	const url = requiredString(item.url, 'Bookmark URL');

	try {
		new URL(url);
	} catch {
		throw new Error(`Bookmark URL is invalid: ${url}`);
	}

	/** @type {BackupBookmark} */
	const result = {
		id: requiredString(item.id, 'Bookmark ID'),
		title: requiredString(item.title, 'Bookmark title'),
		url,
		category: requiredString(item.category, 'Bookmark category'),
		icon: requiredString(item.icon, 'Bookmark icon')
	};

	if (item.lastUsedAt !== undefined) {
		result.lastUsedAt = dateString(item.lastUsedAt, 'Bookmark last-used date');
	}

	if (item.pinnedAt !== undefined) {
		result.pinnedAt = dateString(item.pinnedAt, 'Bookmark pinned date');
	}

	if (item.useCount !== undefined) {
		if (!Number.isSafeInteger(item.useCount) || Number(item.useCount) < 0) {
			throw new Error('Bookmark use count must be a non-negative whole number.');
		}
		result.useCount = Number(item.useCount);
	}

	return result;
}

/** @param {unknown} value @returns {BackupFeed} */
function feed(value) {
	const item = record(value, 'A feed in the backup is invalid.');
	const url = requiredString(item.url, 'Feed URL');

	try {
		new URL(url);
	} catch {
		throw new Error(`Feed URL is invalid: ${url}`);
	}

	return {
		id: requiredString(item.id, 'Feed ID'),
		title: requiredString(item.title, 'Feed title'),
		url
	};
}

/** @param {unknown} value @returns {BackupGroup} */
function group(value) {
	const item = record(value, 'A group in the backup is invalid.');
	const color = optionalString(item.color, 'Group color');

	if (color && !/^#[0-9a-f]{6}$/i.test(color) && !/^--theme-[a-z0-9-]+$/i.test(color)) {
		throw new Error(`Group color is invalid: ${color}`);
	}

	return {
		id: requiredString(item.id, 'Group ID'),
		name: requiredString(item.name, 'Group name'),
		color
	};
}

/** @param {unknown} value @returns {BackupTheme} */
function backupTheme(value) {
	const item = record(value, 'The theme selection in the backup is invalid.');

	if (item.mode !== 'builtin' && item.mode !== 'omarchy') {
		throw new Error('Theme mode must be builtin or omarchy.');
	}

	return {
		mode: item.mode,
		name:
			item.mode === 'builtin'
				? requiredString(item.name, 'Theme name')
				: optionalString(item.name, 'Theme name')
	};
}

/** @param {unknown} value @param {string} message */
function record(value, message) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(message);
	}

	return /** @type {Record<string, unknown>} */ (value);
}

/** @param {unknown} value @param {string} label */
function array(value, label) {
	if (!Array.isArray(value)) {
		throw new Error(`${label} must be a list.`);
	}

	return value;
}

/** @param {unknown} value @param {string} label */
function requiredString(value, label) {
	if (typeof value !== 'string' || !value.trim()) {
		throw new Error(`${label} is required.`);
	}

	return value.trim();
}

/** @param {unknown} value @param {string} label */
function optionalString(value, label) {
	if (typeof value !== 'string') {
		throw new Error(`${label} must be text.`);
	}

	return value.trim();
}

/** @param {unknown} value @param {string} label */
function dateString(value, label) {
	const result = requiredString(value, label);
	if (!Number.isFinite(Date.parse(result))) {
		throw new Error(`${label} is invalid.`);
	}
	return result;
}

/** @param {{ id: string }[]} items @param {string} label */
function uniqueIds(items, label) {
	uniqueValues(
		items.map((item) => item.id),
		label
	);
}

/** @param {string[]} values @param {string} label */
function uniqueValues(values, label) {
	if (new Set(values).size !== values.length) {
		throw new Error(`The backup contains duplicate ${label}.`);
	}
}
