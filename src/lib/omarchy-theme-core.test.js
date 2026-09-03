import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	composeThemeFromFiles,
	parseAlacrittyToml,
	parseOmarchyThemeToml
} from './omarchy-theme-core.js';

describe('omarchy theme parser', () => {
	it('parses current Omarchy colors.toml semantic palette keys', () => {
		const parsed = parseOmarchyThemeToml(`
			mode = "light"
			accent = "#7aa2f7"
			selection = "#dde3f0"
			muted = "#6b7280"
			background = "#f8fafc"
			darker_background = "#e5e7eb"
			foreground = "#111827"
			bright_foreground = "#030712"
			red = "#dc2626"
			green = "#16a34a"
			yellow = "#ca8a04"
			blue = "#2563eb"
			magenta = "#c026d3"
			cyan = "#0891b2"
		`);

		assert.equal(parsed.settings.mode, 'light');
		assert.equal(parsed.colors.accent, '#7aa2f7');
		assert.equal(parsed.colors.selectionBackground, '#dde3f0');
		assert.equal(parsed.colors.muted, '#6b7280');
		assert.equal(parsed.colors.darkerBackground, '#e5e7eb');
		assert.equal(parsed.colors.brightForeground, '#030712');
		assert.equal(parsed.colors.red, '#dc2626');
	});

	it('ignores commented-out and non-hex values', () => {
		const parsed = parseOmarchyThemeToml(`
			background = "#101010" # main bg
			# accent = "#ffffff"
			foreground = "not-a-color"
		`);

		assert.equal(parsed.colors.background, '#101010');
		assert.equal(parsed.colors.accent, undefined);
		assert.equal(parsed.colors.foreground, undefined);
	});

	it('reads alacritty.toml sections as a palette fallback', () => {
		const parsed = parseAlacrittyToml(`
			[colors.primary]
			background = "0x1a1b26"
			foreground = "#c0caf5"

			[colors.normal]
			black = "#15161e"
			red = "#f7768e"

			[colors.bright]
			red = "#ff899d"

			[window]
			opacity = 0.92
		`);

		assert.equal(parsed.colors.background, '#1a1b26');
		assert.equal(parsed.colors.foreground, '#c0caf5');
		assert.equal(parsed.colors.color0, '#15161e');
		assert.equal(parsed.colors.color1, '#f7768e');
		assert.equal(parsed.colors.color9, '#ff899d');
		assert.equal(parsed.settings.opacity, '0.92');
	});
});

describe('composeThemeFromFiles', () => {
	it('folds semantic Omarchy colours into canonical theme slots', () => {
		const palette = composeThemeFromFiles({
			name: 'Quattro Test',
			files: {
				colorsToml: `
					mode = "light"
					accent = "#7aa2f7"
					muted = "#6b7280"
					background = "#f8fafc"
					darker_background = "#e5e7eb"
					foreground = "#111827"
					bright_foreground = "#030712"
					red = "#dc2626"
					green = "#16a34a"
					yellow = "#ca8a04"
					cyan = "#0891b2"
				`
			}
		});

		assert.equal(palette.mode, 'light');
		assert.equal(palette.colors.background, '#f8fafc');
		assert.equal(palette.colors.foreground, '#111827');
		assert.equal(palette.colors.color0, '#e5e7eb');
		assert.equal(palette.colors.color8, '#6b7280');
		assert.equal(palette.colors.color1, '#dc2626');
		assert.equal(palette.colors.color2, '#16a34a');
		assert.equal(palette.colors.color3, '#ca8a04');
		assert.equal(palette.colors.color6, '#0891b2');
		assert.equal(palette.colors.accent, '#7aa2f7');
		// Intermediate keys must not leak through to the theme palette.
		assert.equal('muted' in palette.colors, false);
		assert.equal('mode' in palette.settings, false);
	});

	it('falls back to alacritty.toml and fills accent/border from walker + hyprland', () => {
		const palette = composeThemeFromFiles({
			name: 'Fallback',
			source: 'https://example.com/theme.git',
			files: {
				alacrittyToml: `
					[colors.primary]
					background = "#1a1b26"
					foreground = "#c0caf5"
					[colors.normal]
					blue = "#7aa2f7"
				`,
				walkerCss: '@define-color selected-text #bb9af7;',
				hyprlandConf: 'col.active_border = rgba(7aa2f7ff)'
			}
		});

		assert.equal(palette.mode, 'dark');
		assert.equal(palette.colors.background, '#1a1b26');
		assert.equal(palette.colors.accent, '#bb9af7');
		assert.equal(palette.colors.border, '#7aa2f7ff');
		assert.equal(palette.source, 'https://example.com/theme.git');
	});

	it('prefers colors.toml over alacritty.toml when both define a slot', () => {
		const palette = composeThemeFromFiles({
			name: 'Precedence',
			files: {
				colorsToml: 'background = "#000000"',
				alacrittyToml: '[colors.primary]\nbackground = "#ffffff"'
			}
		});

		assert.equal(palette.colors.background, '#000000');
	});
});
