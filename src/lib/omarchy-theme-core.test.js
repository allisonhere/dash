import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { composeThemeFromLocalPayload, parseOmarchyThemeToml } from './omarchy-theme-core.js';

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

	it('composes current Omarchy semantic colors into Dash theme variables', () => {
		const theme = composeThemeFromLocalPayload({
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

		assert.equal(theme.mode, 'light');
		assert.equal(theme.cssVariables['--theme-bg'], '#f8fafc');
		assert.equal(theme.cssVariables['--theme-fg'], '#111827');
		assert.equal(theme.cssVariables['--theme-panel'], '#e5e7eb');
		assert.equal(theme.cssVariables['--theme-muted'], '#6b7280');
		assert.equal(theme.cssVariables['--theme-danger'], '#dc2626');
		assert.equal(theme.cssVariables['--theme-success'], '#16a34a');
		assert.equal(theme.cssVariables['--theme-warning'], '#ca8a04');
		assert.equal(theme.cssVariables['--theme-info'], '#0891b2');
	});
});
