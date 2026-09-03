// Shared appearance vocabulary: the settings page (client) and the config
// reader (server) both need the presets and the same clamping rules.

export type CornerStyle = 'sharp' | 'round';
export type Appearance = {
	corners: CornerStyle;
	radius: number;
	surfaceOpacity: number;
	backgroundBlur: number;
};

export const RADIUS_PRESETS = [
	{ value: 4, label: 'Subtle' },
	{ value: 8, label: 'Rounded' },
	{ value: 14, label: 'Soft' },
	{ value: 22, label: 'Pill' }
] as const;

export const MIN_RADIUS = 2;
export const MAX_RADIUS = 32;

// Panel translucency, as a percentage of the theme's panel colour. Below 100 the
// wallpaper (or the page background) shows through; 40 is about as sheer as the
// text stays readable over.
export const MIN_SURFACE_OPACITY = 40;
export const MAX_SURFACE_OPACITY = 100;

export const MIN_BACKGROUND_BLUR = 0;
export const MAX_BACKGROUND_BLUR = 24;

export const DEFAULT_APPEARANCE: Appearance = {
	corners: 'sharp',
	radius: 8,
	surfaceOpacity: 100,
	backgroundBlur: 8
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
	const n = typeof value === 'string' ? Number(value) : value;

	if (typeof n !== 'number' || !Number.isFinite(n)) {
		return fallback;
	}

	return Math.min(max, Math.max(min, Math.round(n)));
}

export function clampRadius(value: unknown): number {
	return clampInt(value, MIN_RADIUS, MAX_RADIUS, DEFAULT_APPEARANCE.radius);
}

export function clampSurfaceOpacity(value: unknown): number {
	return clampInt(value, MIN_SURFACE_OPACITY, MAX_SURFACE_OPACITY, DEFAULT_APPEARANCE.surfaceOpacity);
}

export function clampBackgroundBlur(value: unknown): number {
	return clampInt(value, MIN_BACKGROUND_BLUR, MAX_BACKGROUND_BLUR, DEFAULT_APPEARANCE.backgroundBlur);
}
