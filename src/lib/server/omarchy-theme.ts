import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { env } from '$env/dynamic/private';

// OMARCHY_DIR lets the container read a bind-mounted omarchy folder as if it
// were local. Defaults to ~/.config/omarchy on a desktop.
const OMARCHY_CONFIG_DIR = env.OMARCHY_DIR?.trim() || join(homedir(), '.config', 'omarchy');
const THEMES_DIR = join(OMARCHY_CONFIG_DIR, 'themes');
const ACTIVE_THEME_NAME = join(OMARCHY_CONFIG_DIR, 'current', 'theme.name');
const CURRENT_THEME_LINK = join(OMARCHY_CONFIG_DIR, 'current', 'theme');
const CURRENT_BACKGROUND_LINK = join(OMARCHY_CONFIG_DIR, 'current', 'background');

export const OMARCHY_CURRENT_DIR = join(OMARCHY_CONFIG_DIR, 'current');

export type OmarchyColorKey =
	| 'accent'
	| 'border'
	| 'cursor'
	| 'foreground'
	| 'background'
	| 'selectionForeground'
	| 'selectionBackground'
	| `color${number}`;

export type OmarchySettingKey = 'blur' | 'opacity' | 'gap' | 'gapInner' | 'gapOuter';
export type OmarchyColors = Partial<Record<OmarchyColorKey, string>>;
export type OmarchySettings = Partial<Record<OmarchySettingKey, string>>;

export type OmarchyTheme = {
	name: string;
	mode: 'light' | 'dark';
	source: string | null;
	background: string | null;
	backgroundVersion: number | null;
	colors: OmarchyColors;
	settings: OmarchySettings;
	cssVariables: Record<string, string>;
	cssText: string;
};

type ParsedThemeToml = {
	colors: OmarchyColors;
	settings: OmarchySettings;
};

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const CSS_LENGTH = /^-?\d+(?:\.\d+)?(?:px|rem|em|vh|vw|vmin|vmax|%)?$/;
const ANSI_NAMES = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

const COLOR_ALIAS: Record<string, OmarchyColorKey> = {
	accent: 'accent',
	border: 'border',
	border_color: 'border',
	cursor: 'cursor',
	foreground: 'foreground',
	background: 'background',
	selection_foreground: 'selectionForeground',
	selection_background: 'selectionBackground'
};

const SETTING_ALIAS: Record<string, OmarchySettingKey> = {
	blur: 'blur',
	blur_size: 'blur',
	opacity: 'opacity',
	active_opacity: 'opacity',
	inactive_opacity: 'opacity',
	window_opacity: 'opacity',
	gap: 'gap',
	gaps: 'gap',
	gap_inner: 'gapInner',
	inner_gap: 'gapInner',
	gaps_in: 'gapInner',
	gap_outer: 'gapOuter',
	outer_gap: 'gapOuter',
	gaps_out: 'gapOuter'
};

export function loadOmarchyTheme(nameOverride?: string): OmarchyTheme {
	const currentName = readThemeName();
	const name = nameOverride?.trim() || currentName;
	const isCurrentTheme = normalizeName(name) === normalizeName(currentName);
	const themeDir =
		findThemeDirectory(name) ?? (isCurrentTheme && existsSync(CURRENT_THEME_LINK) ? CURRENT_THEME_LINK : null);

	// colors.toml is authoritative when present; alacritty.toml is the universal
	// fallback since every omarchy theme ships one, then walker.css / hyprland.conf
	// fill in accent and border colors that alacritty doesn't carry.
	const colorsToml = readThemeFile(themeDir, 'colors.toml');
	const alacrittyToml = readThemeFile(themeDir, 'alacritty.toml');
	const explicit = colorsToml ? parseOmarchyThemeToml(colorsToml.text) : { colors: {}, settings: {} };
	const fallback = alacrittyToml ? parseAlacrittyToml(alacrittyToml.text) : { colors: {}, settings: {} };

	const colors: OmarchyColors = { ...fallback.colors, ...explicit.colors };
	const settings: OmarchySettings = { ...fallback.settings, ...explicit.settings };
	const walker = readWalkerColors(themeDir);
	const hyprlandBorder = readHyprlandBorder(themeDir);

	colors.accent ??= walker.accent ?? hyprlandBorder ?? colors.color4 ?? colors.foreground;
	colors.border ??= hyprlandBorder ?? walker.border ?? colors.accent;
	colors.selectionBackground ??= colors.accent;
	colors.selectionForeground ??= colors.background;

	const background = findBackground(themeDir, isCurrentTheme);
	const cssVariables = themeToCssVariables({ colors, settings });

	return {
		name,
		mode: themeDir && existsSync(join(themeDir, 'light.mode')) ? 'light' : 'dark',
		source: colorsToml?.path ?? alacrittyToml?.path ?? null,
		background,
		backgroundVersion: background ? safeMtime(background) : null,
		colors,
		settings,
		cssVariables,
		cssText: cssVariablesToText(cssVariables)
	};
}

