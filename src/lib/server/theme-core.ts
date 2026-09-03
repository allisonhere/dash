import { bestTextOn, ensureReadable } from '$lib/contrast.js';

export type ThemeMode = 'light' | 'dark';
export type ThemeColorKey =
	| 'accent'
	| 'border'
	| 'cursor'
	| 'foreground'
	| 'background'
	| 'selectionForeground'
	| 'selectionBackground'
	| `color${number}`;

export type ThemeColors = Partial<Record<ThemeColorKey, string>>;
export type ThemeSettings = Partial<Record<'blur' | 'opacity' | 'gap' | 'gapInner' | 'gapOuter', string>>;

export type DashTheme = {
	name: string;
	mode: ThemeMode;
	source: string | null;
	background: string | null;
	backgroundVersion: number | null;
	colors: ThemeColors;
	settings: ThemeSettings;
	cssVariables: Record<string, string>;
	cssText: string;
};

export function composeTheme(input: {
	name: string;
	mode?: ThemeMode;
	colors: ThemeColors;
	settings?: ThemeSettings;
}): DashTheme {
	const colors: ThemeColors = { ...input.colors };
	const settings: ThemeSettings = { ...(input.settings ?? {}) };

	colors.accent ??= colors.color4 ?? colors.foreground;
	colors.border ??= colors.accent;
	colors.selectionBackground ??= colors.accent;
	colors.selectionForeground ??= colors.foreground;

	// Contrast pass: an imported palette can carry a muddy foreground or accent
	// that reads fine in a terminal but not as body text / headings / button
	// labels here. Nudge each toward black or white just enough to clear a WCAG
	// ratio against the background (4.5:1 for body text, 3:1 for the accent,
	// which is used for large text and UI). Colours that already pass are left
	// untouched, so the built-in themes don't move.
	if (colors.background) {
		const bg = colors.background;

		if (colors.foreground) {
			colors.foreground = ensureReadable(colors.foreground, bg, 4.5);
		}

		for (const key of ['accent', 'color1', 'color2', 'color3', 'color6'] as const) {
			if (colors[key]) {
				colors[key] = ensureReadable(colors[key]!, bg, 3);
			}
		}
	}

	const cssVariables = themeToCssVariables({ colors, settings });

	return {
		name: input.name,
		mode: input.mode ?? 'dark',
		source: null,
		background: null,
		backgroundVersion: null,
		colors,
		settings,
		cssVariables,
		cssText: cssVariablesToText(cssVariables)
	};
}

export function themeToCssVariables(theme: {
	colors: ThemeColors;
	settings: ThemeSettings;
}): Record<string, string> {
	const cssVariables: Record<string, string> = {};

	for (const [key, value] of Object.entries(theme.colors)) {
		if (!value) {
			continue;
		}

		cssVariables[`--theme-${camelToKebab(key)}`] = value;
	}

	for (const [key, value] of Object.entries(theme.settings)) {
		if (!value) {
			continue;
		}

		cssVariables[`--theme-${camelToKebab(key)}`] = value;
	}

	addAlias(cssVariables, '--theme-bg', theme.colors.background);
	addAlias(cssVariables, '--theme-fg', theme.colors.foreground);
	// Label colour for filled accent buttons — plain black or white, whichever
	// reads on the (already contrast-checked) accent.
	if (theme.colors.accent) {
		cssVariables['--theme-on-accent'] = bestTextOn(theme.colors.accent);
	}
	addAlias(cssVariables, '--theme-border', theme.colors.border);
	addAlias(cssVariables, '--theme-panel', theme.colors.color0);
	addAlias(cssVariables, '--theme-muted', theme.colors.color8);
	addAlias(cssVariables, '--theme-success', theme.colors.color2);
	addAlias(cssVariables, '--theme-warning', theme.colors.color3);
	addAlias(cssVariables, '--theme-danger', theme.colors.color1);
	addAlias(cssVariables, '--theme-info', theme.colors.color6);
	addAlias(cssVariables, '--theme-gap', theme.settings.gap ?? theme.settings.gapInner);
	addAlias(cssVariables, '--theme-gaps', theme.settings.gap ?? theme.settings.gapInner);

	return cssVariables;
}

function cssVariablesToText(variables: Record<string, string>): string {
	return Object.entries(variables)
		.map(([key, value]) => `${key}: ${value}`)
		.join('; ');
}

function addAlias(variables: Record<string, string>, key: string, value: string | undefined) {
	if (value) {
		variables[key] = value;
	}
}

function camelToKebab(value: string) {
	return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
