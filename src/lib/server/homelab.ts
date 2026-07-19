import { loadHomelabConfig } from './homelab-config';
import { controlProxmoxGuest, loadProxmox, PROXMOX_ACTIONS, type ProxmoxAction, type ProxmoxStatus } from './proxmox';
import {
	CONTAINER_NAME_RE,
	controlDockerContainer,
	DOCKER_ACTIONS,
	loadDockerHost,
	type DockerAction,
	type DockerHostStatus
} from './docker-ssh';

export type HomelabStatus = {
	configured: boolean;
	proxmox: ProxmoxStatus | null;
	dockerHosts: DockerHostStatus[];
};

export type HomelabActionResult =
	| { ok: true }
	| { ok: false; error: string; kind: 'validation' | 'upstream' };

// Shorter than the SSE loop's 5s cadence so every emit sees fresh numbers;
// still coalesces bursts from multiple tabs into one Proxmox/SSH round trip.
const CACHE_TTL_MS = 4_000;

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

// The client only ever sends a vmid and an action; node and guest type come
// from the server's own last-known status so a forged form can't point the
// Proxmox call anywhere it hasn't already observed.
export async function controlGuest(vmid: number, action: ProxmoxAction): Promise<HomelabActionResult> {
	if (!PROXMOX_ACTIONS.includes(action)) {
		return { ok: false, error: 'Unsupported action.', kind: 'validation' };
	}

	if (!Number.isInteger(vmid) || vmid <= 0) {
		return { ok: false, error: 'Invalid guest id.', kind: 'validation' };
	}

	const status = await loadHomelab();

	if (!status.proxmox?.reachable) {
		return { ok: false, error: 'Proxmox is not reachable.', kind: 'validation' };
	}

	const guest = status.proxmox.guests.find((candidate) => candidate.vmid === vmid);

	if (!guest) {
		return { ok: false, error: 'Unknown guest.', kind: 'validation' };
	}

	const config = loadHomelabConfig();

	if (!config?.proxmox) {
		return { ok: false, error: 'Proxmox is not configured.', kind: 'validation' };
	}

	const result = await controlProxmoxGuest(config.proxmox, guest, action);

	// Even a failed action may have changed state (e.g. a timed-out shutdown
	// that still went through), so always refetch on the next read.
	clearHomelabCache();

	return result.ok ? { ok: true } : { ...result, kind: 'upstream' };
}

export async function controlContainer(
	hostName: string,
	containerName: string,
	action: DockerAction
): Promise<HomelabActionResult> {
	if (!DOCKER_ACTIONS.includes(action)) {
		return { ok: false, error: 'Unsupported action.', kind: 'validation' };
	}

	if (!CONTAINER_NAME_RE.test(containerName)) {
		return { ok: false, error: 'Invalid container name.', kind: 'validation' };
	}

	// The SSH target always comes from server config, looked up by display
	// name — the client never supplies a connection string.
	const config = loadHomelabConfig();
	const host = config?.dockerHosts.find((candidate) => candidate.name === hostName);

	if (!host) {
		return { ok: false, error: 'Unknown host.', kind: 'validation' };
	}

	const status = await loadHomelab();
	const hostStatus = status.dockerHosts.find((candidate) => candidate.name === hostName);
	const known = hostStatus?.containers.some((container) => container.name === containerName);

	if (!known) {
		return { ok: false, error: 'Unknown container.', kind: 'validation' };
	}

	const result = await controlDockerContainer(host, containerName, action);
	clearHomelabCache();

	return result.ok ? { ok: true } : { ...result, kind: 'upstream' };
}

// --- SSE support -----------------------------------------------------------
// While at least one /homelab/events client is connected, poll upstream every
// POLL_INTERVAL_MS and notify subscribers only when the status meaningfully
// changed. With zero subscribers nothing polls, so an idle server stays quiet.

const POLL_INTERVAL_MS = 5_000;

const subscribers = new Set<() => void>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastSnapshot = '';

export function subscribeHomelab(onChange: () => void): () => void {
	subscribers.add(onChange);

	if (!pollTimer) {
		pollTimer = setInterval(() => void pollForChanges(), POLL_INTERVAL_MS);
	}

	return () => {
		subscribers.delete(onChange);

		if (subscribers.size === 0 && pollTimer) {
			clearInterval(pollTimer);
			pollTimer = null;
			lastSnapshot = '';
		}
	};
}

let polling = false;

async function pollForChanges() {
	if (polling) {
		return;
	}

	polling = true;

	try {
		clearHomelabCache();
		const status = await loadHomelab();
		const snapshot = JSON.stringify(status);

		if (snapshot !== lastSnapshot) {
			// Skip the very first comparison: the page just loaded this data via
			// its own request, so an immediate emit would only echo it.
			const isFirst = lastSnapshot === '';
			lastSnapshot = snapshot;

			if (!isFirst) {
				for (const notify of subscribers) {
					notify();
				}
			}
		}
	} catch {
		// Collectors don't throw, but stay safe: a failed poll just means no
		// notification this round.
	} finally {
		polling = false;
	}
}
