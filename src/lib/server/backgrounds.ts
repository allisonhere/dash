import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { dashboardConfigPath } from './dashboard-config';

// Per-instance wallpapers, one per theme slug, in the mounted config volume.
// Kept out of themes.json (binary) and out of the shared store; a slug here can
// be a built-in or a custom theme. Deliberately excluded from the Dash backup —
// re-import or re-upload restores an image.
const BACKGROUNDS_DIR = dashboardConfigPath('backgrounds');
const INDEX_FILE = dashboardConfigPath('backgrounds.json');

export const MAX_BACKGROUND_BYTES = 12 * 1024 * 1024;

export const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'] as const;

export const IMAGE_MIME: Record<string, string> = {
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.webp': 'image/webp',
	'.avif': 'image/avif',
	'.gif': 'image/gif'
};

type IndexEntry = { ext: string; updatedAt: number };
type BackgroundIndex = Record<string, IndexEntry>;

export function normalizeImageExt(value: string): string | null {
	const ext = value.trim().toLowerCase().replace(/^\.?/, '.');
	return (IMAGE_EXTS as readonly string[]).includes(ext) ? ext : null;
}

export function readBackgroundIndex(): BackgroundIndex {
	let parsed: unknown;

	try {
		parsed = JSON.parse(readFileSync(INDEX_FILE, 'utf8'));
	} catch {
		return {};
	}

	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return {};
	}

	const out: BackgroundIndex = {};

	for (const [slug, value] of Object.entries(parsed as Record<string, unknown>)) {
		if (value && typeof value === 'object') {
			const entry = value as Record<string, unknown>;
			const ext = typeof entry.ext === 'string' ? normalizeImageExt(entry.ext) : null;
			const updatedAt = typeof entry.updatedAt === 'number' ? entry.updatedAt : 0;

			if (ext) {
				out[slug] = { ext, updatedAt };
			}
		}
	}

	return out;
}

export function hasBackground(slug: string): boolean {
	return slug in readBackgroundIndex();
}

export function getBackground(
	slug: string
): { path: string; ext: string; updatedAt: number } | null {
	const entry = readBackgroundIndex()[slug];

	if (!entry) {
		return null;
	}

	return { path: join(BACKGROUNDS_DIR, `${slug}${entry.ext}`), ext: entry.ext, updatedAt: entry.updatedAt };
}

export function saveBackground(slug: string, rawExt: string, bytes: Uint8Array): IndexEntry {
	const ext = normalizeImageExt(rawExt);

	if (!ext) {
		throw new Error('Background must be a JPG, PNG, WebP, AVIF, or GIF image.');
	}

	if (bytes.byteLength === 0) {
		throw new Error('The image file is empty.');
	}

	if (bytes.byteLength > MAX_BACKGROUND_BYTES) {
		throw new Error(
			`The image is larger than the ${Math.round(MAX_BACKGROUND_BYTES / 1024 / 1024)} MB limit.`
		);
	}

	mkdirSync(BACKGROUNDS_DIR, { recursive: true });
	removeSlugFiles(slug);

	const target = join(BACKGROUNDS_DIR, `${slug}${ext}`);
	const temp = `${target}.tmp`;
	writeFileSync(temp, bytes);
	renameSync(temp, target);

	const entry: IndexEntry = { ext, updatedAt: Date.now() };
	writeIndex({ ...readBackgroundIndex(), [slug]: entry });
	return entry;
}

export function deleteBackground(slug: string): void {
	removeSlugFiles(slug);

	const index = readBackgroundIndex();

	if (slug in index) {
		delete index[slug];
		writeIndex(index);
	}
}

function removeSlugFiles(slug: string) {
	for (const ext of IMAGE_EXTS) {
		rmSync(join(BACKGROUNDS_DIR, `${slug}${ext}`), { force: true });
	}
}

function writeIndex(index: BackgroundIndex) {
	mkdirSync(dirname(INDEX_FILE), { recursive: true });

	const temp = `${INDEX_FILE}.tmp`;
	writeFileSync(temp, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
	renameSync(temp, INDEX_FILE);
}
