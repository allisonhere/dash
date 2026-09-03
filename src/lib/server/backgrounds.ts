import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { dashboardConfigPath } from './dashboard-config';

// Per-instance wallpapers, one per theme slug, in the mounted config volume.
// Kept out of themes.json (binary) and out of the shared store; a slug here can
// be a built-in or a custom theme. Deliberately excluded from the Dash backup —
// re-import or re-upload restores an image.
const BACKGROUNDS_DIR = dashboardConfigPath('backgrounds');
const INDEX_FILE = dashboardConfigPath('backgrounds.json');

// Ceiling on the *incoming* file. Omarchy themes routinely ship 15-25 MB PNGs
// (some 8K); they are downscaled to a WebP well under 1 MB before being stored,
// so this only guards against absurd uploads. BODY_SIZE_LIMIT in the image is
// set above this so a hand upload this large reaches the handler.
export const MAX_BACKGROUND_BYTES = 40 * 1024 * 1024;

// Every stored wallpaper is normalised to this: a browser painting (and
// blurring) a 33-megapixel background freezes the compositor, so cap the long
// edge and re-encode. 2560px covers a 1440p display crisply and upscales fine
// on 4K, especially behind translucent panels.
const WALLPAPER_MAX_DIM = 2560;
const WALLPAPER_QUALITY = 80;

// The one extension anything is stored as now; the others are still recognised
// so wallpapers saved by an older build keep resolving until they're replaced.
export const IMAGE_EXTS = ['.webp', '.jpg', '.jpeg', '.png', '.avif', '.gif'] as const;

export const IMAGE_MIME: Record<string, string> = {
	'.webp': 'image/webp',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
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

/**
 * Downscale + re-encode an arbitrary image to a lightweight WebP suitable for a
 * full-page background. Throws if the bytes are not a decodable image.
 */
export async function processWallpaper(bytes: Uint8Array): Promise<Buffer> {
	if (bytes.byteLength === 0) {
		throw new Error('The image file is empty.');
	}

	if (bytes.byteLength > MAX_BACKGROUND_BYTES) {
		throw new Error(
			`The image is larger than the ${Math.round(MAX_BACKGROUND_BYTES / 1024 / 1024)} MB limit.`
		);
	}

	try {
		return await sharp(bytes, { failOn: 'error' })
			.rotate() // honour EXIF orientation before resizing
			.resize({
				width: WALLPAPER_MAX_DIM,
				height: WALLPAPER_MAX_DIM,
				fit: 'inside',
				withoutEnlargement: true
			})
			.webp({ quality: WALLPAPER_QUALITY })
			.toBuffer();
	} catch {
		throw new Error('That file could not be read as an image.');
	}
}

export async function saveBackground(slug: string, bytes: Uint8Array): Promise<IndexEntry> {
	const webp = await processWallpaper(bytes);

	mkdirSync(BACKGROUNDS_DIR, { recursive: true });
	removeSlugFiles(slug);

	const target = join(BACKGROUNDS_DIR, `${slug}.webp`);
	const temp = `${target}.tmp`;
	writeFileSync(temp, webp);
	renameSync(temp, target);

	const entry: IndexEntry = { ext: '.webp', updatedAt: Date.now() };
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
