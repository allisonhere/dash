import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { dashboardConfigPath } from './dashboard-config';
import { DEFAULT_BUILTIN, isBuiltinTheme, listBuiltinThemes, loadBuiltinTheme } from './builtin-themes';
import { getCustomTheme, listCustomThemes } from './custom-themes';
import { getBackground, readBackgroundIndex } from './backgrounds';
import { composeTheme, type DashTheme } from './theme-core';

export type ThemeKind = 'builtin' | 'custom';
export type ThemeSelection = { mode: ThemeKind; name: string };

export type ThemeSummary = {
	slug: string;
	label: string;
	kind: ThemeKind;
	/** Present for custom themes only — the stable id for rename/delete. */
	id?: string;
	source?: string | null;
	hasBackground: boolean;
	backgroundVersion: number | null;
};

export type ResolvedTheme = {
	theme: DashTheme;
	selection: ThemeSelection;
	themes: ThemeSummary[];
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
	const name = typeof raw.name === 'string' ? raw.name : DEFAULT_BUILTIN;
	return { mode: kindOfTheme(name), name };
}

export function writeThemeSelection(selection: ThemeSelection) {
	mkdirSync(dirname(SELECTION_FILE), { recursive: true });

	const tempFile = `${SELECTION_FILE}.tmp`;
	writeFileSync(tempFile, `${JSON.stringify(selection, null, 2)}\n`, 'utf8');
	renameSync(tempFile, SELECTION_FILE);
}

/** A builtin slug or a custom-theme slug. */
export function isKnownTheme(slug: string): boolean {
	return isBuiltinTheme(slug) || Boolean(getCustomTheme(slug));
}

export function kindOfTheme(slug: string): ThemeKind {
	return isBuiltinTheme(slug) ? 'builtin' : getCustomTheme(slug) ? 'custom' : 'builtin';
}

export function listThemes(): ThemeSummary[] {
	const backgrounds = readBackgroundIndex();
	const bg = (slug: string) => ({
		hasBackground: slug in backgrounds,
		backgroundVersion: backgrounds[slug]?.updatedAt ?? null
	});

	return [
		...listBuiltinThemes().map((theme) => ({ ...theme, kind: 'builtin' as const, ...bg(theme.slug) })),
		...listCustomThemes().map((theme) => ({
			slug: theme.slug,
			label: theme.label,
			kind: 'custom' as const,
			id: theme.id,
			source: theme.source,
			...bg(theme.slug)
		}))
	];
}

// Attach the wallpaper URL for `slug`, if one is stored, to a freshly composed
// theme. The ?v= is the file's save time so each URL can be cached immutably.
function withBackground(theme: DashTheme, slug: string): DashTheme {
	const found = getBackground(slug);

	if (!found) {
		return theme;
	}

	return {
		...theme,
		background: `/theme/background?slug=${encodeURIComponent(slug)}&v=${found.updatedAt}`,
		backgroundVersion: found.updatedAt
	};
}

export function resolveTheme(): ResolvedTheme {
	const selection = readThemeSelection();
	const themes = listThemes();

	if (isBuiltinTheme(selection.name)) {
		return {
			theme: withBackground(loadBuiltinTheme(selection.name), selection.name),
			selection: { mode: 'builtin', name: selection.name },
			themes
		};
	}

	const custom = getCustomTheme(selection.name);

	if (custom) {
		return {
			theme: withBackground(
				composeTheme({
					name: custom.label,
					mode: custom.mode,
					colors: custom.colors,
					settings: custom.settings
				}),
				custom.slug
			),
			selection: { mode: 'custom', name: custom.slug },
			themes
		};
	}

	return {
		theme: withBackground(loadBuiltinTheme(DEFAULT_BUILTIN), DEFAULT_BUILTIN),
		selection: { mode: 'builtin', name: DEFAULT_BUILTIN },
		themes
	};
}
