import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CONTAINER_NAME_RE } from '$lib/service-inspector.js';
import type { DockerHostConfig } from './homelab-config';

const run = promisify(execFile);

export { CONTAINER_NAME_RE } from '$lib/service-inspector.js';

export type DockerContainer = {
	name: string;
	id: string;
	image: string;
	state: string;
	status: string;
	created: string;
	ports: Array<{ privatePort: string; hostIp: string; hostPort: string }>;
	networks: Array<{ name: string; ip: string }>;
	mounts: Array<{ type: string; source: string; destination: string; mode: string }>;
	labels: Record<string, string>;
	composeProject: string;
	restartCount: number;
	cpu: number;
	memUsed: number;
	memLimit: number;
	// True for the container this dashboard itself runs in — stopping it kills
	// the dash, so the UI warns before allowing it.
	isSelf: boolean;
};

export type DockerAction = 'start' | 'stop' | 'restart';

export const DOCKER_ACTIONS: readonly DockerAction[] = ['start', 'stop', 'restart'];

export type DockerHostStatus = {
	name: string;
	target: string;
	reachable: boolean;
	error: string | null;
	host: {
		load: number[];
		memUsed: number;
		memTotal: number;
		diskUsed: number;
		diskTotal: number;
		uptime: string;
	} | null;
	containers: DockerContainer[];
};

const SSH_TIMEOUT_MS = 15_000;

// `docker stop` waits out the container's grace period (10s default, compose
// services can raise it) and restart is a stop plus a start, so control calls
// get far longer than status reads.
const CONTROL_TIMEOUT_MS = 45_000;

const SSH_OPTIONS = [
	'-o', 'BatchMode=yes',
	'-o', 'ConnectTimeout=5',
	'-o', 'StrictHostKeyChecking=accept-new'
];

function isLocalTarget(config: DockerHostConfig): boolean {
	return config.ssh === 'local' || config.ssh === '';
}

// One round-trip: container list + live stats + host vitals, split by markers.
// Avoids `{{json .}}` for `docker ps` because its Labels field is megabytes.
const REMOTE_SCRIPT = [
	"echo '#PS'",
	"docker ps -a --format '{{.Names}}\\t{{.Image}}\\t{{.State}}\\t{{.Status}}'",
	"echo '#INSPECT'",
	"ids=$(docker ps -aq)",
	"if [ -n \"$ids\" ]; then docker inspect --format '{{.Name}}\t{{.Id}}\t{{.RestartCount}}\t{{.Created}}\t{{range $p,$conf:=.NetworkSettings.Ports}}{{$p}}=>{{if $conf}}{{range $i,$b:=$conf}}{{$b.HostIp}}:{{$b.HostPort}},{{end}}{{end}};{{end}}\t{{range $n,$v:=.NetworkSettings.Networks}}{{$n}}={{$v.IPAddress}};{{end}}\t{{range .Mounts}}{{.Type}}:{{.Source}}->{{.Destination}}:{{.Mode}};{{end}}\t{{range $k,$v:=.Config.Labels}}{{$k}}={{$v}};{{end}}' $ids; fi",
	"echo '#STATS'",
	"docker stats --no-stream --format '{{.Name}}\\t{{.CPUPerc}}\\t{{.MemUsage}}'",
	"echo '#HOST'",
	'cat /proc/loadavg',
	"free -b | awk '/^Mem:/{print $2, $3}'",
	"df -B1 / | awk 'NR==2{print $3, $2}'",
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
		const { stdout } = isLocalTarget(config)
			? await run('sh', ['-c', REMOTE_SCRIPT], {
					timeout: SSH_TIMEOUT_MS,
					maxBuffer: 4 * 1024 * 1024
				})
			: await run('ssh', [...SSH_OPTIONS, config.ssh, REMOTE_SCRIPT], {
					timeout: SSH_TIMEOUT_MS,
					maxBuffer: 4 * 1024 * 1024
				});

		return parseOutput(stdout, base, isLocalTarget(config));
	} catch (error) {
		return { ...base, error: sshError(error) };
	}
}

