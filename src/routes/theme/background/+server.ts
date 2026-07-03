import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { error } from '@sveltejs/kit';
import { loadOmarchyTheme } from '$lib/server/theme';

const MIME_TYPES: Record<string, string> = {
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.webp': 'image/webp',
	'.gif': 'image/gif',
	'.avif': 'image/avif'
};

export const GET = ({ url }: { url: URL }) => {
	const theme = loadOmarchyTheme(url.searchParams.get('theme') ?? undefined);

	if (!theme.background) {
		error(404, 'The active theme has no background image.');
	}

	let body: Buffer;

	try {
		body = readFileSync(theme.background);
	} catch {
		error(404, 'The background image could not be read.');
	}

	return new Response(new Uint8Array(body), {
		headers: {
			'Content-Type': MIME_TYPES[extname(theme.background).toLowerCase()] ?? 'application/octet-stream',
			// The layout busts the URL with ?v=<mtime>, so each URL is immutable.
			'Cache-Control': 'public, max-age=31536000, immutable'
		}
	});
};
