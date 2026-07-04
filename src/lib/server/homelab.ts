import { loadHomelabConfig } from './homelab-config';
import { loadProxmox, type ProxmoxStatus } from './proxmox';
import { loadDockerHost, type DockerHostStatus } from './docker-ssh';

export type HomelabStatus = {
	configured: boolean;
	proxmox: ProxmoxStatus | null;
	dockerHosts: DockerHostStatus[];
};

// Shorter than the client's 10s poll so every poll sees fresh numbers; still
// coalesces bursts from multiple tabs into one Proxmox/SSH round trip.
const CACHE_TTL_MS = 8_000;

let cache: { fetchedAt: number; status: HomelabStatus } | null = null;

export async function loadHomelab(): Promise<HomelabStatus> {
	if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
		return cache.status;
	}

	const config = loadHomelabConfig();

	if (!config) {
		return { configured: false, proxmox: null, dockerHosts: [] };
	}

	// Each collector resolves to a status object (never throws), so a single
	// failing source can't take down the others.
	const [proxmox, dockerHosts] = await Promise.all([
		config.proxmox ? loadProxmox(config.proxmox) : Promise.resolve(null),
		Promise.all(config.dockerHosts.map((host) => loadDockerHost(host)))
	]);

	const status: HomelabStatus = { configured: true, proxmox, dockerHosts };
	cache = { fetchedAt: Date.now(), status };
	return status;
}

export function clearHomelabCache() {
	cache = null;
}
