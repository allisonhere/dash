import { fail } from '@sveltejs/kit';
import {
	bookmarkInputFromForm,
	createBookmark,
	deleteBookmark,
	listBookmarks,
	updateBookmark
} from '$lib/server/bookmarks';

export const load = async () => {
	return {
		bookmarks: await listBookmarks()
	};
};

export const actions = {
	create: async ({ request }) => {
		try {
			const formData = await request.formData();
			const bookmark = await createBookmark(bookmarkInputFromForm(formData));

			return { ok: true, intent: 'create', bookmark };
		} catch (error) {
			return fail(400, { ok: false, intent: 'create', message: getMessage(error) });
		}
	},

	update: async ({ request }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');

		try {
			const bookmark = await updateBookmark(id, bookmarkInputFromForm(formData));

			if (!bookmark) {
				return fail(404, { ok: false, intent: 'update', message: 'Bookmark was not found.' });
			}

			return { ok: true, intent: 'update', bookmark };
		} catch (error) {
			return fail(400, { ok: false, intent: 'update', message: getMessage(error) });
		}
	},

	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');

		if (!(await deleteBookmark(id))) {
			return fail(404, { ok: false, intent: 'delete', message: 'Bookmark was not found.' });
		}

		return { ok: true, intent: 'delete', id };
	}
};

/**
 * @param {unknown} error
 */
function getMessage(error) {
	return error instanceof Error ? error.message : 'Unable to save bookmark.';
}
