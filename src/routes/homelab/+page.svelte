<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import { fade } from 'svelte/transition';

	let { data }: { data: import('./$types').PageData } = $props();

	let refreshing = $state(false);

	// Auto-refresh the status every 10s while the tab is visible.
	$effect(() => {
		const tick = () => {
			if (!document.hidden) {
				invalidate('homelab:status');
			}
		};

		const timer = setInterval(tick, 10_000);
		return () => clearInterval(timer);
	});

	const proxmox = $derived(data.proxmox);
	const dockerHosts = $derived(data.dockerHosts);

	const summary = $derived.by(() => {
		let running = 0;
		let stopped = 0;
		let down = 0;

		for (const guest of proxmox?.guests ?? []) {
			guest.status === 'running' ? (running += 1) : (stopped += 1);
		}

		for (const host of dockerHosts) {
			if (!host.reachable) {
				down += 1;
				continue;
			}

			for (const container of host.containers) {
				container.state === 'running' ? (running += 1) : (stopped += 1);
			}
		}

		if (proxmox && !proxmox.reachable) {
			down += 1;
		}

		return { running, stopped, down };
	});

	function pct(used: number, total: number): number {
		return total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
	}

	function loadColor(percent: number): string {
		if (percent >= 90) {
			return 'var(--theme-danger)';
		}

		if (percent >= 70) {
			return 'var(--theme-warning)';
		}

		return 'var(--theme-accent)';
	}

	function bytes(value: number): string {
		if (!value) {
			return '0 B';
		}

		const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
		const exponent = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
		const scaled = value / 1024 ** exponent;
		return `${scaled.toFixed(scaled >= 100 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
	}

	function duration(seconds: number): string {
		if (!seconds) {
			return '—';
		}

		const days = Math.floor(seconds / 86400);
		const hours = Math.floor((seconds % 86400) / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);

		if (days > 0) {
			return `${days}d ${hours}h`;
		}

		if (hours > 0) {
			return `${hours}h ${minutes}m`;
		}

		return `${minutes}m`;
	}

	function shortImage(image: string): string {
		return image.replace(/^.*\//, '').replace(/:latest$/, '');
	}

	// SVG ring gauge geometry
	const RADIUS = 26;
	const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

	function dashOffset(percent: number): number {
		return CIRCUMFERENCE * (1 - percent / 100);
	}
</script>

<svelte:head>
	<title>Homelab | Custom Dash</title>
</svelte:head>

<main class="mx-auto min-h-dvh w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<header class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<p class="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--theme-accent)]">
				Infrastructure
			</p>
			<h1 class="mt-2 text-4xl font-semibold text-[var(--theme-fg)] md:text-5xl">Homelab</h1>
			{#if data.configured}
				<div class="mt-3 flex flex-wrap items-center gap-4 text-sm">
					<span class="inline-flex items-center gap-2">
						<span class="h-2 w-2 bg-[var(--theme-success)] shadow-[0_0_8px_var(--theme-success)]"></span>
						{summary.running} running
					</span>
					<span class="inline-flex items-center gap-2 text-[color-mix(in_srgb,var(--theme-fg)_70%,transparent)]">
						<span class="h-2 w-2 bg-[color-mix(in_srgb,var(--theme-fg)_45%,transparent)]"></span>
						{summary.stopped} stopped
					</span>
					{#if summary.down > 0}
						<span class="inline-flex items-center gap-2 text-[var(--theme-danger)]">
							<span class="h-2 w-2 bg-[var(--theme-danger)] shadow-[0_0_8px_var(--theme-danger)]"></span>
							{summary.down} unreachable
						</span>
					{/if}
				</div>
			{/if}
		</div>

		{#if data.configured}
			<div class="flex items-center gap-4">
				<span
					class="inline-flex items-center gap-2 text-xs text-[color-mix(in_srgb,var(--theme-fg)_50%,transparent)]"
				>
					<span class="relative flex h-2 w-2">
						<span
							class="absolute inline-flex h-full w-full animate-ping bg-[var(--theme-success)] opacity-60"
						></span>
						<span class="relative inline-flex h-2 w-2 bg-[var(--theme-success)]"></span>
					</span>
					Live · 10s
				</span>
				<form
					method="POST"
					action="?/refresh"
					use:enhance={() => {
						refreshing = true;
						return async ({ update }) => {
							await update();
							refreshing = false;
						};
					}}
				>
					<button
						type="submit"
						disabled={refreshing}
						class="border border-[color-mix(in_srgb,var(--theme-fg)_16%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_60%,transparent)] px-4 py-2.5 text-sm backdrop-blur transition hover:border-[var(--theme-accent)] disabled:opacity-60"
					>
						<span class={refreshing ? 'inline-block animate-spin' : 'inline-block'}>⟳</span>
						{refreshing ? 'Refreshing…' : 'Refresh'}
					</button>
				</form>
			</div>
		{/if}
	</header>

	{#if !data.configured}
		<section class="mt-8 max-w-2xl" in:fade={{ duration: 200 }}>
			<div
				class="border border-dashed border-[color-mix(in_srgb,var(--theme-accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_45%,transparent)] p-6 backdrop-blur"
			>
				<h2 class="text-xl font-semibold">Connect your servers</h2>
				<p class="mt-2 text-sm leading-6 text-[color-mix(in_srgb,var(--theme-fg)_65%,transparent)]">
					Create <span class="font-mono text-[var(--theme-accent)]">~/.config/custom-dash/homelab.json</span>
					with your Proxmox API token and the SSH target for each Docker host:
				</p>
				<pre class="mt-4 overflow-x-auto border border-[color-mix(in_srgb,var(--theme-fg)_12%,transparent)] bg-[color-mix(in_srgb,var(--theme-bg)_70%,transparent)] p-4 text-xs leading-5 text-[color-mix(in_srgb,var(--theme-fg)_85%,transparent)]"><code>{`{
  "proxmox": {
    "name": "pve",
    "url": "https://10.0.0.2:8006",
    "tokenId": "dash@pve!dash",
    "secret": "xxxxxxxx-xxxx-xxxx",
    "allowSelfSigned": true
  },
  "dockerHosts": [
    { "name": "services", "ssh": "user@10.0.0.3" }
  ]
}`}</code></pre>
				<p class="mt-4 text-sm text-[color-mix(in_srgb,var(--theme-fg)_65%,transparent)]">
					Create a read-only Proxmox token (run in the node shell):
				</p>
				<pre class="mt-2 overflow-x-auto border border-[color-mix(in_srgb,var(--theme-fg)_12%,transparent)] bg-[color-mix(in_srgb,var(--theme-bg)_70%,transparent)] p-4 text-xs leading-5 text-[color-mix(in_srgb,var(--theme-fg)_85%,transparent)]"><code>{`pveum user add dash@pve
pveum acl modify / -user dash@pve -role PVEAuditor
pveum user token add dash@pve dash --privsep 0`}</code></pre>
				<p class="mt-4 text-sm text-[color-mix(in_srgb,var(--theme-fg)_65%,transparent)]">
					Docker hosts use your existing SSH key auth — the user just needs to run
					<span class="font-mono text-[var(--theme-accent)]">docker ps</span>. Reload once the file is
					saved.
				</p>
			</div>
		</section>
	{:else}
		{#if proxmox}
			<section class="mt-6">
				<div class="flex items-center gap-3">
					<h2 class="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--theme-accent)]">
						Proxmox · {proxmox.name}
					</h2>
					{#if proxmox.reachable}
						<span class="text-xs text-[color-mix(in_srgb,var(--theme-fg)_42%,transparent)]">
							{proxmox.guests.length} guests
						</span>
					{/if}
					<div class="h-px flex-1 bg-linear-to-r from-[color-mix(in_srgb,var(--theme-accent)_45%,transparent)] to-transparent"></div>
				</div>

				{#if !proxmox.reachable}
					<div
						class="mt-4 border border-[color-mix(in_srgb,var(--theme-danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--theme-danger)_12%,transparent)] px-4 py-3 text-sm"
					>
						<span class="font-semibold">Unreachable</span>
						<span class="text-[color-mix(in_srgb,var(--theme-fg)_70%,transparent)]"> — {proxmox.error}</span>
					</div>
				{:else}
					{#each proxmox.nodes as node (node.name)}
						{@const cpuPct = pct(node.cpu * 100, node.maxcpu * 100) || Math.round(node.cpu * 100)}
						{@const memPct = pct(node.memUsed, node.memTotal)}
						{@const diskPct = pct(node.diskUsed, node.diskTotal)}
						<div
							class="mt-4 grid gap-6 border border-[color-mix(in_srgb,var(--theme-fg)_11%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_62%,transparent)] p-5 backdrop-blur sm:grid-cols-[auto_1fr]"
						>
							<div class="flex items-center gap-6">
								{#each [{ label: 'CPU', value: cpuPct, sub: `${node.maxcpu} cores` }, { label: 'RAM', value: memPct, sub: `${bytes(node.memUsed)} / ${bytes(node.memTotal)}` }, { label: 'Disk', value: diskPct, sub: `${bytes(node.diskUsed)} / ${bytes(node.diskTotal)}` }] as gauge (gauge.label)}
									<div class="flex flex-col items-center gap-2">
										<div class="relative grid h-[68px] w-[68px] place-items-center">
											<svg viewBox="0 0 64 64" class="h-full w-full -rotate-90">
												<circle
													cx="32"
													cy="32"
													r={RADIUS}
													fill="none"
													stroke="color-mix(in srgb, var(--theme-fg) 12%, transparent)"
													stroke-width="6"
												/>
												<circle
													cx="32"
													cy="32"
													r={RADIUS}
													fill="none"
													stroke={loadColor(gauge.value)}
													stroke-width="6"
													stroke-linecap="round"
													stroke-dasharray={CIRCUMFERENCE}
													stroke-dashoffset={dashOffset(gauge.value)}
													style="transition: stroke-dashoffset 0.6s ease, stroke 0.3s ease; filter: drop-shadow(0 0 4px color-mix(in srgb, currentColor 60%, transparent))"
												/>
											</svg>
											<span class="absolute text-sm font-semibold">{gauge.value}%</span>
										</div>
										<span class="text-xs font-medium text-[color-mix(in_srgb,var(--theme-fg)_70%,transparent)]">
											{gauge.label}
										</span>
									</div>
								{/each}
							</div>

							<dl class="grid grid-cols-2 content-center gap-x-6 gap-y-2 text-sm sm:border-l sm:border-[color-mix(in_srgb,var(--theme-fg)_10%,transparent)] sm:pl-6">
								<dt class="text-[color-mix(in_srgb,var(--theme-fg)_55%,transparent)]">Node</dt>
								<dd class="font-medium">{node.name}</dd>
								<dt class="text-[color-mix(in_srgb,var(--theme-fg)_55%,transparent)]">Status</dt>
								<dd class="inline-flex items-center gap-2 font-medium capitalize">
									<span class={`h-1.5 w-1.5 ${node.status === 'online' ? 'bg-[var(--theme-success)] shadow-[0_0_8px_var(--theme-success)]' : 'bg-[var(--theme-danger)]'}`}></span>
									{node.status}
								</dd>
								<dt class="text-[color-mix(in_srgb,var(--theme-fg)_55%,transparent)]">Uptime</dt>
								<dd class="font-medium">{duration(node.uptime)}</dd>
								<dt class="text-[color-mix(in_srgb,var(--theme-fg)_55%,transparent)]">Memory</dt>
								<dd class="font-medium">{bytes(node.memUsed)} used</dd>
							</dl>
						</div>
					{/each}

					{#if proxmox.guests.length}
						<div class="mt-2.5 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
							{#each proxmox.guests as guest (guest.id)}
								{@const running = guest.status === 'running'}
								{@const memPct = pct(guest.memUsed, guest.memTotal)}
								<div
									title={running ? `${guest.name} · ${bytes(guest.memUsed)} / ${bytes(guest.memTotal)}` : `Stopped · #${guest.vmid}`}
									class={`flex items-center gap-2 border border-[color-mix(in_srgb,var(--theme-fg)_11%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_60%,transparent)] px-2.5 py-1.5 backdrop-blur transition-colors duration-200 ${running ? 'hover:border-[color-mix(in_srgb,var(--theme-accent)_50%,transparent)]' : 'opacity-55'}`}
								>
									<span
										class={`h-1.5 w-1.5 shrink-0 ${running ? 'bg-[var(--theme-success)] shadow-[0_0_8px_var(--theme-success)]' : 'bg-[color-mix(in_srgb,var(--theme-fg)_40%,transparent)]'}`}
									></span>
									<span class="min-w-0 flex-1 truncate text-sm font-medium">{guest.name}</span>
									<span
										class="shrink-0 border border-[color-mix(in_srgb,var(--theme-fg)_16%,transparent)] px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-[color-mix(in_srgb,var(--theme-fg)_60%,transparent)]"
									>
										{guest.type === 'qemu' ? 'VM' : 'LXC'}
									</span>
									{#if running}
										<span class="shrink-0 text-[11px] tabular-nums text-[color-mix(in_srgb,var(--theme-fg)_55%,transparent)]">
											{Math.round(guest.cpu * 100)}%
										</span>
										<span class="h-1 w-10 shrink-0 overflow-hidden bg-[color-mix(in_srgb,var(--theme-fg)_12%,transparent)]">
											<span
												class="block h-full transition-all duration-500"
												style={`width: ${memPct}%; background: ${loadColor(memPct)}`}
											></span>
										</span>
										<span class="hidden shrink-0 text-[11px] tabular-nums text-[color-mix(in_srgb,var(--theme-fg)_50%,transparent)] md:inline">
											{bytes(guest.memUsed)}
										</span>
									{:else}
										<span class="shrink-0 text-[11px] text-[color-mix(in_srgb,var(--theme-fg)_45%,transparent)]">
											stopped
										</span>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				{/if}
			</section>
		{/if}

		{#each dockerHosts as host (host.name)}
			<section class="mt-6">
				<div class="flex items-center gap-3">
					<h2 class="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--theme-color12,var(--theme-accent))]">
						Docker · {host.name}
					</h2>
					{#if host.reachable}
						<span class="text-xs text-[color-mix(in_srgb,var(--theme-fg)_42%,transparent)]">
							{host.containers.length} containers
						</span>
					{/if}
					<div class="h-px flex-1 bg-linear-to-r from-[color-mix(in_srgb,var(--theme-color12,var(--theme-accent))_45%,transparent)] to-transparent"></div>
				</div>

				{#if !host.reachable}
					<div
						class="mt-4 border border-[color-mix(in_srgb,var(--theme-danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--theme-danger)_12%,transparent)] px-4 py-3 text-sm"
					>
						<span class="font-semibold">{host.target} unreachable</span>
						<span class="text-[color-mix(in_srgb,var(--theme-fg)_70%,transparent)]"> — {host.error}</span>
					</div>
				{:else}
					{#if host.host}
						{@const memPct = pct(host.host.memUsed, host.host.memTotal)}
						<div
							class="mt-4 flex flex-wrap items-center gap-x-7 gap-y-2 border border-[color-mix(in_srgb,var(--theme-fg)_11%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_55%,transparent)] px-4 py-2.5 backdrop-blur"
						>
							<span class="inline-flex items-center gap-2 text-xs">
								<span class="text-[color-mix(in_srgb,var(--theme-fg)_55%,transparent)]">Load</span>
								<span class="text-xs font-semibold tabular-nums">
									{host.host.load.map((n) => n.toFixed(2)).join(' ')}
								</span>
							</span>
							<span class="inline-flex items-center gap-2 text-xs">
								<span class="text-[color-mix(in_srgb,var(--theme-fg)_55%,transparent)]">RAM</span>
								<span class="h-1 w-16 overflow-hidden bg-[color-mix(in_srgb,var(--theme-fg)_12%,transparent)]">
									<span
										class="block h-full transition-all duration-500"
										style={`width: ${memPct}%; background: ${loadColor(memPct)}; box-shadow: 0 0 6px ${loadColor(memPct)}`}
									></span>
								</span>
								<span class="font-semibold tabular-nums" style={`color: ${loadColor(memPct)}`}>{memPct}%</span>
								<span class="hidden text-[color-mix(in_srgb,var(--theme-fg)_45%,transparent)] md:inline">
									{bytes(host.host.memUsed)} / {bytes(host.host.memTotal)}
								</span>
							</span>
							<span class="inline-flex items-center gap-2 text-xs">
								<span class="text-[color-mix(in_srgb,var(--theme-fg)_55%,transparent)]">Uptime</span>
								<span class="font-semibold">{host.host.uptime}</span>
							</span>
						</div>
					{/if}

					<div class="mt-2.5 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
						{#each host.containers as container (container.name)}
							{@const running = container.state === 'running'}
							{@const memPct = pct(container.memUsed, container.memLimit)}
							{@const healthy = /\(healthy\)/.test(container.status)}
							<div
								title={`${container.image} · ${container.status || 'Stopped'}`}
								class={`flex items-center gap-2 border border-[color-mix(in_srgb,var(--theme-fg)_11%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_60%,transparent)] px-2.5 py-1.5 backdrop-blur transition-colors duration-200 ${running ? 'hover:border-[color-mix(in_srgb,var(--theme-color12,var(--theme-accent))_50%,transparent)]' : 'opacity-55'}`}
							>
								<span
									class={`h-1.5 w-1.5 shrink-0 ${running ? (healthy ? 'bg-[var(--theme-success)] shadow-[0_0_8px_var(--theme-success)]' : 'bg-[var(--theme-color12,var(--theme-accent))] shadow-[0_0_8px_var(--theme-color12,var(--theme-accent))]') : 'bg-[color-mix(in_srgb,var(--theme-fg)_40%,transparent)]'}`}
								></span>
								<span class="min-w-0 flex-1 truncate text-sm font-medium">{container.name}</span>
								<span class="hidden max-w-32 shrink-0 truncate text-[11px] text-[color-mix(in_srgb,var(--theme-fg)_45%,transparent)] lg:inline">
									{shortImage(container.image)}
								</span>
								{#if running}
									<span class="shrink-0 text-[11px] tabular-nums text-[color-mix(in_srgb,var(--theme-fg)_55%,transparent)]">
										{container.cpu.toFixed(1)}%
									</span>
									<span class="h-1 w-10 shrink-0 overflow-hidden bg-[color-mix(in_srgb,var(--theme-fg)_12%,transparent)]">
										<span
											class="block h-full transition-all duration-500"
											style={`width: ${memPct}%; background: ${loadColor(memPct)}`}
										></span>
									</span>
									<span class="hidden shrink-0 text-[11px] tabular-nums text-[color-mix(in_srgb,var(--theme-fg)_50%,transparent)] md:inline">
										{bytes(container.memUsed)}
									</span>
								{:else}
									<span class="shrink-0 text-[11px] text-[color-mix(in_srgb,var(--theme-fg)_45%,transparent)]">
										stopped
									</span>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</section>
		{/each}
	{/if}
</main>
