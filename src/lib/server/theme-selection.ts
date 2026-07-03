import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { dashboardConfigPath } from './dashboard-config';
import { loadOmarchyTheme, omarchyAvailable, type OmarchyTheme } from './omarchy-theme';
import { DEFAULT_BUILTIN, isBuiltinTheme, listBuiltinThemes, loadBuiltinTheme } from './builtin-themes';

export type ThemeMode = 'builtin' | 'omarchy';
export type ThemeSelection = { mode: ThemeMode; name: string };

export type ResolvedTheme = {
	theme: OmarchyTheme;
	selection: ThemeSelection;
	omarchyAvailable: boolean;
	builtins: Array<{ slug: string; label: string }>;
};

// Per-instance, stored locally alongside the other custom-dash config. Never
// synced to the shared webhost store — theme is a per-machine concern.
const SELECTION_FILE = dashboardConfigPath('theme.json');
const DEFAULT_SELECTION: ThemeSelection = { mode: 'builtin', name: DEFAULT_BUILTIN };

export function readThemeSelection(): ThemeSelection {
	let parsed: unknown;

	try {
		parsed = JSON.parse(readFileSync(SELECTION_FILE, 'utf8'));
	} catch {
		return { ...DEFAULT_SELECTION };
	}

	if (!parsed || typeof parsed !== 'object') {
		return { ...DEFAULT_SELECTION };
	}

	const raw = parsed as Record<string, unknown>;
	const mode = raw.mode === 'omarchy' ? 'omarchy' : 'builtin';
	const name = typeof raw.name === 'string' ? raw.name : DEFAULT_BUILTIN;
	return { mode, name };
}

export function writeThemeSelection(selection: ThemeSelection) {
	mkdirSync(dirname(SELECTION_FILE), { recursive: true });

	const tempFile = `${SELECTION_FILE}.tmp`;
	writeFileSync(tempFile, `${JSON.stringify(selection, null, 2)}\n`, 'utf8');
	renameSync(tempFile, SELECTION_FILE);
}

export function resolveTheme(): ResolvedTheme {
	const selection = readThemeSelection();
	const builtins = listBuiltinThemes();

	// "Match omarchy" reads the local omarchy install directly (OMARCHY_DIR, or
	// ~/.config/omarchy). In the container this is a read-only bind mount. When
	// no omarchy dir is present the option is hidden and we fall back to a builtin.
	const hasOmarchy = omarchyAvailable();

	if (selection.mode === 'omarchy' && hasOmarchy) {
		return {
			theme: loadOmarchyTheme(selection.name || undefined),
			selection,
			omarchyAvailable: hasOmarchy,
			builtins
		};
	}

	const slug = isBuiltinTheme(selection.name) ? selection.name : DEFAULT_BUILTIN;

	return {
		theme: loadBuiltinTheme(slug),
		selection: { mode: 'builtin', name: slug },
		omarchyAvailable: hasOmarchy,
		builtins
	};
}
