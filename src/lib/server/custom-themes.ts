import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { dashboardConfigPath } from './dashboard-config';
import { isBuiltinTheme } from './builtin-themes';
import type { ThemeColors, ThemeMode, ThemeSettings } from './theme-core';

// Per-instance, alongside theme.json / appearance.json. A dash's themes are a
// per-machine concern and are never synced to the shared store; they travel
// through the Dash backup file instead.
const THEMES_FILE = dashboardConfigPath('themes.json');

export type CustomTheme = {
	id: string;
	slug: string;
	label: string;
	mode: ThemeMode;
	colors: ThemeColors;
	settings: ThemeSettings;
	source: string | null;
	importedAt: string;
};

export type NewCustomTheme = {
	label: string;
	mode: ThemeMode;
	colors: ThemeColors;
	settings?: ThemeSettings;
	source?: string | null;
};

export function listCustomThemes(): CustomTheme[] {
	let parsed: unknown;

	try {
		parsed = JSON.parse(readFileSync(THEMES_FILE, 'utf8'));
	} catch {
		return [];
	}

	return Array.isArray(parsed) ? parsed.filter(isCustomTheme) : [];
}

export function getCustomTheme(slug: string): CustomTheme | undefined {
	return listCustomThemes().find((theme) => theme.slug === slug);
}

export function isCustomThemeSlug(slug: string): boolean {
	return listCustomThemes().some((theme) => theme.slug === slug);
}

export function createCustomTheme(input: NewCustomTheme): CustomTheme {
	const themes = listCustomThemes();
	const label = input.label.trim().slice(0, 60);

	if (!label) {
		throw new Error('Give the theme a name.');
	}

	const theme: CustomTheme = {
		id: randomUUID(),
		slug: uniqueSlug(label, themes),
		label,
		mode: input.mode === 'light' ? 'light' : 'dark',
		colors: input.colors,
		settings: input.settings ?? {},
		source: input.source ?? null,
		importedAt: new Date().toISOString()
	};

	writeCustomThemes([...themes, theme]);
	return theme;
}

export function renameCustomTheme(id: string, label: string): CustomTheme {
	const themes = listCustomThemes();
	const index = themes.findIndex((theme) => theme.id === id);

	if (index === -1) {
		throw new Error('That theme was not found.');
	}

	const trimmed = label.trim().slice(0, 60);

	if (!trimmed) {
		throw new Error('Give the theme a name.');
	}

	themes[index] = { ...themes[index], label: trimmed };
	writeCustomThemes(themes);
	return themes[index];
}

export function deleteCustomTheme(id: string): CustomTheme {
	const themes = listCustomThemes();
	const theme = themes.find((candidate) => candidate.id === id);

	if (!theme) {
		throw new Error('That theme was not found.');
	}

	writeCustomThemes(themes.filter((candidate) => candidate.id !== id));
	return theme;
}

export function writeCustomThemes(themes: CustomTheme[]) {
	mkdirSync(dirname(THEMES_FILE), { recursive: true });

	const tempFile = `${THEMES_FILE}.tmp`;
	writeFileSync(tempFile, `${JSON.stringify(themes, null, 2)}\n`, 'utf8');
	renameSync(tempFile, THEMES_FILE);
}

function slugify(value: string): string {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 48) || 'theme'
	);
}

function uniqueSlug(label: string, existing: CustomTheme[]): string {
	const base = slugify(label);
	const taken = new Set(existing.map((theme) => theme.slug));
	let slug = base;
	let n = 2;

	while (taken.has(slug) || isBuiltinTheme(slug)) {
		slug = `${base}-${n}`;
		n += 1;
	}

	return slug;
}

function isCustomTheme(value: unknown): value is CustomTheme {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const theme = value as Record<string, unknown>;
	return (
		typeof theme.id === 'string' &&
		typeof theme.slug === 'string' &&
		typeof theme.label === 'string' &&
		(theme.mode === 'light' || theme.mode === 'dark') &&
		typeof theme.colors === 'object' &&
		theme.colors !== null
	);
}