export async function controlDockerContainer(
	config: DockerHostConfig,
	containerName: string,
	action: DockerAction
): Promise<{ ok: true } | { ok: false; error: string }> {
	// Callers validate too, but re-check here so this function is safe on its
	// own: the SSH branch interpolates the name into a remote shell command,
	// which is only acceptable with the allowlist + name regex holding.
	if (!DOCKER_ACTIONS.includes(action)) {
		return { ok: false, error: 'Unsupported action.' };
	}

	if (!CONTAINER_NAME_RE.test(containerName)) {
		return { ok: false, error: 'Invalid container name.' };
	}

	try {
		if (isLocalTarget(config)) {
			await run('docker', [action, containerName], { timeout: CONTROL_TIMEOUT_MS });
		} else {
			await run('ssh', [...SSH_OPTIONS, config.ssh, `docker ${action} ${containerName}`], {
				timeout: CONTROL_TIMEOUT_MS
			});
		}

		return { ok: true };
	} catch (error) {
		const stderr = ((error as { stderr?: string })?.stderr ?? '').trim();

		if (/no such container/i.test(stderr)) {
			return { ok: false, error: 'Container not found — it may have been removed.' };
		}

		return { ok: false, error: sshError(error) };
	}
}

export async function dockerContainerLogs(
	config: DockerHostConfig,
	containerName: string,
	lines = 50
): Promise<{ ok: true; logs: string } | { ok: false; error: string }> {
	if (!CONTAINER_NAME_RE.test(containerName)) {
		return { ok: false, error: 'Invalid container name.' };
	}

	const tail = Math.min(500, Math.max(1, Math.round(lines)));

	try {
		if (isLocalTarget(config)) {
			const { stdout, stderr } = await run('docker', ['logs', '--tail', String(tail), containerName], {
				timeout: SSH_TIMEOUT_MS,
				maxBuffer: 512 * 1024
			});
			return { ok: true, logs: stdout + stderr };
		}

		const { stdout, stderr } = await run(
			'ssh',
			[...SSH_OPTIONS, config.ssh, `docker logs --tail ${tail} ${containerName} 2>&1`],
			{
				timeout: SSH_TIMEOUT_MS,
				maxBuffer: 512 * 1024
			}
		);

		return { ok: true, logs: stdout + stderr };
	} catch (error) {
		const stderr = ((error as { stderr?: string })?.stderr ?? '').trim();

		if (/no such container/i.test(stderr)) {
			return { ok: false, error: 'Container not found — it may have been removed.' };
		}

		return { ok: false, error: sshError(error) };
	}
}

