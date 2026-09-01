// Shared appearance vocabulary: the settings page (client) and the config
// reader (server) both need the presets and the same clamping rules.

export type CornerStyle = 'sharp' | 'round';
export type Appearance = { corners: CornerStyle; radius: number };

export const RADIUS_PRESETS = [
	{ value: 4, label: 'Subtle' },
	{ value: 8, label: 'Rounded' },
	{ value: 14, label: 'Soft' },
	{ value: 22, label: 'Pill' }
] as const;

export const MIN_RADIUS = 2;
export const MAX_RADIUS = 32;
export const DEFAULT_APPEARANCE: Appearance = { corners: 'sharp', radius: 8 };

export function clampRadius(value: unknown): number {
	const radius = typeof value === 'string' ? Number(value) : value;

	if (typeof radius !== 'number' || !Number.isFinite(radius)) {
		return DEFAULT_APPEARANCE.radius;
	}

	return Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, Math.round(radius)));
}
