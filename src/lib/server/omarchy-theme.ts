import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { env } from '$env/dynamic/private';

// OMARCHY_DIR lets the container read a bind-mounted omarchy folder as if it
// were local. Defaults to ~/.config/omarchy on a desktop.
const OMARCHY_CONFIG_DIR = env.OMARCHY_DIR?.trim() || join(homedir(), '.config', 'omarchy');

// Omarchy 4 moved the live theme out of the config dir and into the XDG state
// dir; 3.x and the bind-mounted container copy still keep it under the config
// dir. Both layouts are supported, newest first, and OMARCHY_STATE_DIR /
// OMARCHY_DATA_DIR override the lookup the same way OMARCHY_DIR does.
const OMARCHY_STATE_DIR =
	env.OMARCHY_STATE_DIR?.trim() ||
	join(env.XDG_STATE_HOME?.trim() || join(homedir(), '.local', 'state'), 'omarchy');
const OMARCHY_DATA_DIR =
	env.OMARCHY_DATA_DIR?.trim() ||
	join(env.XDG_DATA_HOME?.trim() || join(homedir(), '.local', 'share'), 'omarchy');

// User themes live beside the config, the shipped ones beside the install.
const THEME_DIRS = [join(OMARCHY_CONFIG_DIR, 'themes'), join(OMARCHY_DATA_DIR, 'themes')];

// Resolved per call rather than at import: an omarchy upgrade moves this
// directory, and a long-running dash should follow it without a restart.
export function omarchyCurrentDir(): string | null {
	for (const candidate of [
		join(OMARCHY_STATE_DIR, 'current'),
		join(OMARCHY_CONFIG_DIR, 'current')
	]) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	return null;
}

export type OmarchyColorKey =
	| 'accent'
	| 'border'
	| 'cursor'
	| 'foreground'
	| 'darkForeground'
	| 'lightForeground'
	| 'brightForeground'
	| 'background'
	| 'darkBackground'
	| 'darkerBackground'
	| 'lighterBackground'
	| 'muted'
	| 'selectionForeground'
	| 'selectionBackground'
	| 'selection'
	| 'red'
	| 'green'
	| 'yellow'
	| 'blue'
	| 'magenta'
	| 'cyan'
	| 'white'
	| 'black'
	| `color${number}`;

export type OmarchySettingKey = 'blur' | 'opacity' | 'gap' | 'gapInner' | 'gapOuter' | 'mode';
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
	fg: 'foreground',
	background: 'background',
	bg: 'background',
	muted: 'muted',
	selection: 'selectionBackground',
	selection_foreground: 'selectionForeground',
	selection_background: 'selectionBackground',
	dark_background: 'darkBackground',
	dark_bg: 'darkBackground',
	darker_background: 'darkerBackground',
	darker_bg: 'darkerBackground',
	lighter_background: 'lighterBackground',
	lighter_bg: 'lighterBackground',
	dark_foreground: 'darkForeground',
	dark_fg: 'darkForeground',
	light_foreground: 'lightForeground',
	light_fg: 'lightForeground',
	bright_foreground: 'brightForeground',
	bright_fg: 'brightForeground',
	red: 'red',
	green: 'green',
	yellow: 'yellow',
	blue: 'blue',
	magenta: 'magenta',
	cyan: 'cyan',
	white: 'white',
	black: 'black'
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
	const currentDir = omarchyCurrentDir();
	const currentThemeDir = currentDir ? join(currentDir, 'theme') : null;
	const currentName = readThemeName();
	const name = nameOverride?.trim() || currentName;
	const isCurrentTheme = normalizeName(name) === normalizeName(currentName);

	// The active theme is a full copy under current/, so it stays authoritative
	// for the theme in use; anything else is looked up by name.
	const themeDir =
		(isCurrentTheme && currentThemeDir && existsSync(currentThemeDir) ? currentThemeDir : null) ??
		findThemeDirectory(name);

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

	normalizeSemanticColors(colors);
	colors.accent ??= walker.accent ?? hyprlandBorder ?? colors.color4 ?? colors.foreground;
	colors.border ??= hyprlandBorder ?? walker.border ?? colors.accent;
	colors.selectionBackground ??= colors.accent;
	colors.selectionForeground ??= colors.brightForeground ?? colors.foreground;

	const background = findBackground(themeDir, isCurrentTheme);
	const cssVariables = themeToCssVariables({ colors, settings });

	return {
		name,
		mode: themeMode(themeDir, settings),
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

	normalizeSemanticColors(colors);
	colors.accent ??= colors.color4 ?? colors.foreground;
	colors.border ??= colors.accent;
	colors.selectionBackground ??= colors.accent;
	colors.selectionForeground ??= colors.brightForeground ?? colors.foreground;

	const cssVariables = themeToCssVariables({ colors, settings });

	return {
		name: input.name,
		mode: input.mode ?? (settings.mode === 'light' ? 'light' : 'dark'),
		source: null,
		background: null,
		backgroundVersion: null,
		colors,
		settings,
		cssVariables,
		cssText: cssVariablesToText(cssVariables)
	};
}

