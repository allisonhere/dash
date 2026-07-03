import { composeTheme, type OmarchyColors, type OmarchyTheme } from './omarchy-theme';

export type BuiltinTheme = {
	slug: string;
	label: string;
	mode: 'light' | 'dark';
	colors: OmarchyColors;
};

// Curated presets in the same palette shape as omarchy themes. Full 16-color
// palettes so the per-category accent cycling on bookmarks/news looks varied.
// themeToCssVariables maps color0→panel, color8→muted, color1/2/3/6→danger/
// success/warning/info, so keep those slots semantically correct.
const THEMES: BuiltinTheme[] = [
	{
		slug: 'aetheria',
		label: 'Aetheria',
		mode: 'dark',
		colors: {
			accent: '#be3f50',
			background: '#0e091d',
			foreground: '#14b9b5',
			cursor: '#ff7f41',
			selectionForeground: '#0e091d',
			selectionBackground: '#14b9b5',
			color0: '#000000',
			color1: '#e20342',
			color2: '#7cd699',
			color3: '#ffbe74',
			color4: '#be3f50',
			color5: '#9147a8',
			color6: '#04c5f0',
			color7: '#a60234',
			color8: '#c53253',
			color9: '#ce4f48',
			color10: '#f93d3b',
			color11: '#fd3e6a',
			color12: '#04c5f0',
			color13: '#6c032c',
			color14: '#ffbe74',
			color15: '#11aeb3'
		}
	},
	{
		slug: 'tokyo-night',
		label: 'Tokyo Night',
		mode: 'dark',
		colors: {
			accent: '#7aa2f7',
			background: '#1a1b26',
			foreground: '#c0caf5',
			cursor: '#c0caf5',
			color0: '#1f2335',
			color1: '#f7768e',
			color2: '#9ece6a',
			color3: '#e0af68',
			color4: '#7aa2f7',
			color5: '#bb9af7',
			color6: '#7dcfff',
			color7: '#a9b1d6',
			color8: '#414868',
			color9: '#f7768e',
			color10: '#9ece6a',
			color11: '#e0af68',
			color12: '#7aa2f7',
			color13: '#bb9af7',
			color14: '#7dcfff',
			color15: '#c0caf5'
		}
	},
	{
		slug: 'catppuccin',
		label: 'Catppuccin Mocha',
		mode: 'dark',
		colors: {
			accent: '#cba6f7',
			background: '#1e1e2e',
			foreground: '#cdd6f4',
			cursor: '#f5e0dc',
			color0: '#313244',
			color1: '#f38ba8',
			color2: '#a6e3a1',
			color3: '#f9e2af',
			color4: '#89b4fa',
			color5: '#f5c2e7',
			color6: '#94e2d5',
			color7: '#bac2de',
			color8: '#585b70',
			color9: '#f38ba8',
			color10: '#a6e3a1',
			color11: '#f9e2af',
			color12: '#89b4fa',
			color13: '#f5c2e7',
			color14: '#94e2d5',
			color15: '#a6adc8'
		}
	},
	{
		slug: 'gruvbox',
		label: 'Gruvbox',
		mode: 'dark',
		colors: {
			accent: '#fe8019',
			background: '#282828',
			foreground: '#ebdbb2',
			cursor: '#ebdbb2',
			color0: '#3c3836',
			color1: '#cc241d',
			color2: '#98971a',
			color3: '#d79921',
			color4: '#458588',
			color5: '#b16286',
			color6: '#689d6a',
			color7: '#a89984',
			color8: '#928374',
			color9: '#fb4934',
			color10: '#b8bb26',
			color11: '#fabd2f',
			color12: '#83a598',
			color13: '#d3869b',
			color14: '#8ec07c',
			color15: '#ebdbb2'
		}
	},
	{
		slug: 'nord',
		label: 'Nord',
		mode: 'dark',
		colors: {
			accent: '#88c0d0',
			background: '#2e3440',
			foreground: '#d8dee9',
			cursor: '#d8dee9',
			color0: '#3b4252',
			color1: '#bf616a',
			color2: '#a3be8c',
			color3: '#ebcb8b',
			color4: '#81a1c1',
			color5: '#b48ead',
			color6: '#88c0d0',
			color7: '#e5e9f0',
			color8: '#4c566a',
			color9: '#bf616a',
			color10: '#a3be8c',
			color11: '#ebcb8b',
			color12: '#81a1c1',
			color13: '#b48ead',
			color14: '#8fbcbb',
			color15: '#eceff4'
		}
	},
	{
		slug: 'rose-pine',
		label: 'Rosé Pine',
		mode: 'dark',
		colors: {
			accent: '#ebbcba',
			background: '#191724',
			foreground: '#e0def4',
			cursor: '#e0def4',
			color0: '#26233a',
			color1: '#eb6f92',
			color2: '#9ccfd8',
			color3: '#f6c177',
			color4: '#31748f',
			color5: '#c4a7e7',
			color6: '#9ccfd8',
			color7: '#e0def4',
			color8: '#6e6a86',
			color9: '#eb6f92',
			color10: '#9ccfd8',
			color11: '#f6c177',
			color12: '#31748f',
			color13: '#c4a7e7',
			color14: '#9ccfd8',
			color15: '#e0def4'
		}
	}
];

export const DEFAULT_BUILTIN = 'aetheria';

const BY_SLUG = new Map(THEMES.map((theme) => [theme.slug, theme]));

export function listBuiltinThemes(): Array<{ slug: string; label: string }> {
	return THEMES.map(({ slug, label }) => ({ slug, label }));
}

export function isBuiltinTheme(slug: string): boolean {
	return BY_SLUG.has(slug);
}

export function loadBuiltinTheme(slug: string): OmarchyTheme {
	const theme = BY_SLUG.get(slug) ?? BY_SLUG.get(DEFAULT_BUILTIN)!;
	return composeTheme({ name: theme.label, mode: theme.mode, colors: theme.colors });
}