/**
 * Builds an OmarchyTheme from a raw palette (used by the built-in presets),
 * reusing the same CSS-variable pipeline as live omarchy themes. No wallpaper.
 */
export function composeTheme(input: {
	name: string;
	mode?: 'light' | 'dark';
	colors: OmarchyColors;
	settings?: OmarchySettings;
}): OmarchyTheme {
	const colors: OmarchyColors = { ...input.colors };
	const settings: OmarchySettings = { ...(input.settings ?? {}) };

	colors.accent ??= colors.color4 ?? colors.foreground;
	colors.border ??= colors.accent;
	colors.selectionBackground ??= colors.accent;
	colors.selectionForeground ??= colors.background;

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

export function omarchyAvailable(): boolean {
	return existsSync(OMARCHY_CONFIG_DIR);
}

export function listOmarchyThemes(): string[] {
	if (!existsSync(THEMES_DIR)) {
		return [];
	}

	return readdirSync(THEMES_DIR, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
}

export function parseOmarchyThemeToml(toml: string): ParsedThemeToml {
	const colors: OmarchyColors = {};
	const settings: OmarchySettings = {};

	for (const rawLine of toml.split(/\r?\n/)) {
		const line = stripTomlComment(rawLine).trim();

		if (!line || line.startsWith('[')) {
			continue;
		}

		const match = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);

		if (!match) {
			continue;
		}

		const key = match[1];
		const value = normalizeTomlValue(match[2]);
		const colorKey = normalizeColorKey(key);
		const settingKey = normalizeSettingKey(key);

		if (colorKey && HEX_COLOR.test(value)) {
			colors[colorKey] = value;
		}

		if (settingKey) {
			const settingValue = normalizeSettingValue(settingKey, value);

			if (settingValue) {
				settings[settingKey] = settingValue;
			}
		}
	}

	return { colors, settings };
}

export function parseAlacrittyToml(toml: string): ParsedThemeToml {
	const colors: OmarchyColors = {};
	const settings: OmarchySettings = {};
	let section = '';

	for (const rawLine of toml.split(/\r?\n/)) {
		const line = stripTomlComment(rawLine).trim();

		if (!line) {
			continue;
		}

		const sectionMatch = line.match(/^\[(.+)\]$/);

		if (sectionMatch) {
			section = sectionMatch[1].trim().toLowerCase();
			continue;
		}

		const match = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);

		if (!match) {
			continue;
		}

		const key = normalizeTomlKey(match[1]);
		const rawValue = normalizeTomlValue(match[2]);

		if (section === 'window' && key === 'opacity') {
			const numeric = Number(rawValue);

			if (Number.isFinite(numeric) && numeric > 0 && numeric <= 1) {
				settings.opacity = String(numeric);
			}

			continue;
		}

		const value = normalizeHexColor(rawValue);

		if (!value) {
			continue;
		}

		if (section === 'colors.primary' && (key === 'background' || key === 'foreground')) {
			colors[key] = value;
		} else if (section === 'colors.cursor' && key === 'cursor') {
			colors.cursor = value;
		} else if (section === 'colors.selection') {
			if (key === 'text') {
				colors.selectionForeground = value;
			} else if (key === 'background') {
				colors.selectionBackground = value;
			}
		} else if (section === 'colors.normal' || section === 'colors.bright') {
			const ansiIndex = ANSI_NAMES.indexOf(key);

			if (ansiIndex !== -1) {
				const offset = section === 'colors.bright' ? 8 : 0;
				colors[`color${ansiIndex + offset}`] = value;
			}
		}
	}

	return { colors, settings };
}

