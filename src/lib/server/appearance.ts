import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import {
	clampBackgroundBlur,
	clampRadius,
	clampSurfaceOpacity,
	DEFAULT_APPEARANCE,
	type Appearance
} from '$lib/appearance';
import { dashboardConfigPath } from './dashboard-config';

// Per-instance, like the theme selection: how a dash looks on this screen is a
// per-machine concern and is never synced to the shared webhost store.
const APPEARANCE_FILE = dashboardConfigPath('appearance.json');

export function readAppearance(): Appearance {
	let parsed: unknown;

	try {
		parsed = JSON.parse(readFileSync(APPEARANCE_FILE, 'utf8'));
	} catch {
		return { ...DEFAULT_APPEARANCE };
	}

	if (!parsed || typeof parsed !== 'object') {
		return { ...DEFAULT_APPEARANCE };
	}

	const raw = parsed as Record<string, unknown>;

	return {
		corners: raw.corners === 'round' ? 'round' : 'sharp',
		radius: clampRadius(raw.radius),
		surfaceOpacity: clampSurfaceOpacity(raw.surfaceOpacity),
		backgroundBlur: clampBackgroundBlur(raw.backgroundBlur)
	};
}

export function writeAppearance(appearance: Appearance) {
	mkdirSync(dirname(APPEARANCE_FILE), { recursive: true });

	const tempFile = `${APPEARANCE_FILE}.tmp`;
	writeFileSync(tempFile, `${JSON.stringify(appearance, null, 2)}\n`, 'utf8');
	renameSync(tempFile, APPEARANCE_FILE);
}
