import { fail } from '@sveltejs/kit';
import { countByGroup, createGroup, deleteGroup, listGroups, updateGroup } from '$lib/server/groups';
import { restoreDashBackup } from '$lib/server/backup';
import { clampRadius } from '$lib/appearance';
import { readAppearance, writeAppearance } from '$lib/server/appearance';

const MAX_BACKUP_BYTES = 2 * 1024 * 1024;

export const load = async () => {
	const [groups, counts] = await Promise.all([listGroups(), countByGroup()]);

	return {
		groups: groups.map((group) => ({ ...group, count: counts[group.name] ?? 0 })),
		appearance: readAppearance()
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
			radius: clampRadius(formData.get('radius'))
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
			return {
				ok: true,
				intent: 'restore',
				message: `Restored ${restored.bookmarks} bookmarks, ${restored.feeds} feeds, and ${restored.groups} groups.`
			};
		} catch (error) {
			return fail(400, { ok: false, intent: 'restore', message: getMessage(error) });
		}
	}
};

function text(value: FormDataEntryValue | null) {
	return typeof value === 'string' ? value.trim() : '';
}

function getMessage(error: unknown) {
	return error instanceof Error ? error.message : 'Unable to save group.';
}
