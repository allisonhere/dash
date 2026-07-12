import { fail } from '@sveltejs/kit';
import { countByGroup, createGroup, deleteGroup, listGroups, updateGroup } from '$lib/server/groups';

export const load = async () => {
	const [groups, counts] = await Promise.all([listGroups(), countByGroup()]);

	return {
		groups: groups.map((group) => ({ ...group, count: counts[group.name] ?? 0 }))
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
	}
};

function text(value: FormDataEntryValue | null) {
	return typeof value === 'string' ? value.trim() : '';
}

function getMessage(error: unknown) {
	return error instanceof Error ? error.message : 'Unable to save group.';
}
