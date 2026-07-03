const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const CSS_LENGTH = /^-?\d+(?:\.\d+)?(?:px|rem|em|vh|vw|vmin|vmax|%)?$/;
const ANSI_NAMES = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];

/** @type {Record<string, string>} */
const COLOR_ALIAS = {
	accent: 'accent',
	border: 'border',
	border_color: 'border',
	cursor: 'cursor',
	foreground: 'foreground',
	background: 'background',
	selection_foreground: 'selectionForeground',
	selection_background: 'selectionBackground'
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
 * @typedef {Partial<Record<string, string>>} OmarchyColors
 * @typedef {Partial<Record<string, string>>} OmarchySettings
 * @typedef {{ colors: OmarchyColors, settings: OmarchySettings }} ParsedThemeToml
 * @typedef {{ name: string, mode: ThemeMode, source: string | null, background: string | null, backgroundVersion: number | null, colors: OmarchyColors, settings: OmarchySettings, cssVariables: Record<string, string>, cssText: string }} OmarchyTheme
 * @typedef {{ name: string, mode?: ThemeMode, files: { colorsToml?: string, alacrittyToml?: string, walkerCss?: string, hyprlandConf?: string } }} LocalOmarchyPayload
 */

/**
 * @param {string} toml
 * @returns {ParsedThemeToml}
 */
export function parseOmarchyThemeToml(toml) {
	/** @type {OmarchyColors} */
	const colors = {};
	/** @type {OmarchySettings} */
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

/**
 * @param {string} toml
 * @returns {ParsedThemeToml}
 */
export function parseAlacrittyToml(toml) {
	/** @type {OmarchyColors} */
	const colors = {};
	/** @type {OmarchySettings} */
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
 * @param {ParsedThemeToml} theme
 * @returns {Record<string, string>}
 */
export function themeToCssVariables(theme) {
	/** @type {Record<string, string>} */
	const cssVariables = {};

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

/**
 * @param {Record<string, string>} variables
 * @returns {string}
 */
export function cssVariablesToText(variables) {
	return Object.entries(variables)
		.map(([key, value]) => `${key}: ${value}`)
		.join('; ');
}

/**
 * @param {{ name: string, mode?: ThemeMode, colors: OmarchyColors, settings?: OmarchySettings, source?: string | null, background?: string | null, backgroundVersion?: number | null }} input
 * @returns {OmarchyTheme}
 */
export function composeTheme(input) {
	/** @type {OmarchyColors} */
	const colors = { ...input.colors };
	/** @type {OmarchySettings} */
	const settings = { ...(input.settings ?? {}) };

	colors.accent ??= colors.color4 ?? colors.foreground;
	colors.border ??= colors.accent;
	colors.selectionBackground ??= colors.accent;
	colors.selectionForeground ??= colors.background;

	const cssVariables = themeToCssVariables({ colors, settings });

	return {
		name: input.name,
		mode: input.mode ?? 'dark',
		source: input.source ?? null,
		background: input.background ?? null,
		backgroundVersion: input.backgroundVersion ?? null,
		colors,
		settings,
		cssVariables,
		cssText: cssVariablesToText(cssVariables)
	};
}

/**
 * @param {LocalOmarchyPayload} payload
 * @returns {OmarchyTheme}
 */
export function composeThemeFromLocalPayload(payload) {
	const explicit = payload.files.colorsToml
		? parseOmarchyThemeToml(payload.files.colorsToml)
		: { colors: {}, settings: {} };
	const fallback = payload.files.alacrittyToml
		? parseAlacrittyToml(payload.files.alacrittyToml)
		: { colors: {}, settings: {} };

	/** @type {OmarchyColors} */
	const colors = { ...fallback.colors, ...explicit.colors };
	const settings = { ...fallback.settings, ...explicit.settings };
	const walker = readWalkerColors(payload.files.walkerCss ?? '');
	const hyprlandBorder = readHyprlandBorder(payload.files.hyprlandConf ?? '');

	colors.accent ??= walker.accent ?? hyprlandBorder ?? colors.color4 ?? colors.foreground;
	colors.border ??= hyprlandBorder ?? walker.border ?? colors.accent;

	return composeTheme({
		name: payload.name,
		mode: payload.mode ?? 'dark',
		colors,
		settings,
		source: 'local helper'
	});
}

/**
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
 * @param {string} css
 * @param {string} name
 */
function matchDefineColor(css, name) {
	const match = css.match(new RegExp(`@define-color\\s+${name}\\s+(#[0-9a-fA-F]{3,8})`));
	return match?.[1];
}

/**
 * @param {string} key
 */
function normalizeColorKey(key) {
	const normalized = normalizeTomlKey(key);
	const colorMatch = normalized.match(/^color([0-9]|1[0-5])$/);

	if (colorMatch) {
		return `color${colorMatch[1]}`;
	}

	return COLOR_ALIAS[normalized] ?? null;
}

/**
 * @param {string} key
 */
function normalizeSettingKey(key) {
	return SETTING_ALIAS[normalizeTomlKey(key)] ?? null;
}

/**
 * @param {string} value
 */
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

/**
 * @param {string} value
 */
function normalizeHexColor(value) {
	const candidate = value.replace(/^0x/i, '#');
	return HEX_COLOR.test(candidate) ? candidate : null;
}

/**
 * @param {string} key
 * @param {string} value
 */
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

/**
 * @param {string} line
 */
function stripTomlComment(line) {
	/** @type {string | null} */
	let quote = null;

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

/**
 * @param {Record<string, string>} variables
 * @param {string} key
 * @param {string | undefined} value
 */
function addAlias(variables, key, value) {
	if (value) {
		variables[key] = value;
	}
}

/**
 * @param {string} value
 */
function camelToKebab(value) {
	return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * @param {string} key
 */
function normalizeTomlKey(key) {
	return key.trim().toLowerCase().replaceAll('-', '_');
}
