import { error, json } from '@sveltejs/kit';
import { buildNavigationCommands, buildServiceCommands } from '$lib/command-palette.js';
import { serviceOpenUrl } from '$lib/service-inspector.js';
import { recordBookmarkVisit } from '$lib/server/bookmarks';
import { controlContainer, loadHomelab } from '$lib/server/homelab';
import { listBookmarks } from '$lib/server/bookmarks';
import type { DockerAction } from '$lib/server/docker-ssh';

export const GET = async ({ request }: { request: Request }) => {
	const host = new URL(request.url).hostname;
	const [bookmarks, homelab] = await Promise.all([listBookmarks(), loadHomelab()]);

	return json({
		commands: [
			...buildNavigationCommands({ bookmarks }),
			...buildServiceCommands(homelab, (dockerHost, container) =>
				serviceOpenUrl(dockerHost, container, host)
			)
		]
	});
};

export const POST = async ({ request }: { request: Request }) => {
	const body = (await request.json().catch(() => null)) as {
		kind?: string;
		id?: string;
		host?: string;
		name?: string;
		action?: string;
		confirm?: string;
	} | null;

	if (!body) {
		throw error(400, 'Invalid command request.');
	}

	if (body.kind === 'bookmark') {
		if (!body.id || !body.id.startsWith('bookmark:')) {
			throw error(400, 'Invalid bookmark command.');
		}

		const bookmark = await recordBookmarkVisit(body.id.replace(/^bookmark:/, ''));

		if (!bookmark) {
			throw error(404, 'Bookmark not found.');
		}

		return json({ ok: true });
	}

	if (body.kind === 'docker-control') {
		const action = body.action as DockerAction;

		if ((action === 'stop' || action === 'restart') && body.confirm !== body.id) {
			throw error(400, 'Confirmation required.');
		}

		const result = await controlContainer(body.host ?? '', body.name ?? '', action);

		if (!result.ok) {
			throw error(result.kind === 'validation' ? 400 : 502, result.error);
		}

		return json({ ok: true });
	}

	throw error(400, 'Unsupported command.');
};
