import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { composeThemeFromFiles } from '$lib/omarchy-theme-core.js';
import { composeTheme, type DashTheme, type ThemeColors, type ThemeSettings } from './theme-core';

const run = promisify(execFile);

type OmarchyThemeFiles = {
	colorsToml?: string;
	alacrittyToml?: string;
	walkerCss?: string;
	hyprlandConf?: string;
};

const CLONE_TIMEOUT_MS = 20_000;

// scp-style (git@host:path) or an explicit safe scheme. `file://`, `ext::` and
// anything git could read as a flag are rejected before it reaches the CLI.
const SCP_LIKE = /^[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+:[^\s]+$/;
const SAFE_SCHEME = /^(https?|ssh|git):\/\/[^\s]+$/i;

const THEME_FILE_NAMES = {
	colorsToml: ['colors.toml', 'dark.toml', 'light.toml'],
	alacrittyToml: ['alacritty.toml'],
	walkerCss: ['walker.css'],
	hyprlandConf: ['hyprland.conf']
} as const;

export type ImportedTheme = {
	label: string;
	mode: 'light' | 'dark';
	theme: DashTheme;
	source: string;
};

export function assertGitUrl(url: string): string {
	const trimmed = url.trim();

	if (!trimmed) {
		throw new Error('Paste the theme repository URL.');
	}

	if (trimmed.startsWith('-') || trimmed.includes(' ')) {
		throw new Error('That does not look like a git URL.');
	}

	if (!SAFE_SCHEME.test(trimmed) && !SCP_LIKE.test(trimmed)) {
		throw new Error('Use an https, ssh, or git@ repository URL.');
	}

	return trimmed;
}

/**
 * Clone an Omarchy theme repo (the same URL `omarchy-theme-install` takes),
 * read whichever of colors.toml / alacritty.toml / walker.css / hyprland.conf
 * it ships, and convert them into a Dash theme. Nothing is persisted here.
 */
export async function importOmarchyThemeFromGit(
	rawUrl: string,
	nameOverride?: string
): Promise<ImportedTheme> {
	const url = assertGitUrl(rawUrl);
	const workDir = mkdtempSync(join(tmpdir(), 'dash-theme-'));

	try {
		await cloneRepo(url, workDir);

		const themeDir = findThemeDir(workDir);
		const files = readThemeFiles(themeDir);

		if (Object.keys(files).length === 0) {
			throw new Error(
				'No colors.toml, alacritty.toml, walker.css, or hyprland.conf found in that repository.'
			);
		}

		const label = (nameOverride?.trim() || labelFromUrl(url)).slice(0, 60);
		const palette = composeThemeFromFiles({ name: label, files, source: url });

		if (Object.keys(palette.colors).length === 0) {
			throw new Error('That theme did not contain any colours Dash could read.');
		}

		// composeThemeFromFiles has already narrowed colours to theme-core's slots
		// (background/foreground/accent/border/cursor/selection*, color0..15).
		const theme = composeTheme({
			name: label,
			mode: palette.mode,
			colors: palette.colors as ThemeColors,
			settings: palette.settings as ThemeSettings
		});

		return { label, mode: palette.mode, theme, source: url };
	} finally {
		rmSync(workDir, { recursive: true, force: true });
	}
}

async function cloneRepo(url: string, workDir: string): Promise<void> {
	const opts = { timeout: CLONE_TIMEOUT_MS, maxBuffer: 1024 * 1024 } as const;

	try {
		await run('git', ['clone', '--depth', '1', '--single-branch', '--', url, workDir], opts);
		return;
	} catch (error) {
		// Some plain/dumb git servers reject shallow clones; fall back to a full one.
		if (!/shallow|dumb http/i.test(error instanceof Error ? error.message : '')) {
			throw new Error(cloneErrorMessage(error));
		}
	}

	try {
		rmSync(workDir, { recursive: true, force: true });
		await run('git', ['clone', '--single-branch', '--', url, workDir], opts);
	} catch (error) {
		throw new Error(cloneErrorMessage(error));
	}
}

// Omarchy theme repos put the files at the root; a few wrap everything in a
// single sub-directory. Look one level down when the root has nothing.
function findThemeDir(root: string): string {
	if (hasAnyThemeFile(root)) {
		return root;
	}

	for (const entry of readdirSync(root, { withFileTypes: true })) {
		if (entry.isDirectory() && entry.name !== '.git') {
			const child = join(root, entry.name);

			if (hasAnyThemeFile(child)) {
				return child;
			}
		}
	}

	return root;
}

function hasAnyThemeFile(dir: string): boolean {
	const wanted = new Set<string>(Object.values(THEME_FILE_NAMES).flat());

	try {
		return readdirSync(dir).some((name) => wanted.has(name.toLowerCase()));
	} catch {
		return false;
	}
}

function readThemeFiles(dir: string): OmarchyThemeFiles {
	const files: OmarchyThemeFiles = {};

	for (const [key, candidates] of Object.entries(THEME_FILE_NAMES) as Array<
		[keyof OmarchyThemeFiles, readonly string[]]
	>) {
		for (const candidate of candidates) {
			const text = readFileIfSmall(join(dir, candidate));

			if (text !== null) {
				files[key] = text;
				break;
			}
		}
	}

	return files;
}

function readFileIfSmall(path: string): string | null {
	try {
		if (statSync(path).size > 256 * 1024) {
			return null;
		}

		return readFileSync(path, 'utf8');
	} catch {
		return null;
	}
}

function labelFromUrl(url: string): string {
	const tail = url.replace(/\.git$/i, '').replace(/\/+$/, '');
	const name = basename(tail.includes(':') && !tail.includes('/') ? tail.split(':').pop()! : tail);
	const cleaned = name
		.replace(/^omarchy[-_]/i, '')
		.replace(/[-_]theme$/i, '')
		.replace(/[-_]+/g, ' ')
		.trim();

	if (!cleaned) {
		return 'Imported theme';
	}

	return cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function cloneErrorMessage(error: unknown): string {
	const detail = error instanceof Error ? error.message : String(error);

	if (/ENOENT/.test(detail)) {
		return 'git is not installed on this server, so themes cannot be cloned.';
	}

	if (/timed out|ETIMEDOUT/i.test(detail)) {
		return 'Cloning the repository timed out.';
	}

	if (/not found|could not read|repository .* does not exist|Authentication failed/i.test(detail)) {
		return 'That repository could not be cloned. Check the URL is public and correct.';
	}

	return `Cloning the repository failed: ${detail.split('\n').pop()?.trim() || detail}`;
}
