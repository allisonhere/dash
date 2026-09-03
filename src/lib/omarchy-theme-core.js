// Pure parsers for the files an Omarchy theme repo ships (colors.toml,
// alacritty.toml, walker.css, hyprland.conf) plus a composer that folds them
// into the palette shape Dash's server-side composeTheme expects. Kept as
// framework-free .js so `node --test src/lib/*.test.js` can exercise it.

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const CSS_LENGTH = /^-?\d+(?:\.\d+)?(?:px|rem|em|vh|vw|vmin|vmax|%)?$/;
const ANSI_NAMES = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];

/**
 * Omarchy colors.toml keys → the intermediate palette key we track.
 * @type {Record<string, string>}
 */
const COLOR_ALIAS = {
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
	black: 'black',
	bright_red: 'brightRed',
	bright_green: 'brightGreen',
	bright_yellow: 'brightYellow',
	bright_blue: 'brightBlue',
	bright_magenta: 'brightMagenta',
	bright_cyan: 'brightCyan',
	bright_black: 'brightBlack',
	bright_white: 'brightWhite'
};

/** @type {Record<string, string>} */
const SETTING_ALIAS = {
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

/**
 * @typedef {'light' | 'dark'} ThemeMode
 * @typedef {Record<string, string>} PaletteColors
 * @typedef {Record<string, string>} PaletteSettings
 * @typedef {{ colors: PaletteColors, settings: PaletteSettings }} ParsedThemeToml
 * @typedef {{ colorsToml?: string, alacrittyToml?: string, walkerCss?: string, hyprlandConf?: string }} OmarchyThemeFiles
 * @typedef {{ name: string, mode: ThemeMode, colors: PaletteColors, settings: PaletteSettings, source: string | null }} ComposedPalette
 */

/**
 * @param {string} toml
 * @returns {ParsedThemeToml}
 */
export function parseOmarchyThemeToml(toml) {
	/** @type {PaletteColors} */
	const colors = {};
	/** @type {PaletteSettings} */
	const settings = {};

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

/**
 * @param {string} toml
 * @returns {ParsedThemeToml}
 */
export function parseAlacrittyToml(toml) {
	/** @type {PaletteColors} */
	const colors = {};
	/** @type {PaletteSettings} */
	const settings = {};
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

/**
 * `@define-color selected-text` / `border` from walker.css — the accent and
 * border colours alacritty.toml never carries.
 * @param {string} css
 * @returns {{ accent?: string, border?: string }}
 */
export function readWalkerColors(css) {
	return {
		accent: matchDefineColor(css, 'selected-text'),
		border: matchDefineColor(css, 'border')
	};
}

/**
 * @param {string} hyprland
 * @returns {string | undefined}
 */
export function readHyprlandBorder(hyprland) {
	const match = hyprland.match(/col\.active_border\s*=\s*rgba?\(([0-9a-fA-F]{6,8})\)/);
	return match ? `#${match[1]}` : undefined;
}

/**
 * Fold the four Omarchy source files into the palette shape the server's
 * composeTheme (src/lib/server/theme-core.ts) accepts: background/foreground/
 * accent/border/cursor/selection* plus color0..color15.
 *
 * @param {{ name: string, mode?: ThemeMode, files: OmarchyThemeFiles, source?: string | null }} input
 * @returns {ComposedPalette}
 */
export function composeThemeFromFiles(input) {
	const explicit = input.files.colorsToml
		? parseOmarchyThemeToml(input.files.colorsToml)
		: { colors: {}, settings: {} };
	const fallback = input.files.alacrittyToml
		? parseAlacrittyToml(input.files.alacrittyToml)
		: { colors: {}, settings: {} };

	/** @type {PaletteColors} */
	const raw = { ...fallback.colors, ...explicit.colors };
	/** @type {PaletteSettings} */
	const settings = { ...fallback.settings, ...explicit.settings };
	const walker = readWalkerColors(input.files.walkerCss ?? '');
	const hyprlandBorder = readHyprlandBorder(input.files.hyprlandConf ?? '');

	promoteAnsiNames(raw);
	raw.accent ??= walker.accent ?? hyprlandBorder ?? raw.color4 ?? raw.blue ?? raw.foreground;
	raw.border ??= hyprlandBorder ?? walker.border ?? raw.accent;
	raw.color0 ??= raw.black ?? raw.darkerBackground ?? raw.darkBackground ?? raw.background;
	raw.color7 ??= raw.white ?? raw.lightForeground ?? raw.foreground;
	raw.color8 ??= raw.muted ?? raw.brightBlack ?? raw.darkForeground;
	raw.color15 ??= raw.brightWhite ?? raw.brightForeground ?? raw.color7;
	raw.selectionBackground ??= raw.selection ?? raw.accent;
	raw.selectionForeground ??= raw.brightForeground ?? raw.foreground;

	const mode = input.mode ?? (settings.mode === 'light' ? 'light' : 'dark');
	delete settings.mode;

	return {
		name: input.name,
		mode,
		colors: pickThemeColors(raw),
		settings,
		source: input.source ?? null
	};
}

/**
 * ANSI colour names (red/green/…) fill the numbered slots when those are absent.
 * @param {PaletteColors} colors
 */
function promoteAnsiNames(colors) {
	const map = {
		color1: 'red',
		color2: 'green',
		color3: 'yellow',
		color4: 'blue',
		color5: 'magenta',
		color6: 'cyan',
		color7: 'white',
		color9: 'brightRed',
		color10: 'brightGreen',
		color11: 'brightYellow',
		color12: 'brightBlue',
		color13: 'brightMagenta',
		color14: 'brightCyan'
	};

	for (const [slot, name] of Object.entries(map)) {
		if (!colors[slot] && colors[name]) {
			colors[slot] = colors[name];
		}
	}
}

const THEME_COLOR_KEYS = new Set([
	'accent',
	'border',
	'cursor',
	'foreground',
	'background',
	'selectionForeground',
	'selectionBackground'
]);

/**
 * Keep only the keys src/lib/server/theme-core.ts understands.
 * @param {PaletteColors} colors
 * @returns {PaletteColors}
 */
function pickThemeColors(colors) {
	/** @type {PaletteColors} */
	const out = {};

	for (const [key, value] of Object.entries(colors)) {
		if (value && (THEME_COLOR_KEYS.has(key) || /^color([0-9]|1[0-5])$/.test(key))) {
			out[key] = value;
		}
	}

	return out;
}

/** @param {string} key */
function normalizeColorKey(key) {
	const normalized = normalizeTomlKey(key);
	const colorMatch = normalized.match(/^color([0-9]|1[0-5])$/);

	if (colorMatch) {
		return `color${colorMatch[1]}`;
	}

	return COLOR_ALIAS[normalized] ?? null;
}

/** @param {string} key */
function normalizeSettingKey(key) {
	return SETTING_ALIAS[normalizeTomlKey(key)] ?? null;
}

/** @param {string} css @param {string} name */
function matchDefineColor(css, name) {
	const match = css.match(new RegExp(`@define-color\\s+${name}\\s+(#[0-9a-fA-F]{3,8})`));
	return match?.[1];
}

/** @param {string} value */
function normalizeTomlValue(value) {
	const trimmed = value.trim().replace(/,$/, '');

	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}

	return trimmed;
}

/** @param {string} value */
function normalizeHexColor(value) {
	const candidate = value.replace(/^0x/i, '#');
	return HEX_COLOR.test(candidate) ? candidate : null;
}

/** @param {string} key @param {string} value */
function normalizeSettingValue(key, value) {
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

/** @param {string} line */
function stripTomlComment(line) {
	/** @type {string | null} */
	let quote = null;

	for (let index = 0; index < line.length; index += 1) {
		const char = line[index];
		const previous = line[index - 1];

		if ((char === '"' || char === "'") && previous !== '\\') {
			quote = quote === char ? null : (quote ?? char);
		}

		if (char === '#' && quote === null) {
			return line.slice(0, index);
		}
	}

	return line;
}

/** @param {string} key */
function normalizeTomlKey(key) {
	return key.trim().toLowerCase().replaceAll('-', '_');
}
