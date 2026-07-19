import { Agent, request } from 'undici';
import type { ProxmoxConfig } from './homelab-config';

export type ProxmoxNode = {
	name: string;
	status: string;
	cpu: number;
	maxcpu: number;
	memUsed: number;
	memTotal: number;
	diskUsed: number;
	diskTotal: number;
	uptime: number;
};

export type ProxmoxGuest = {
	id: string;
	vmid: number;
	name: string;
	type: 'qemu' | 'lxc';
	node: string;
	status: string;
	cpu: number;
	memUsed: number;
	memTotal: number;
	diskTotal: number;
	uptime: number;
	tags: string[];
};

export type ProxmoxStatus = {
	name: string;
	reachable: boolean;
	error: string | null;
	nodes: ProxmoxNode[];
	guests: ProxmoxGuest[];
};

export type ProxmoxAction = 'start' | 'shutdown' | 'stop' | 'reboot';

export const PROXMOX_ACTIONS: readonly ProxmoxAction[] = ['start', 'shutdown', 'stop', 'reboot'];

const TIMEOUT_MS = 10_000;

// Proxmox ships a self-signed cert by default; this dispatcher opts out of TLS
// verification for the configured host only when allowSelfSigned is set.
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

type Resource = Record<string, unknown>;

export async function loadProxmox(config: ProxmoxConfig): Promise<ProxmoxStatus> {
	const base: ProxmoxStatus = {
		name: config.name,
		reachable: false,
		error: null,
		nodes: [],
		guests: []
	};

	try {
		const { statusCode, body } = await request(`${config.url}/api2/json/cluster/resources`, {
			headers: { Authorization: `PVEAPIToken=${config.tokenId}=${config.secret}` },
			dispatcher: config.allowSelfSigned ? insecureAgent : undefined,
			headersTimeout: TIMEOUT_MS,
			bodyTimeout: TIMEOUT_MS
		});

		if (statusCode < 200 || statusCode >= 300) {
			body.dump();
			return { ...base, error: httpError(statusCode) };
		}

		const payload = (await body.json()) as { data?: Resource[] };
		const resources = Array.isArray(payload.data) ? payload.data : [];

		return {
			...base,
			reachable: true,
			nodes: resources.filter((item) => item.type === 'node').map(toNode),
			guests: resources
				.filter((item) => item.type === 'qemu' || item.type === 'lxc')
				.map(toGuest)
				.sort(guestOrder)
		};
	} catch (error) {
		return { ...base, error: toMessage(error) };
	}
}

// Fires a power action against a guest. The endpoint queues a Proxmox task and
// returns immediately, so success here means "accepted", not "finished".
export async function controlProxmoxGuest(
	config: ProxmoxConfig,
	guest: { node: string; type: 'qemu' | 'lxc'; vmid: number },
	action: ProxmoxAction
): Promise<{ ok: true } | { ok: false; error: string }> {
	try {
		const { statusCode, body } = await request(
			`${config.url}/api2/json/nodes/${encodeURIComponent(guest.node)}/${guest.type}/${guest.vmid}/status/${action}`,
			{
				method: 'POST',
				headers: { Authorization: `PVEAPIToken=${config.tokenId}=${config.secret}` },
				dispatcher: config.allowSelfSigned ? insecureAgent : undefined,
				headersTimeout: TIMEOUT_MS,
				bodyTimeout: TIMEOUT_MS
			}
		);

		if (statusCode >= 200 && statusCode < 300) {
			body.dump();
			return { ok: true };
		}

		const reason = ((await body.text().catch(() => '')) || '').split('\n')[0].trim();
		return { ok: false, error: actionHttpError(statusCode, reason) };
	} catch (error) {
		return { ok: false, error: toMessage(error) };
	}
}

function actionHttpError(status: number, reason: string): string {
	if (status === 401) {
		return 'Authentication failed — check the token ID and secret.';
	}

	if (status === 403) {
		return 'Token lacks permission — power actions need the VM.PowerMgmt privilege (e.g. grant PVEVMAdmin alongside PVEAuditor).';
	}

	return reason || `HTTP ${status}`;
}

function toNode(item: Resource): ProxmoxNode {
	return {
		name: text(item.node) || text(item.name) || 'node',
		status: text(item.status) || 'unknown',
		cpu: num(item.cpu),
		maxcpu: num(item.maxcpu),
		memUsed: num(item.mem),
		memTotal: num(item.maxmem),
		diskUsed: num(item.disk),
		diskTotal: num(item.maxdisk),
		uptime: num(item.uptime)
	};
}

function toGuest(item: Resource): ProxmoxGuest {
	return {
		id: text(item.id),
		vmid: num(item.vmid),
		name: text(item.name) || text(item.id),
		type: item.type === 'qemu' ? 'qemu' : 'lxc',
		node: text(item.node),
		status: text(item.status) || 'unknown',
		cpu: num(item.cpu),
		memUsed: num(item.mem),
		memTotal: num(item.maxmem),
		diskTotal: num(item.maxdisk),
		uptime: num(item.uptime),
		tags: text(item.tags)
			.split(/[;,\s]+/)
			.filter(Boolean)
	};
}

// Running guests first, then alphabetical by name.
function guestOrder(left: ProxmoxGuest, right: ProxmoxGuest): number {
	const leftRunning = left.status === 'running' ? 0 : 1;
	const rightRunning = right.status === 'running' ? 0 : 1;
	return leftRunning - rightRunning || left.name.localeCompare(right.name);
}

function httpError(status: number): string {
	if (status === 401) {
		return 'Authentication failed — check the token ID and secret.';
	}

	if (status === 403) {
		return 'Token lacks permission — grant the PVEAuditor role.';
	}

	return `HTTP ${status}`;
}

function toMessage(error: unknown): string {
	if (error instanceof Error) {
		if (/timeout/i.test(error.name) || /timeout/i.test(error.message)) {
			return 'Timed out reaching the Proxmox API.';
		}

		if (/ECONNREFUSED|EHOSTUNREACH|ENOTFOUND|ETIMEDOUT/.test(error.message)) {
			return 'Could not connect — the host may be unreachable.';
		}

		return error.message;
	}

	return 'Failed to reach the Proxmox API.';
}

function num(value: unknown): number {
	const parsed = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown): string {
	if (typeof value === 'string') {
		return value;
	}

	return value == null ? '' : String(value);
}
