import { error, json } from '@sveltejs/kit';
import { loadContainerLogs } from '$lib/server/homelab';

export const GET = async ({ url }: { url: URL }) => {
	const host = url.searchParams.get('host') ?? '';
	const name = url.searchParams.get('name') ?? '';
	const lines = Number(url.searchParams.get('lines') ?? 50);

	const result = await loadContainerLogs(host, name, lines);

	if (!result.ok) {
		throw error(result.kind === 'validation' ? 400 : 502, result.error);
	}

	return json({ logs: result.logs ?? '' });
};
