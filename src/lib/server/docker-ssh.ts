import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { DockerHostConfig } from './homelab-config';

const run = promisify(execFile);

export type DockerContainer = {
	name: string;
	image: string;
	state: string;
	status: string;
	cpu: number;
	memUsed: number;
	memLimit: number;
};

export type DockerHostStatus = {
	name: string;
	target: string;
	reachable: boolean;
	error: string | null;
	host: { load: number[]; memUsed: number; memTotal: number; uptime: string } | null;
	containers: DockerContainer[];
};

const SSH_TIMEOUT_MS = 15_000;

// One round-trip: container list + live stats + host vitals, split by markers.
// Avoids `{{json .}}` for `docker ps` because its Labels field is megabytes.
const REMOTE_SCRIPT = [
	"echo '#PS'",
	"docker ps -a --format '{{.Names}}\\t{{.Image}}\\t{{.State}}\\t{{.Status}}'",
	"echo '#STATS'",
	"docker stats --no-stream --format '{{.Name}}\\t{{.CPUPerc}}\\t{{.MemUsage}}'",
	"echo '#HOST'",
	'cat /proc/loadavg',
	"free -b | awk '/^Mem:/{print $2, $3}'",
	'uptime -p'
].join('\n');

export async function loadDockerHost(config: DockerHostConfig): Promise<DockerHostStatus> {
	const base: DockerHostStatus = {
		name: config.name,
		target: config.ssh,
		reachable: false,
		error: null,
		host: null,
		containers: []
	};

	try {
		// A "local" target runs the docker script in this process's own
		// environment — used by the container, which talks to the host's Docker
		// via a mounted socket instead of SSH. Otherwise SSH to the named host.
		const isLocal = config.ssh === 'local' || config.ssh === '';

		const { stdout } = isLocal
			? await run('sh', ['-c', REMOTE_SCRIPT], {
					timeout: SSH_TIMEOUT_MS,
					maxBuffer: 4 * 1024 * 1024
				})
			: await run(
					'ssh',
					[
						'-o', 'BatchMode=yes',
						'-o', 'ConnectTimeout=5',
						'-o', 'StrictHostKeyChecking=accept-new',
						config.ssh,
						REMOTE_SCRIPT
					],
					{ timeout: SSH_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 }
				);

		return parseOutput(stdout, base);
	} catch (error) {
		return { ...base, error: sshError(error) };
	}
}

function parseOutput(stdout: string, base: DockerHostStatus): DockerHostStatus {
	const sections = splitSections(stdout);
	const stats = parseStats(sections.stats);

	const containers = sections.ps
		.map((line) => {
			const [name, image, state, status] = line.split('\t');

			if (!name) {
				return null;
			}

			const stat = stats.get(name);

			return {
				name,
				image: image ?? '',
				state: state ?? 'unknown',
				status: status ?? '',
				cpu: stat?.cpu ?? 0,
				memUsed: stat?.memUsed ?? 0,
				memLimit: stat?.memLimit ?? 0
			};
		})
		.filter((container): container is DockerContainer => container !== null)
		.sort(containerOrder);

	return {
		...base,
		reachable: true,
		host: parseHost(sections.host),
		containers
	};
}

function splitSections(stdout: string) {
	const lines = stdout.split('\n');
	const buckets: Record<'ps' | 'stats' | 'host', string[]> = { ps: [], stats: [], host: [] };
	let current: 'ps' | 'stats' | 'host' | null = null;

	for (const rawLine of lines) {
		const line = rawLine.replace(/\r$/, '');

		if (line === '#PS') {
			current = 'ps';
		} else if (line === '#STATS') {
			current = 'stats';
		} else if (line === '#HOST') {
			current = 'host';
		} else if (current && line.trim()) {
			buckets[current].push(line);
		}
	}

	return buckets;
}

function parseStats(lines: string[]): Map<string, { cpu: number; memUsed: number; memLimit: number }> {
	const stats = new Map<string, { cpu: number; memUsed: number; memLimit: number }>();

	for (const line of lines) {
		const [name, cpuPerc, memUsage] = line.split('\t');

		if (!name) {
			continue;
		}

		const [used, limit] = (memUsage ?? '').split('/');

		stats.set(name, {
			cpu: parsePercent(cpuPerc),
			memUsed: parseBytes(used),
			memLimit: parseBytes(limit)
		});
	}

	return stats;
}

function parseHost(lines: string[]): DockerHostStatus['host'] {
	if (lines.length === 0) {
		return null;
	}

	const load = (lines[0] ?? '').split(/\s+/).slice(0, 3).map(Number);
	const [memTotal, memUsed] = (lines[1] ?? '').split(/\s+/).map(Number);
	const uptime = (lines[2] ?? '').replace(/^up\s+/, '');

	return {
		load: load.every(Number.isFinite) ? load : [0, 0, 0],
		memUsed: Number.isFinite(memUsed) ? memUsed : 0,
		memTotal: Number.isFinite(memTotal) ? memTotal : 0,
		uptime
	};
}

// Running first, then alphabetical.
function containerOrder(left: DockerContainer, right: DockerContainer): number {
	const leftRunning = left.state === 'running' ? 0 : 1;
	const rightRunning = right.state === 'running' ? 0 : 1;
	return leftRunning - rightRunning || left.name.localeCompare(right.name);
}

function parsePercent(value: string | undefined): number {
	const parsed = Number.parseFloat((value ?? '').replace('%', ''));
	return Number.isFinite(parsed) ? parsed : 0;
}

const UNIT_MULTIPLIERS: Record<string, number> = {
	b: 1,
	kb: 1e3,
	kib: 1024,
	mb: 1e6,
	mib: 1024 ** 2,
	gb: 1e9,
	gib: 1024 ** 3,
	tb: 1e12,
	tib: 1024 ** 4
};

// Docker prints memory like "231.2MiB" or "7.635GiB".
function parseBytes(value: string | undefined): number {
	const match = (value ?? '').trim().match(/^([\d.]+)\s*([a-z]+)?$/i);

	if (!match) {
		return 0;
	}

	const amount = Number.parseFloat(match[1]);
	const unit = (match[2] ?? 'b').toLowerCase();
	return Number.isFinite(amount) ? amount * (UNIT_MULTIPLIERS[unit] ?? 1) : 0;
}

function sshError(error: unknown): string {
	const err = error as { killed?: boolean; code?: string | number; stderr?: string };

	if (err?.killed) {
		return 'SSH connection timed out.';
	}

	const stderr = (err?.stderr ?? '').trim();

	if (/permission denied/i.test(stderr) && /docker/i.test(stderr)) {
		return 'The SSH user cannot run docker (needs docker group or sudo).';
	}

	if (/permission denied|publickey/i.test(stderr)) {
		return 'SSH authentication failed — check key access for this host.';
	}

	if (/could not resolve|name or service not known/i.test(stderr)) {
		return 'Host not found — check the SSH address.';
	}

	if (/connection refused|no route to host|timed out/i.test(stderr)) {
		return 'Could not connect — the host may be offline.';
	}

	if (/command not found|docker: not found/i.test(stderr)) {
		return 'docker is not installed on that host.';
	}

	return stderr.split('\n')[0] || (error instanceof Error ? error.message : 'SSH command failed.');
}