// "Match omarchy" follows the desktop's live theme, so it is only offered when
// that live theme is actually readable — a config dir full of theme folders
// with no current/ to point at is not enough.
export function omarchyAvailable(): boolean {
	return omarchyCurrentDir() !== null;
}

export function listOmarchyThemes(): string[] {
	const names = new Set<string>();

	for (const themesDir of THEME_DIRS) {
		if (!existsSync(themesDir)) {
			continue;
		}

		for (const entry of readdirSync(themesDir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				names.add(entry.name);
			}
		}
	}

	return [...names].sort();
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
		const normalizedKey = normalizeTomlKey(key);
		const colorKey = normalizeColorKey(key);
		const settingKey = normalizeSettingKey(key);

		if (normalizedKey === 'mode' && (value === 'light' || value === 'dark')) {
			settings.mode = value;
		}

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
	const currentDir = omarchyCurrentDir();
	const currentBackground = currentDir ? join(currentDir, 'background') : null;

	if (isCurrentTheme && currentBackground && existsSync(currentBackground)) {
		try {
			return realpathSync(currentBackground);
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

function themeMode(themeDir: string | null, settings: OmarchySettings): 'light' | 'dark' {
	if (settings.mode === 'light' || settings.mode === 'dark') {
		return settings.mode;
	}

	return themeDir && existsSync(join(themeDir, 'light.mode')) ? 'light' : 'dark';
}

function normalizeSemanticColors(colors: OmarchyColors) {
	colors.color0 ??= colors.black ?? colors.darkerBackground ?? colors.background;
	colors.color1 ??= colors.red;
	colors.color2 ??= colors.green;
	colors.color3 ??= colors.yellow;
	colors.color4 ??= colors.blue ?? colors.accent;
	colors.color5 ??= colors.magenta;
	colors.color6 ??= colors.cyan;
	colors.color7 ??= colors.white ?? colors.foreground;
	colors.color8 ??= colors.muted ?? colors.darkForeground;
	colors.accent ??= colors.blue;
	colors.muted ??= colors.color8 ?? colors.darkForeground;
	colors.selectionBackground ??= colors.selection;
	colors.selectionForeground ??= colors.brightForeground ?? colors.foreground;
}

function safeMtime(path: string): number | null {
	try {
		return Math.round(statSync(path).mtimeMs);
	} catch {
		return null;
	}
}

function findThemeDirectory(themeName: string): string | null {
	if (!themeName.trim()) {
		return null;
	}

	const normalizedThemeName = normalizeName(themeName);
	const slug = themeName.trim().toLowerCase().replaceAll(/\s+/g, '-');

	for (const themesDir of THEME_DIRS) {
		if (!existsSync(themesDir)) {
			continue;
		}

		for (const entry of readdirSync(themesDir, { withFileTypes: true })) {
			if (entry.isDirectory() && normalizeName(entry.name) === normalizedThemeName) {
				return join(themesDir, entry.name);
			}
		}

		const slugPath = join(themesDir, slug);

		if (existsSync(slugPath)) {
			return slugPath;
		}
	}

	return null;
}

function cssVariablesToText(variables: Record<string, string>): string {
	return Object.entries(variables)
		.map(([key, value]) => `${key}: ${value}`)
		.join('; ');
}

function readThemeName(): string {
	const currentDir = omarchyCurrentDir();

	if (!currentDir) {
		return '';
	}

	const nameFile = join(currentDir, 'theme.name');

	// Older layouts symlink current/theme at the theme directory and ship no
	// theme.name, so the link target names the theme.
	const linked = () => {
		try {
			return basename(realpathSync(join(currentDir, 'theme')));
		} catch {
			return '';
		}
	};

	if (!existsSync(nameFile)) {
		return linked();
	}

	return readFileSync(nameFile, 'utf8').trim() || linked();
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
