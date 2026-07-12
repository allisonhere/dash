// A group's color is stored either as a theme variable name ("--theme-color3"),
// a literal hex ("#b48ead"), or "" meaning "pick one from the palette for me".
// Theme vars are preferred because they re-tint when the omarchy theme changes;
// a hex stays put.

export const PALETTE = [
	'--theme-accent',
	'--theme-color12',
	'--theme-color3',
	'--theme-color6',
	'--theme-color5',
	'--theme-color11',
	'--theme-color14'
];

export const SWATCHES = [
	'--theme-accent',
	'--theme-color1',
	'--theme-color2',
	'--theme-color3',
	'--theme-color4',
	'--theme-color5',
	'--theme-color6',
	'--theme-color9',
	'--theme-color10',
	'--theme-color11',
	'--theme-color12',
	'--theme-color13',
	'--theme-color14',
	'--theme-color15'
];

export function isHex(color: string): boolean {
	return /^#[0-9a-f]{6}$/i.test(color.trim());
}

export function isThemeVar(color: string): boolean {
	return /^--theme-[a-z0-9-]+$/i.test(color.trim());
}

export function isValidColor(color: string): boolean {
	return color === '' || isHex(color) || isThemeVar(color);
}

// Resolves a stored color to something usable in a CSS value. `index` is the
// group's position, used to spread auto-colored groups across the palette.
export function cssColor(color: string, index = 0): string {
	const value = color.trim();

	if (isHex(value)) {
		return value;
	}

	if (isThemeVar(value)) {
		return `var(${value}, var(--theme-accent))`;
	}

	return `var(${PALETTE[index % PALETTE.length]}, var(--theme-accent))`;
}
