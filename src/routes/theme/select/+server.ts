import { json, error } from '@sveltejs/kit';
import {
	isKnownTheme,
	kindOfTheme,
	writeThemeSelection,
	type ThemeSelection
} from '$lib/server/theme-selection';

export const POST = async ({ request }: { request: Request }) => {
	let body: unknown;

	try {
		body = await request.json();
	} catch {
		error(400, 'Expected a JSON body.');
	}

	const raw = (body ?? {}) as Record<string, unknown>;
	const name = typeof raw.name === 'string' ? raw.name : '';

	if (!isKnownTheme(name)) {
		error(400, 'Unknown theme.');
	}

	const selection: ThemeSelection = { mode: kindOfTheme(name), name };
	writeThemeSelection(selection);
	return json({ ok: true, selection });
};
