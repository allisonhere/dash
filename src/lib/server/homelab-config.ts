import { readFileSync } from 'node:fs';
import { dashboardConfigPath } from './dashboard-config';

export type ProxmoxConfig = {
	name: string;
	url: string;
	tokenId: string;
	secret: string;
	allowSelfSigned: boolean;
};

export type DockerHostConfig = {
	name: string;
	ssh: string;
};

export type HomelabConfig = {
	proxmox: ProxmoxConfig | null;
	dockerHosts: DockerHostConfig[];
};

const HOMELAB_FILE = dashboardConfigPath('homelab.json');

/**
 * Reads ~/.config/custom-dash/homelab.json. Returns null when the file is
 * missing or unparseable, which drives the setup-guide empty state. Secrets in
 * the returned object must never be sent to the client.
 */
export function loadHomelabConfig(): HomelabConfig | null {
	let parsed: unknown;

	try {
		parsed = JSON.parse(readFileSync(HOMELAB_FILE, 'utf8'));
	} catch {
		return null;
	}

	if (!parsed || typeof parsed !== 'object') {
		return null;
	}

	const raw = parsed as Record<string, unknown>;
	const proxmox = parseProxmox(raw.proxmox);
	const dockerHosts = parseDockerHosts(raw.dockerHosts);

	if (!proxmox && dockerHosts.length === 0) {
		return null;
	}

	return { proxmox, dockerHosts };
}

export const homelabConfigPath = HOMELAB_FILE;

function parseProxmox(value: unknown): ProxmoxConfig | null {
	if (!value || typeof value !== 'object') {
		return null;
	}

	const raw = value as Record<string, unknown>;
	const url = str(raw.url);
	const tokenId = str(raw.tokenId);
	const secret = str(raw.secret);

	if (!url || !tokenId || !secret) {
		return null;
	}

	return {
		name: str(raw.name) || 'proxmox',
		url: url.replace(/\/+$/, ''),
		tokenId,
		secret,
		allowSelfSigned: raw.allowSelfSigned !== false
	};
}

function parseDockerHosts(value: unknown): DockerHostConfig[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value
		.map((entry, index): DockerHostConfig | null => {
			if (!entry || typeof entry !== 'object') {
				return null;
			}

			const raw = entry as Record<string, unknown>;
			const ssh = str(raw.ssh);

			if (!ssh) {
				return null;
			}

			return { name: str(raw.name) || `host-${index + 1}`, ssh };
		})
		.filter((host): host is DockerHostConfig => host !== null);
}

function str(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}
