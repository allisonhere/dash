import { json, error } from '@sveltejs/kit';
import { isBuiltinTheme } from '$lib/server/builtin-themes';
import { writeThemeSelection, type ThemeSelection } from '$lib/server/theme-selection';

export const POST = async ({ request }: { request: Request }) => {
	let body: unknown;

	try {
		body = await request.json();
	} catch {
		error(400, 'Expected a JSON body.');
	}

	const raw = (body ?? {}) as Record<string, unknown>;
	const mode = 'builtin';
	const name = typeof raw.name === 'string' ? raw.name : '';

	if (!isBuiltinTheme(name)) {
		error(400, 'Unknown theme.');
	}

	const selection: ThemeSelection = { mode, name };
	writeThemeSelection(selection);
	return json({ ok: true, selection });
};
