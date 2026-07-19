<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import { fade, scale } from 'svelte/transition';
	import type { SubmitFunction } from '@sveltejs/kit';

	let { data }: { data: import('./$types').PageData } = $props();

	let refreshing = $state(false);
	let openMenu = $state<string | null>(null);
	let confirming = $state<string | null>(null);
	let pending = $state<Record<string, { action: UiAction; at: number }>>({});
	let actionError = $state<Record<string, string>>({});

	type UiAction = 'start' | 'stop' | 'restart';

	// Live updates: the server pushes a message whenever container/VM status
	// changes (see /homelab/events). Closed while the tab is hidden so an idle
	// background tab doesn't keep the server polling.
	$effect(() => {
		let source: EventSource | null = null;

		const connect = () => {
			if (source) {
				return;
			}

			source = new EventSource('/homelab/events');
			source.onmessage = () => invalidate('homelab:status');
		};

		const disconnect = () => {
			source?.close();
			source = null;
		};

		const onVisibility = () => {
			if (document.hidden) {
				disconnect();
			} else {
				connect();
				invalidate('homelab:status');
			}
		};

		connect();
		document.addEventListener('visibilitychange', onVisibility);

		return () => {
			disconnect();
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});

	// Re-evaluate pending entries on a slow tick even when no fresh data
	// arrives, so time-based clears (restart, expiry) still fire.
	let pruneTick = $state(0);

	$effect(() => {
		const timer = setInterval(() => (pruneTick += 1), 3_000);
		return () => clearInterval(timer);
	});

	// Clear pending markers once the observed state catches up: a start settles
	// on `running`, a stop on anything else. Proxmox reports `running` all the
	// way through a reboot, so restarts clear on a fixed delay instead. The 90s
	// cap covers actions that were accepted upstream but never took effect.
	$effect(() => {
		void pruneTick;

		const states = new Map<string, string>();

		for (const guest of proxmox?.guests ?? []) {
			states.set(`pve:${guest.vmid}`, guest.status);
		}

		for (const host of dockerHosts) {
			for (const container of host.containers) {
				states.set(`docker:${host.name}/${container.name}`, container.state);
			}
		}

		const now = Date.now();

		for (const [key, entry] of Object.entries(pending)) {
			const observed = states.get(key);
			const settled =
				(entry.action === 'start' && observed === 'running') ||
				(entry.action === 'stop' && observed !== undefined && observed !== 'running') ||
				(entry.action === 'restart' && now - entry.at > 12_000);

			if (settled || now - entry.at > 90_000) {
				delete pending[key];
			}
		}
	});

	let confirmTimer: ReturnType<typeof setTimeout> | null = null;

	function arm(key: string) {
		confirming = key;

		if (confirmTimer) {
			clearTimeout(confirmTimer);
		}

		confirmTimer = setTimeout(() => {
			if (confirming === key) {
				confirming = null;
			}
		}, 2500);
	}

	// Shared submit handler for every power-action form. Destructive actions
	// arm on the first click ("Sure?") and only submit on the second. For the
	// dash's own container, stop/restart kills this server mid-request, so the
	// pending state is set up-front and a dropped response is expected.
	function handleAction(
		key: string,
		uiAction: UiAction,
		needsConfirm: boolean,
		isSelf = false
	): SubmitFunction {
		return ({ cancel }) => {
			const confirmKey = `${key}:${uiAction}`;

			if (needsConfirm && confirming !== confirmKey) {
				cancel();
				arm(confirmKey);
				return;
			}

			confirming = null;
			openMenu = null;
			delete actionError[key];

			const fireAndForget = isSelf && uiAction !== 'start';

			if (fireAndForget) {
				pending[key] = { action: uiAction, at: Date.now() };
			}

			return async ({ result, update }) => {
				if (result.type === 'failure') {
					const message = (result.data as { message?: string } | undefined)?.message;
					actionError[key] = message || 'Action failed.';
					delete pending[key];
				} else if (result.type === 'error') {
					if (!fireAndForget) {
						actionError[key] = 'Action failed — the server did not respond.';
					}
				} else {
					pending[key] = { action: uiAction, at: Date.now() };
				}

				await update();
			};
		};
	}

	const PENDING_LABEL: Record<UiAction, string> = {
		start: 'starting…',
		stop: 'stopping…',
		restart: 'restarting…'
	};

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

{#snippet controlMenu(
	key: string,
	label: string,
	formAction: string,
	fields: Array<{ name: string; value: string | number }>,
	running: boolean,
	isProxmox: boolean,
	isSelf: boolean
)}
	<button
		type="button"
		onclick={() => {
			openMenu = openMenu === key ? null : key;
			confirming = null;
		}}
		aria-haspopup="menu"
		aria-expanded={openMenu === key}
		aria-label={`Actions for ${label}`}
		disabled={Boolean(pending[key])}
		class={`grid h-5 w-5 shrink-0 place-items-center border text-xs leading-none backdrop-blur transition focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 max-sm:opacity-100 ${
			openMenu === key
				? 'border-[var(--theme-accent)] text-[var(--theme-fg)] opacity-100'
				: 'border-[color-mix(in_srgb,var(--theme-fg)_16%,transparent)] text-[color-mix(in_srgb,var(--theme-fg)_70%,transparent)] opacity-0 group-hover/row:opacity-100'
		}`}
	>
		⋯
	</button>

	{#if openMenu === key}
		<div
			class="fixed inset-0 z-10"
			role="presentation"
			onclick={() => {
				openMenu = null;
				confirming = null;
			}}
		></div>

		<div
			class="absolute right-1 top-8 z-20 w-44 border border-[color-mix(in_srgb,var(--theme-accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_40%,var(--theme-bg))] p-1 shadow-[0_20px_60px_-20px_color-mix(in_srgb,var(--theme-bg)_90%,transparent)] backdrop-blur"
			transition:scale={{ duration: 120, start: 0.96 }}
			role="menu"
		>
			{#if !running}
				<form method="POST" action={formAction} use:enhance={handleAction(key, 'start', false)}>
					{#each fields as field (field.name)}
						<input type="hidden" name={field.name} value={field.value} />
					{/each}
					<input type="hidden" name="action" value="start" />
					<button
						type="submit"
						role="menuitem"
						class="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs transition hover:bg-[color-mix(in_srgb,var(--theme-fg)_8%,transparent)]"
					>
						<span aria-hidden="true">▶</span>
						Start
					</button>
				</form>
			{:else}
				<form method="POST" action={formAction} use:enhance={handleAction(key, 'stop', true, isSelf)}>
					{#each fields as field (field.name)}
						<input type="hidden" name={field.name} value={field.value} />
					{/each}
					<input type="hidden" name="action" value={isProxmox ? 'shutdown' : 'stop'} />
					<button
						type="submit"
						role="menuitem"
						class={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs transition ${
							confirming === `${key}:stop`
								? 'bg-[color-mix(in_srgb,var(--theme-danger)_22%,transparent)] text-[var(--theme-fg)]'
								: 'text-[var(--theme-danger)] hover:bg-[color-mix(in_srgb,var(--theme-danger)_14%,transparent)]'
						}`}
					>
						<span aria-hidden="true">■</span>
						{confirming === `${key}:stop`
							? isSelf
								? 'Stops this dashboard — sure?'
								: 'Sure?'
							: 'Stop'}
					</button>
				</form>

				{#if isProxmox && confirming === `${key}:stop`}
					<form method="POST" action={formAction} use:enhance={handleAction(key, 'stop', false)}>
						{#each fields as field (field.name)}
							<input type="hidden" name={field.name} value={field.value} />
						{/each}
						<input type="hidden" name="action" value="stop" />
						<button
							type="submit"
							role="menuitem"
							title="Hard stop — like pulling the power"
							class="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs text-[var(--theme-danger)] transition hover:bg-[color-mix(in_srgb,var(--theme-danger)_14%,transparent)]"
						>
							<span aria-hidden="true">⚡</span>
							Force stop
						</button>
					</form>
				{/if}

				<form method="POST" action={formAction} use:enhance={handleAction(key, 'restart', true, isSelf)}>
					{#each fields as field (field.name)}
						<input type="hidden" name={field.name} value={field.value} />
					{/each}
					<input type="hidden" name="action" value={isProxmox ? 'reboot' : 'restart'} />
					<button
						type="submit"
						role="menuitem"
						class={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs transition ${
							confirming === `${key}:restart`
								? 'bg-[color-mix(in_srgb,var(--theme-warning)_22%,transparent)] text-[var(--theme-fg)]'
								: 'hover:bg-[color-mix(in_srgb,var(--theme-fg)_8%,transparent)]'
						}`}
					>
						<span aria-hidden="true">⟳</span>
						{confirming === `${key}:restart`
							? isSelf
								? 'Restarts this dashboard — sure?'
								: 'Sure?'
							: 'Restart'}
					</button>
				</form>
			{/if}
		</div>
	{/if}
{/snippet}

{#snippet cardError(key: string)}
	{#if actionError[key]}
		<p class="mt-1 flex items-start gap-1.5 text-[11px] leading-4 text-[var(--theme-danger)]" transition:fade={{ duration: 120 }}>
			<span class="min-w-0 flex-1">{actionError[key]}</span>
			<button
				type="button"
				aria-label="Dismiss error"
				onclick={() => delete actionError[key]}
				class="shrink-0 leading-4 opacity-70 transition hover:opacity-100"
			>
				×
			</button>
		</p>
	{/if}
{/snippet}

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
					Live
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
					Create a Proxmox token (run in the node shell):
				</p>
				<pre class="mt-2 overflow-x-auto border border-[color-mix(in_srgb,var(--theme-fg)_12%,transparent)] bg-[color-mix(in_srgb,var(--theme-bg)_70%,transparent)] p-4 text-xs leading-5 text-[color-mix(in_srgb,var(--theme-fg)_85%,transparent)]"><code>{`pveum user add dash@pve
pveum acl modify / -user dash@pve -role PVEAuditor
# optional: enables the start/stop/restart buttons
pveum acl modify / -user dash@pve -role PVEVMAdmin
pveum user token add dash@pve dash --privsep 0`}</code></pre>
				<p class="mt-2 text-xs leading-5 text-[color-mix(in_srgb,var(--theme-fg)_50%,transparent)]">
					PVEAuditor alone gives read-only status — the power buttons will show a permission
					error until the token also has VM.PowerMgmt (PVEVMAdmin covers it).
				</p>
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
						{@const cpuPct = Math.min(100, Math.round(node.cpu * 100))}
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
								{@const key = `pve:${guest.vmid}`}
								{@const running = guest.status === 'running'}
								{@const memPct = pct(guest.memUsed, guest.memTotal)}
								{@const inFlight = pending[key]}
								<div class={`relative ${openMenu === key ? 'z-30' : ''}`}>
									<div
										title={running ? `${guest.name} · ${bytes(guest.memUsed)} / ${bytes(guest.memTotal)}` : `Stopped · #${guest.vmid}`}
										class={`group/row flex items-center gap-2 border border-[color-mix(in_srgb,var(--theme-fg)_11%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_60%,transparent)] px-2.5 py-1.5 backdrop-blur transition-colors duration-200 ${running || inFlight ? 'hover:border-[color-mix(in_srgb,var(--theme-accent)_50%,transparent)]' : 'opacity-55'}`}
									>
										<span
											class={`h-1.5 w-1.5 shrink-0 ${
												inFlight
													? 'animate-pulse bg-[var(--theme-warning)] shadow-[0_0_8px_var(--theme-warning)]'
													: running
														? 'bg-[var(--theme-success)] shadow-[0_0_8px_var(--theme-success)]'
														: 'bg-[color-mix(in_srgb,var(--theme-fg)_40%,transparent)]'
											}`}
										></span>
										<span class="min-w-0 flex-1 truncate text-sm font-medium">{guest.name}</span>
										<span
											class="shrink-0 border border-[color-mix(in_srgb,var(--theme-fg)_16%,transparent)] px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-[color-mix(in_srgb,var(--theme-fg)_60%,transparent)]"
										>
											{guest.type === 'qemu' ? 'VM' : 'LXC'}
										</span>
										{#if inFlight}
											<span class="shrink-0 text-[11px] text-[var(--theme-warning)]">
												{PENDING_LABEL[inFlight.action]}
											</span>
										{:else if running}
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
										{@render controlMenu(
											key,
											guest.name,
											'?/guest',
											[{ name: 'vmid', value: guest.vmid }],
											running,
											true,
											false
										)}
									</div>
									{@render cardError(key)}
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
							{@const key = `docker:${host.name}/${container.name}`}
							{@const running = container.state === 'running'}
							{@const memPct = pct(container.memUsed, container.memLimit)}
							{@const healthy = /\(healthy\)/.test(container.status)}
							{@const inFlight = pending[key]}
							<div class={`relative ${openMenu === key ? 'z-30' : ''}`}>
								<div
									title={`${container.image} · ${container.status || 'Stopped'}`}
									class={`group/row flex items-center gap-2 border border-[color-mix(in_srgb,var(--theme-fg)_11%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_60%,transparent)] px-2.5 py-1.5 backdrop-blur transition-colors duration-200 ${running || inFlight ? 'hover:border-[color-mix(in_srgb,var(--theme-color12,var(--theme-accent))_50%,transparent)]' : 'opacity-55'}`}
								>
									<span
										class={`h-1.5 w-1.5 shrink-0 ${
											inFlight
												? 'animate-pulse bg-[var(--theme-warning)] shadow-[0_0_8px_var(--theme-warning)]'
												: running
													? healthy
														? 'bg-[var(--theme-success)] shadow-[0_0_8px_var(--theme-success)]'
														: 'bg-[var(--theme-color12,var(--theme-accent))] shadow-[0_0_8px_var(--theme-color12,var(--theme-accent))]'
													: 'bg-[color-mix(in_srgb,var(--theme-fg)_40%,transparent)]'
										}`}
									></span>
									<span class="min-w-0 flex-1 truncate text-sm font-medium">{container.name}</span>
									<span class="hidden max-w-32 shrink-0 truncate text-[11px] text-[color-mix(in_srgb,var(--theme-fg)_45%,transparent)] lg:inline">
										{shortImage(container.image)}
									</span>
									{#if inFlight}
										<span class="shrink-0 text-[11px] text-[var(--theme-warning)]">
											{PENDING_LABEL[inFlight.action]}
										</span>
									{:else if running}
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
									{@render controlMenu(
										key,
										container.name,
										'?/container',
										[
											{ name: 'host', value: host.name },
											{ name: 'name', value: container.name }
										],
										running,
										false,
										container.isSelf
									)}
								</div>
								{@render cardError(key)}
							</div>
						{/each}
					</div>
				{/if}
			</section>
		{/each}
	{/if}
</main>
