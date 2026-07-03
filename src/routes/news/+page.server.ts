import { fail } from '@sveltejs/kit';
import { createFeed, deleteFeed, listFeeds } from '$lib/server/feeds';
import { clearNewsCache, loadNews, probeFeed } from '$lib/server/news';

export const load = async () => {
	const feeds = await listFeeds();

	return {
		feeds,
		results: await loadNews(feeds)
	};
};

export const actions = {
	add: async ({ request }: { request: Request }) => {
		const formData = await request.formData();
		const rawUrl = String(formData.get('url') ?? '');
		const customTitle = String(formData.get('title') ?? '').trim();

		try {
			const probed = await probeFeed(rawUrl);
			const feed = await createFeed({ url: probed.url, title: customTitle || probed.title });
			return { ok: true, intent: 'add', feed };
		} catch (error) {
			return fail(400, {
				ok: false,
				intent: 'add',
				message: error instanceof Error ? error.message : 'Unable to add feed.'
			});
		}
	},

	delete: async ({ request }: { request: Request }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');

		if (!(await deleteFeed(id))) {
			return fail(404, { ok: false, intent: 'delete', message: 'Feed was not found.' });
		}

		return { ok: true, intent: 'delete', id };
	},

	refresh: async () => {
		clearNewsCache();
		return { ok: true, intent: 'refresh' };
	}
};
