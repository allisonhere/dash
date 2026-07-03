import { json, error } from '@sveltejs/kit';
import { isBuiltinTheme } from '$lib/server/builtin-themes';
import { omarchyAvailable } from '$lib/server/omarchy-theme';
import { writeThemeSelection, type ThemeSelection } from '$lib/server/theme-selection';

export const POST = async ({ request }: { request: Request }) => {
	let body: unknown;

	try {
		body = await request.json();
	} catch {
		error(400, 'Expected a JSON body.');
	}

	const raw = (body ?? {}) as Record<string, unknown>;
	const mode = raw.mode === 'omarchy' ? 'omarchy' : 'builtin';
	const name = typeof raw.name === 'string' ? raw.name : '';

	if (mode === 'omarchy') {
		if (!omarchyAvailable()) {
			error(400, 'No omarchy install is available on this instance.');
		}
	} else if (!isBuiltinTheme(name)) {
		error(400, 'Unknown theme.');
	}

	const selection: ThemeSelection = { mode, name };
	writeThemeSelection(selection);
	return json({ ok: true, selection });
};
