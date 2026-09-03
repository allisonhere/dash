import { fail } from '@sveltejs/kit';
import { countByGroup, createGroup, deleteGroup, listGroups, updateGroup } from '$lib/server/groups';
import { restoreDashBackup } from '$lib/server/backup';
import { clampBackgroundBlur, clampRadius, clampSurfaceOpacity } from '$lib/appearance';
import { readAppearance, writeAppearance } from '$lib/server/appearance';
import {
	isKnownTheme,
	kindOfTheme,
	readThemeSelection,
	resolveTheme,
	writeThemeSelection
} from '$lib/server/theme-selection';
import { createCustomTheme, deleteCustomTheme, renameCustomTheme } from '$lib/server/custom-themes';
import { importOmarchyThemeFromGit } from '$lib/server/omarchy-import';
import {
	deleteBackground,
	MAX_BACKGROUND_BYTES,
	normalizeImageExt,
	saveBackground
} from '$lib/server/backgrounds';
import { DEFAULT_BUILTIN } from '$lib/server/builtin-themes';

const MAX_BACKUP_BYTES = 2 * 1024 * 1024;

export const load = async () => {
	const [groups, counts] = await Promise.all([listGroups(), countByGroup()]);
	const resolved = resolveTheme();

	return {
		groups: groups.map((group) => ({ ...group, count: counts[group.name] ?? 0 })),
		appearance: readAppearance(),
		themes: resolved.themes,
		activeTheme: resolved.selection.name
	};
};

