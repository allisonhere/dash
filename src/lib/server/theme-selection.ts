import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { dashboardConfigPath } from './dashboard-config';
import { DEFAULT_BUILTIN, isBuiltinTheme, listBuiltinThemes, loadBuiltinTheme } from './builtin-themes';
import type { DashTheme } from './theme-core';

export type ThemeMode = 'builtin';
export type ThemeSelection = { mode: ThemeMode; name: string };

export type ResolvedTheme = {
	theme: DashTheme;
	selection: ThemeSelection;
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
	const mode = 'builtin';
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
	const slug = isBuiltinTheme(selection.name) ? selection.name : DEFAULT_BUILTIN;

	return {
		theme: loadBuiltinTheme(slug),
		selection: { mode: 'builtin', name: slug },
		builtins
	};
}