function parseOutput(stdout: string, base: DockerHostStatus, isLocal: boolean): DockerHostStatus {
	const sections = splitSections(stdout);
	const stats = parseStats(sections.stats);
	const inspected = parseInspect(sections.inspect);
	const selfName = process.env.DASH_SELF_CONTAINER ?? 'dash';

	const containers = sections.ps
		.map((line) => {
			const [name, image, state, status] = line.split('\t');

			if (!name) {
				return null;
			}

			const stat = stats.get(name);
			const inspect = inspected.get(name);
			const labels = inspect?.labels ?? {};

			return {
				name,
				id: inspect?.id ?? '',
				image: image ?? '',
				state: state ?? 'unknown',
				status: status ?? '',
				created: inspect?.created ?? '',
				ports: inspect?.ports ?? [],
				networks: inspect?.networks ?? [],
				mounts: inspect?.mounts ?? [],
				labels,
				composeProject: labels['com.docker.compose.project'] ?? '',
				restartCount: inspect?.restartCount ?? 0,
				cpu: stat?.cpu ?? 0,
				memUsed: stat?.memUsed ?? 0,
				memLimit: stat?.memLimit ?? 0,
				isSelf: isLocal && name === selfName
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
	const buckets: Record<'ps' | 'inspect' | 'stats' | 'host', string[]> = {
		ps: [],
		inspect: [],
		stats: [],
		host: []
	};
	let current: 'ps' | 'inspect' | 'stats' | 'host' | null = null;

	for (const rawLine of lines) {
		const line = rawLine.replace(/\r$/, '');

		if (line === '#PS') {
			current = 'ps';
		} else if (line === '#INSPECT') {
			current = 'inspect';
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

function parseInspect(lines: string[]) {
	const inspected = new Map<
		string,
		{
			id: string;
			restartCount: number;
			created: string;
			ports: DockerContainer['ports'];
			networks: DockerContainer['networks'];
			mounts: DockerContainer['mounts'];
			labels: Record<string, string>;
		}
	>();

	for (const line of lines) {
		const [rawName, id, restartCount, created, rawPorts, rawNetworks, rawMounts, rawLabels] =
			line.split('\t');
		const name = rawName?.replace(/^\//, '');

		if (!name) {
			continue;
		}

		inspected.set(name, {
			id: id ?? '',
			restartCount: Number.parseInt(restartCount ?? '0', 10) || 0,
			created: created ?? '',
			ports: parsePorts(rawPorts),
			networks: parseNetworks(rawNetworks),
			mounts: parseMounts(rawMounts),
			labels: parseLabels(rawLabels)
		});
	}

	return inspected;
}

function parsePorts(value: string | undefined): DockerContainer['ports'] {
	return (value ?? '')
		.split(';')
		.map((entry) => {
			const [privatePort, bindings] = entry.split('=>');
			const binding = (bindings ?? '').split(',').find(Boolean) ?? '';
			const [hostIp, hostPort] = binding.split(':');

			if (!privatePort) {
				return null;
			}

			return { privatePort, hostIp: hostIp ?? '', hostPort: hostPort ?? '' };
		})
		.filter((port): port is DockerContainer['ports'][number] => port !== null);
}

function parseNetworks(value: string | undefined): DockerContainer['networks'] {
	return (value ?? '')
		.split(';')
		.map((entry) => {
			const [name, ip] = entry.split('=');
			return name ? { name, ip: ip ?? '' } : null;
		})
		.filter((network): network is DockerContainer['networks'][number] => network !== null);
}

function parseMounts(value: string | undefined): DockerContainer['mounts'] {
	return (value ?? '')
		.split(';')
		.map((entry) => {
			const match = entry.match(/^([^:]+):(.*)->([^:]+):(.*)$/);
			return match
				? { type: match[1], source: match[2], destination: match[3], mode: match[4] }
				: null;
		})
		.filter((mount): mount is DockerContainer['mounts'][number] => mount !== null);
}

function parseLabels(value: string | undefined): Record<string, string> {
	const labels: Record<string, string> = {};

	for (const entry of (value ?? '').split(';')) {
		const index = entry.indexOf('=');

		if (index <= 0) {
			continue;
		}

		const name = entry.slice(0, index);

		if (isRelevantLabel(name)) {
			labels[name] = entry.slice(index + 1);
		}
	}

	return labels;
}

function isRelevantLabel(name: string): boolean {
	return (
		name.startsWith('com.docker.compose.') ||
		name.startsWith('dash.') ||
		name.startsWith('homepage.') ||
		name === 'org.opencontainers.image.url' ||
		name === 'org.opencontainers.image.source' ||
		name === 'org.opencontainers.image.title' ||
		name === 'org.opencontainers.image.version'
	);
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
	const [diskUsed, diskTotal] = (lines[2] ?? '').split(/\s+/).map(Number);
	const uptime = (lines[3] ?? '').replace(/^up\s+/, '');

	return {
		load: load.every(Number.isFinite) ? load : [0, 0, 0],
		memUsed: Number.isFinite(memUsed) ? memUsed : 0,
		memTotal: Number.isFinite(memTotal) ? memTotal : 0,
		diskUsed: Number.isFinite(diskUsed) ? diskUsed : 0,
		diskTotal: Number.isFinite(diskTotal) ? diskTotal : 0,
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