export const actions = {
	create: async ({ request }) => {
		const formData = await request.formData();

		try {
			await createGroup(text(formData.get('name')), text(formData.get('color')));
			return { ok: true, intent: 'create' };
		} catch (error) {
			return fail(400, { ok: false, intent: 'create', message: getMessage(error) });
		}
	},

	update: async ({ request }) => {
		const formData = await request.formData();

		try {
			await updateGroup(
				text(formData.get('id')),
				text(formData.get('name')),
				text(formData.get('color'))
			);
			return { ok: true, intent: 'update' };
		} catch (error) {
			return fail(400, { ok: false, intent: 'update', message: getMessage(error) });
		}
	},

	delete: async ({ request }) => {
		const formData = await request.formData();

		try {
			await deleteGroup(text(formData.get('id')), text(formData.get('moveTo')));
			return { ok: true, intent: 'delete' };
		} catch (error) {
			return fail(400, { ok: false, intent: 'delete', message: getMessage(error) });
		}
	},

	appearance: async ({ request }) => {
		const formData = await request.formData();

		writeAppearance({
			corners: formData.get('corners') === 'round' ? 'round' : 'sharp',
			radius: clampRadius(formData.get('radius')),
			surfaceOpacity: clampSurfaceOpacity(formData.get('surfaceOpacity')),
			backgroundBlur: clampBackgroundBlur(formData.get('backgroundBlur'))
		});

		return { ok: true, intent: 'appearance' };
	},

	restore: async ({ request }) => {
		const formData = await request.formData();
		const backup = formData.get('backup');
		const confirmed = formData.get('confirm') === 'replace';

		if (!(backup instanceof File) || backup.size === 0) {
			return fail(400, { ok: false, intent: 'restore', message: 'Choose a Dash backup file.' });
		}

		if (!confirmed) {
			return fail(400, {
				ok: false,
				intent: 'restore',
				message: 'Confirm that the backup should replace the current Dash data.'
			});
		}

		if (backup.size > MAX_BACKUP_BYTES) {
			return fail(400, {
				ok: false,
				intent: 'restore',
				message: 'The backup is larger than the 2 MB restore limit.'
			});
		}

		try {
			const restored = await restoreDashBackup(await backup.text());
			const themes = restored.themes ? `, ${restored.themes} themes` : '';
			return {
				ok: true,
				intent: 'restore',
				message: `Restored ${restored.bookmarks} bookmarks, ${restored.feeds} feeds, ${restored.groups} groups${themes}.`
			};
		} catch (error) {
			return fail(400, { ok: false, intent: 'restore', message: getMessage(error) });
		}
	},

	themeImport: async ({ request }) => {
		const formData = await request.formData();
		const url = text(formData.get('url'));
		const name = text(formData.get('name'));

		if (!url) {
			return fail(400, { ok: false, intent: 'themeImport', message: 'Paste a theme repository URL.' });
		}

		try {
			const imported = await importOmarchyThemeFromGit(url, name || undefined);
			const created = createCustomTheme({
				label: imported.label,
				mode: imported.mode,
				colors: imported.theme.colors,
				settings: imported.theme.settings,
				source: imported.source
			});

			let note = '';

			if (imported.background) {
				try {
					saveBackground(created.slug, imported.background.ext, imported.background.bytes);
					note = ' with its wallpaper';
				} catch {
					// A theme without its wallpaper is still worth keeping.
				}
			}

			writeThemeSelection({ mode: 'custom', name: created.slug });

			return {
				ok: true,
				intent: 'themeImport',
				message: `Imported and applied "${created.label}"${note}.`
			};
		} catch (error) {
			return fail(400, { ok: false, intent: 'themeImport', message: getMessage(error) });
		}
	},

	themeBackgroundUpload: async ({ request }) => {
		const formData = await request.formData();
		const slug = text(formData.get('slug'));
		const image = formData.get('image');

		if (!isKnownTheme(slug)) {
			return fail(400, { ok: false, intent: 'themeBackground', message: 'Unknown theme.' });
		}

		if (!(image instanceof File) || image.size === 0) {
			return fail(400, { ok: false, intent: 'themeBackground', message: 'Choose an image file.' });
		}

		if (image.size > MAX_BACKGROUND_BYTES) {
			return fail(400, {
				ok: false,
				intent: 'themeBackground',
				message: `The image is larger than the ${Math.round(MAX_BACKGROUND_BYTES / 1024 / 1024)} MB limit.`
			});
		}

		const ext = normalizeImageExt(image.name.slice(image.name.lastIndexOf('.')));

		if (!ext) {
			return fail(400, {
				ok: false,
				intent: 'themeBackground',
				message: 'Background must be a JPG, PNG, WebP, AVIF, or GIF image.'
			});
		}

		try {
			saveBackground(slug, ext, new Uint8Array(await image.arrayBuffer()));
			return { ok: true, intent: 'themeBackground' };
		} catch (error) {
			return fail(400, { ok: false, intent: 'themeBackground', message: getMessage(error) });
		}
	},

	themeBackgroundClear: async ({ request }) => {
		const formData = await request.formData();
		deleteBackground(text(formData.get('slug')));
		return { ok: true, intent: 'themeBackground' };
	},

	themeRename: async ({ request }) => {
		const formData = await request.formData();

		try {
			renameCustomTheme(text(formData.get('id')), text(formData.get('label')));
			return { ok: true, intent: 'themeRename' };
		} catch (error) {
			return fail(400, { ok: false, intent: 'themeRename', message: getMessage(error) });
		}
	},

	themeActivate: async ({ request }) => {
		const formData = await request.formData();
		const slug = text(formData.get('slug'));

		if (!isKnownTheme(slug)) {
			return fail(400, { ok: false, intent: 'themeActivate', message: 'Unknown theme.' });
		}

		writeThemeSelection({ mode: kindOfTheme(slug), name: slug });
		return { ok: true, intent: 'themeActivate' };
	},

	themeDelete: async ({ request }) => {
		const formData = await request.formData();

		try {
			const removed = deleteCustomTheme(text(formData.get('id')));
			deleteBackground(removed.slug);

			if (readThemeSelection().name === removed.slug) {
				writeThemeSelection({ mode: 'builtin', name: DEFAULT_BUILTIN });
			}

			return { ok: true, intent: 'themeDelete' };
		} catch (error) {
			return fail(400, { ok: false, intent: 'themeDelete', message: getMessage(error) });
		}
	}
};

function text(value: FormDataEntryValue | null) {
	return typeof value === 'string' ? value.trim() : '';
}

function getMessage(error: unknown) {
	return error instanceof Error ? error.message : 'Unable to save group.';
}