export function themeToCssVariables(theme: ParsedThemeToml): Record<string, string> {
	const cssVariables: Record<string, string> = {};

	for (const [key, value] of Object.entries(theme.colors)) {
		if (!value) {
			continue;
		}

		const cssName = camelToKebab(key);
		cssVariables[`--omarchy-${cssName}`] = value;
		cssVariables[`--theme-${cssName}`] = value;
	}

	for (const [key, value] of Object.entries(theme.settings)) {
		if (!value) {
			continue;
		}

		cssVariables[`--theme-${camelToKebab(key)}`] = value;
	}

	addAlias(cssVariables, '--theme-bg', theme.colors.background);
	addAlias(cssVariables, '--theme-fg', theme.colors.foreground);
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

function readThemeFile(themeDir: string | null, fileName: string): { path: string; text: string } | null {
	if (!themeDir) {
		return null;
	}

	const path = join(themeDir, fileName);

	if (!existsSync(path)) {
		return null;
	}

	try {
		return { path, text: readFileSync(path, 'utf8') };
	} catch {
		return null;
	}
}

function readWalkerColors(themeDir: string | null): { accent?: string; border?: string } {
	const walker = readThemeFile(themeDir, 'walker.css');

	if (!walker) {
		return {};
	}

	return {
		accent: matchDefineColor(walker.text, 'selected-text'),
		border: matchDefineColor(walker.text, 'border')
	};
}

function matchDefineColor(css: string, name: string): string | undefined {
	const match = css.match(new RegExp(`@define-color\\s+${name}\\s+(#[0-9a-fA-F]{3,8})`));
	return match?.[1];
}

function readHyprlandBorder(themeDir: string | null): string | undefined {
	const hyprland = readThemeFile(themeDir, 'hyprland.conf');
	const match = hyprland?.text.match(/col\.active_border\s*=\s*rgba?\(([0-9a-fA-F]{6,8})\)/);
	return match ? `#${match[1]}` : undefined;
}

function findBackground(themeDir: string | null, isCurrentTheme: boolean): string | null {
	if (isCurrentTheme && existsSync(CURRENT_BACKGROUND_LINK)) {
		try {
			return realpathSync(CURRENT_BACKGROUND_LINK);
		} catch {
			// fall through to the theme's backgrounds directory
		}
	}

	if (!themeDir) {
		return null;
	}

	const backgroundsDir = join(themeDir, 'backgrounds');

	if (!existsSync(backgroundsDir)) {
		return null;
	}

	const first = readdirSync(backgroundsDir)
		.filter((file) => IMAGE_EXTENSIONS.has(extname(file).toLowerCase()))
		.sort()[0];

	return first ? join(backgroundsDir, first) : null;
}

function safeMtime(path: string): number | null {
	try {
		return Math.round(statSync(path).mtimeMs);
	} catch {
		return null;
	}
}

function findThemeDirectory(themeName: string): string | null {
	if (!existsSync(THEMES_DIR)) {
		return null;
	}

	const normalizedThemeName = normalizeName(themeName);

	for (const entry of readdirSync(THEMES_DIR, { withFileTypes: true })) {
		if (entry.isDirectory() && normalizeName(entry.name) === normalizedThemeName) {
			return join(THEMES_DIR, entry.name);
		}
	}

	const slug = themeName.trim().toLowerCase().replaceAll(/\s+/g, '-');
	const slugPath = join(THEMES_DIR, slug);

	return existsSync(slugPath) ? slugPath : null;
}

function cssVariablesToText(variables: Record<string, string>): string {
	return Object.entries(variables)
		.map(([key, value]) => `${key}: ${value}`)
		.join('; ');
}

function readThemeName(): string {
	if (!existsSync(ACTIVE_THEME_NAME)) {
		return basename(CURRENT_THEME_LINK);
	}

	return readFileSync(ACTIVE_THEME_NAME, 'utf8').trim() || basename(CURRENT_THEME_LINK);
}

function normalizeColorKey(key: string): OmarchyColorKey | null {
	const normalized = normalizeTomlKey(key);
	const colorMatch = normalized.match(/^color([0-9]|1[0-5])$/);

	if (colorMatch) {
		return `color${colorMatch[1]}` as OmarchyColorKey;
	}

	return COLOR_ALIAS[normalized] ?? null;
}

function normalizeSettingKey(key: string): OmarchySettingKey | null {
	return SETTING_ALIAS[normalizeTomlKey(key)] ?? null;
}

function normalizeTomlValue(value: string): string {
	const trimmed = value.trim().replace(/,$/, '');

	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}

	return trimmed;
}

function normalizeHexColor(value: string): string | null {
	const candidate = value.replace(/^0x/i, '#');
	return HEX_COLOR.test(candidate) ? candidate : null;
}

function normalizeSettingValue(key: OmarchySettingKey, value: string): string | null {
	if (key === 'opacity') {
		const numeric = Number(value);

		if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 1) {
			return String(numeric);
		}

		return value.endsWith('%') ? value : null;
	}

	if (!CSS_LENGTH.test(value)) {
		return null;
	}

	return value.match(/[a-z%]+$/i) ? value : `${value}px`;
}

function stripTomlComment(line: string): string {
	let quote: string | null = null;

	for (let index = 0; index < line.length; index += 1) {
		const char = line[index];
		const previous = line[index - 1];

		if ((char === '"' || char === "'") && previous !== '\\') {
			quote = quote === char ? null : quote ?? char;
		}

		if (char === '#' && quote === null) {
			return line.slice(0, index);
		}
	}

	return line;
}

function addAlias(variables: Record<string, string>, key: string, value: string | undefined) {
	if (value) {
		variables[key] = value;
	}
}

function camelToKebab(value: string): string {
	return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function normalizeTomlKey(key: string): string {
	return key.trim().toLowerCase().replaceAll('-', '_');
}

function normalizeName(name: string): string {
	return name.trim().toLowerCase().replaceAll(/[\s_-]+/g, '');
}
