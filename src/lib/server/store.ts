import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { env } from '$env/dynamic/private';
import { dashboardConfigPath } from './dashboard-config';

// A named JSON collection (e.g. "bookmarks", "feeds") persisted either to a
// local file (default) or a shared remote HTTP store when DASH_STORE_URL is set.
// The remote backend lets several dash instances share one source of truth
// while each still reads its omarchy theme and homelab config locally.

const STORE_TIMEOUT_MS = 8_000;
const ALLOWED = new Set(['bookmarks', 'feeds', 'groups']);

function remoteConfig(): { url: string; token: string } | null {
	const url = env.DASH_STORE_URL?.trim();

	if (!url) {
		return null;
	}

	return { url, token: env.DASH_STORE_TOKEN?.trim() ?? '' };
}

export function isRemoteStore(): boolean {
	return remoteConfig() !== null;
}

export async function readCollection<T>(name: string): Promise<T[]> {
	assertName(name);
	const remote = remoteConfig();
	return remote ? readRemote<T>(name, remote) : readLocal<T>(name);
}

export async function writeCollection<T>(name: string, items: T[]): Promise<void> {
	assertName(name);
	const remote = remoteConfig();

	if (remote) {
		await writeRemote(name, items, remote);
	} else {
		writeLocal(name, items);
	}
}

function assertName(name: string) {
	if (!ALLOWED.has(name)) {
		throw new Error(`Unknown collection: ${name}`);
	}
}

function localPath(name: string) {
	return dashboardConfigPath(`${name}.json`);
}

function readLocal<T>(name: string): T[] {
	const file = localPath(name);

	try {
		const parsed = JSON.parse(readFileSync(file, 'utf8'));
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function writeLocal<T>(name: string, items: T[]) {
	const file = localPath(name);
	mkdirSync(dirname(file), { recursive: true });

	const tempFile = `${file}.tmp`;
	writeFileSync(tempFile, `${JSON.stringify(items, null, 2)}\n`, 'utf8');
	renameSync(tempFile, file);
}

function storeUrl(name: string, remote: { url: string }): string {
	const separator = remote.url.includes('?') ? '&' : '?';
	return `${remote.url}${separator}name=${encodeURIComponent(name)}`;
}

async function readRemote<T>(name: string, remote: { url: string; token: string }): Promise<T[]> {
	const response = await fetch(storeUrl(name, remote), {
		signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
		headers: authHeaders(remote.token)
	});

	if (!response.ok) {
		throw new Error(`Store read failed (HTTP ${response.status}).`);
	}

	const parsed = await response.json();
	return Array.isArray(parsed) ? parsed : [];
}

async function writeRemote<T>(
	name: string,
	items: T[],
	remote: { url: string; token: string }
): Promise<void> {
	const response = await fetch(storeUrl(name, remote), {
		method: 'POST',
		signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
		headers: { ...authHeaders(remote.token), 'Content-Type': 'application/json' },
		body: JSON.stringify(items)
	});

	if (!response.ok) {
		throw new Error(`Store write failed (HTTP ${response.status}).`);
	}
}

function authHeaders(token: string): Record<string, string> {
	return token ? { Authorization: `Bearer ${token}` } : {};
}
