import { readFileSync } from 'node:fs';
import { error } from '@sveltejs/kit';
import { getBackground, IMAGE_MIME } from '$lib/server/backgrounds';

const SLUG = /^[a-z0-9-]{1,64}$/;

export const GET = ({ url }: { url: URL }) => {
	const slug = url.searchParams.get('slug') ?? '';

	if (!SLUG.test(slug)) {
		error(400, 'Bad theme slug.');
	}

	const found = getBackground(slug);

	if (!found) {
		error(404, 'That theme has no background image.');
	}

	let body: Buffer;

	try {
		body = readFileSync(found.path);
	} catch {
		error(404, 'The background image could not be read.');
	}

	return new Response(new Uint8Array(body), {
		headers: {
			'Content-Type': IMAGE_MIME[found.ext] ?? 'application/octet-stream',
			// The layout busts the URL with ?v=<save time>, so each URL is immutable.
			'Cache-Control': 'public, max-age=31536000, immutable'
		}
	});
};
