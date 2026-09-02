<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import { goto, invalidate } from '$app/navigation';
	import { tick, onMount } from 'svelte';
	import { fade, fly, scale } from 'svelte/transition';
	import { rankCommands } from '$lib/command-palette.js';
	import type { Snippet } from 'svelte';

	type PaletteCommand = import('$lib/command-palette.js').PaletteCommand;

	let { children, data }: { children: Snippet; data: import('./$types').LayoutData } = $props();

	const links = [
		{ href: '/bookmarks', label: 'Bookmarks' },
		{ href: '/news', label: 'News' },
		{ href: '/homelab', label: 'Homelab' },
		{ href: '/settings', label: 'Settings' }
	];

	const isActive = (href: string) => page.url.pathname.startsWith(href);

	let pickerOpen = $state(false);
	let switching = $state(false);
	let paletteOpen = $state(false);
	let paletteQuery = $state('');
	let paletteLoading = $state(false);
	let paletteError = $state('');
	let paletteCommands = $state<PaletteCommand[]>([]);
	let paletteIndex = $state(0);
	let confirmingCommand = $state<string | null>(null);
	let runningCommand = $state<string | null>(null);
	let paletteInput = $state<HTMLInputElement>();
	const effectiveTheme = $derived(data.theme);
	const paletteResults = $derived(rankCommands(paletteCommands, paletteQuery, 12));

	async function selectTheme(name: string) {
		if (switching) {
			return;
		}

		switching = true;

		try {
			await fetch('/theme/select', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mode: 'builtin', name })
			});
			await invalidate('dash:theme');
			pickerOpen = false;
		} finally {
			switching = false;
		}
	}

	async function openPalette() {
		paletteOpen = true;
		paletteQuery = '';
		paletteIndex = 0;
		confirmingCommand = null;
		await tick();
		paletteInput?.focus();

		if (paletteCommands.length === 0) {
			await loadPaletteCommands();
		}
	}

	function closePalette() {
		paletteOpen = false;
		paletteQuery = '';
		paletteIndex = 0;
		confirmingCommand = null;
		paletteError = '';
	}

	async function loadPaletteCommands() {
		paletteLoading = true;
		paletteError = '';

		try {
			const response = await fetch('/command-palette', { cache: 'no-store' });

			if (!response.ok) {
				throw new Error(`Command index failed (${response.status})`);
			}

			const body = (await response.json()) as { commands?: PaletteCommand[] };
			paletteCommands = body.commands ?? [];
		} catch (error) {
			paletteError = error instanceof Error ? error.message : 'Command index failed.';
		} finally {
			paletteLoading = false;
		}
	}

	function onWindowKeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement;
		const typing =
			target instanceof HTMLInputElement ||
			target instanceof HTMLTextAreaElement ||
			target?.isContentEditable;

		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			paletteOpen ? closePalette() : void openPalette();
			return;
		}

		if (!paletteOpen || typing) {
			return;
		}

		if (event.key === 'Escape') {
			event.preventDefault();
			closePalette();
		}
	}

	function onPaletteKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			closePalette();
			return;
		}

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			paletteIndex = Math.min(paletteResults.length - 1, paletteIndex + 1);
			confirmingCommand = null;
			return;
		}

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			paletteIndex = Math.max(0, paletteIndex - 1);
			confirmingCommand = null;
			return;
		}

		if (event.key === 'Enter') {
			event.preventDefault();
			const command = paletteResults[paletteIndex];

			if (command) {
				void runCommand(command);
			}
		}
	}

	async function runCommand(command: PaletteCommand) {
		if (runningCommand) {
			return;
		}

		if (command.danger && confirmingCommand !== command.id) {
			confirmingCommand = command.id;
			return;
		}

		runningCommand = command.id;
		paletteError = '';

		try {
			if (command.kind === 'navigate' && command.href) {
				await goto(command.href);
				closePalette();
				return;
			}

			if (command.kind === 'bookmark' && command.url) {
				window.open(command.url, '_blank', 'noreferrer');
				void fetch('/command-palette', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ kind: command.kind, id: command.id }),
					keepalive: true
				});
				closePalette();
				return;
			}

			if (command.kind === 'service-open' && command.url) {
				window.open(command.url, '_blank', 'noreferrer');
				closePalette();
				return;
			}

			if ((command.kind === 'service-inspect' || command.kind === 'service-logs') && command.href) {
				await goto(command.href);
				closePalette();
				return;
			}

			if (command.kind === 'docker-control') {
				const response = await fetch('/command-palette', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						kind: command.kind,
						id: command.id,
						host: command.host,
						name: command.name,
						action: command.action,
						confirm: command.danger ? command.id : undefined
					})
				});

				if (!response.ok) {
					throw new Error(await response.text());
				}

				await invalidate('homelab:status');
				await loadPaletteCommands();
				await goto(`/homelab?inspect=${encodeURIComponent(`docker:${command.host}/${command.name}`)}`);
				closePalette();
			}
		} catch (error) {
			paletteError = error instanceof Error ? error.message : 'Command failed.';
		} finally {
			runningCommand = null;
		}
	}

	function commandTone(command: PaletteCommand) {
		if (command.danger) {
			return 'text-[var(--theme-danger)]';
		}

		if (command.kind.startsWith('service')) {
			return 'text-[var(--theme-color12,var(--theme-accent))]';
		}

		return 'text-[var(--theme-accent)]';
	}

	onMount(() => {
		if ('serviceWorker' in navigator) {
			void navigator.serviceWorker.register('/service-worker.js').catch(() => {
				// The app remains fully usable when service workers are unavailable,
				// such as on an insecure LAN origin.
			});
		}
	});
</script>

<svelte:window onkeydown={onWindowKeydown} />

<svelte:head>
	<link rel="icon" type="image/svg+xml" href="/icons/dash.svg" />
	<link rel="apple-touch-icon" href="/icons/dash-180.png" />
	<link rel="manifest" href="/manifest.webmanifest" />
	<meta name="application-name" content="Dash" />
	<meta name="apple-mobile-web-app-title" content="Dash" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="theme-color" content={effectiveTheme.colors.background ?? '#0e091d'} />
</svelte:head>
<div
	class="relative isolate min-h-dvh pb-16 text-[var(--theme-fg)] sm:pb-0"
	data-corners={data.appearance.corners}
	style={`${effectiveTheme.cssText}; color-scheme: ${effectiveTheme.mode}; --dash-radius: ${data.appearance.radius}px`}
>
	<div class="fixed inset-0 -z-30 bg-[var(--theme-bg)]"></div>

	<div
		class="fixed inset-0 -z-20 bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--theme-accent)_18%,transparent),transparent_34rem)]"
	></div>

	<nav
		aria-label="Site"
		class="sticky top-0 z-30 border-b border-[color-mix(in_srgb,var(--theme-fg)_10%,transparent)] bg-[color-mix(in_srgb,var(--theme-bg)_78%,transparent)] backdrop-blur"
	>
		<div class="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
			<a href="/" class="flex items-center gap-2.5 text-sm font-semibold tracking-wide">
				<span class="h-2.5 w-2.5 bg-[var(--theme-accent)] shadow-[0_0_10px_var(--theme-accent)]"></span>
				dash
			</a>

			<div class="hidden items-center gap-1 sm:flex">
				{#each links as link (link.href)}
					<a
						href={link.href}
						aria-current={isActive(link.href) ? 'page' : undefined}
						class={`relative px-3 py-2 text-sm transition ${
							isActive(link.href)
								? 'font-semibold text-[var(--theme-fg)]'
								: 'text-[color-mix(in_srgb,var(--theme-fg)_58%,transparent)] hover:text-[var(--theme-fg)]'
						}`}
					>
						{link.label}
						{#if isActive(link.href)}
							<span
								class="absolute inset-x-3 -bottom-px h-px bg-[var(--theme-accent)] shadow-[0_0_8px_var(--theme-accent)]"
							></span>
						{/if}
					</a>
				{/each}
			</div>

			<div class="relative">
				<button
					type="button"
					onclick={openPalette}
					class="mr-2 inline-flex border border-[color-mix(in_srgb,var(--theme-fg)_14%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_55%,transparent)] px-2.5 py-1.5 text-xs text-[color-mix(in_srgb,var(--theme-fg)_62%,transparent)] transition hover:border-[var(--theme-accent)] hover:text-[var(--theme-fg)]"
					aria-label="Open command palette"
				>
					<span aria-hidden="true" class="sm:hidden">⌕</span>
					<span class="hidden sm:inline">Search</span>
					<kbd class="ml-2 hidden border border-[color-mix(in_srgb,var(--theme-fg)_16%,transparent)] px-1 text-[10px] sm:inline">⌘K</kbd>
				</button>
				<button
					type="button"
					onclick={() => (pickerOpen = !pickerOpen)}
					class="flex items-center gap-2 border border-[color-mix(in_srgb,var(--theme-fg)_14%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_55%,transparent)] px-3 py-1.5 text-xs transition hover:border-[var(--theme-accent)]"
					aria-haspopup="menu"
					aria-expanded={pickerOpen}
				>
					<span class="h-3 w-3 border border-[color-mix(in_srgb,var(--theme-fg)_25%,transparent)] bg-[var(--theme-accent)]"></span>
					<span class="hidden capitalize sm:inline">{effectiveTheme.name}</span>
					<span class="text-[color-mix(in_srgb,var(--theme-fg)_50%,transparent)]">▾</span>
				</button>

				{#if pickerOpen}
					<div
						class="fixed inset-0 z-30"
						role="presentation"
						onclick={() => (pickerOpen = false)}
					></div>
					<div
						class="absolute right-0 top-full z-40 mt-2 w-56 border border-[color-mix(in_srgb,var(--theme-accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_40%,var(--theme-bg))] p-1.5 shadow-[0_20px_60px_-20px_color-mix(in_srgb,var(--theme-bg)_90%,transparent)] backdrop-blur"
						transition:scale={{ duration: 120, start: 0.96 }}
						role="menu"
					>
						<p class="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[color-mix(in_srgb,var(--theme-fg)_50%,transparent)]">
							Built-in themes
						</p>
						{#each data.builtins as builtin (builtin.slug)}
							{@const selected = data.selection.name === builtin.slug}
							<button
								type="button"
								role="menuitem"
								disabled={switching}
								onclick={() => selectTheme(builtin.slug)}
								class={`flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm transition hover:bg-[color-mix(in_srgb,var(--theme-fg)_8%,transparent)] ${selected ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-fg)]'}`}
							>
								{builtin.label}
								{#if selected}<span aria-hidden="true">✓</span>{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</nav>

	{@render children()}

	{#if paletteOpen}
		<div
			class="fixed inset-0 z-50 bg-[color-mix(in_srgb,var(--theme-bg)_58%,transparent)] backdrop-blur-sm"
			role="presentation"
			onclick={closePalette}
			transition:fade={{ duration: 100 }}
		></div>

		<div
			class="fixed left-1/2 top-20 z-50 w-[min(calc(100vw-1.5rem),42rem)] -translate-x-1/2 border border-[color-mix(in_srgb,var(--theme-accent)_36%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_55%,var(--theme-bg))] p-1.5 shadow-[0_24px_80px_-26px_color-mix(in_srgb,var(--theme-bg)_92%,transparent)] backdrop-blur"
			role="dialog"
			aria-label="Command palette"
			transition:fly={{ y: -8, duration: 120 }}
		>
			<label class="block border-b border-[color-mix(in_srgb,var(--theme-fg)_10%,transparent)]">
				<span class="sr-only">Search commands</span>
				<input
					bind:this={paletteInput}
					bind:value={paletteQuery}
					type="search"
					placeholder="Search bookmarks, pages, services…"
					oninput={() => {
						paletteIndex = 0;
						confirmingCommand = null;
					}}
					onkeydown={onPaletteKeydown}
					class="w-full bg-transparent px-3 py-3 text-sm outline-none placeholder:text-[color-mix(in_srgb,var(--theme-fg)_38%,transparent)] [&::-webkit-search-cancel-button]:hidden"
				/>
			</label>

			<div class="max-h-[min(28rem,calc(100dvh-9rem))] overflow-auto py-1">
				{#if paletteLoading}
					<p class="px-3 py-6 text-center text-xs text-[color-mix(in_srgb,var(--theme-fg)_52%,transparent)]">
						Loading commands…
					</p>
				{:else if paletteError}
					<p class="px-3 py-3 text-xs text-[var(--theme-danger)]">{paletteError}</p>
				{:else if paletteResults.length === 0}
					<p class="px-3 py-6 text-center text-xs text-[color-mix(in_srgb,var(--theme-fg)_52%,transparent)]">
						No commands match.
					</p>
				{:else}
					{#each paletteResults as command, index (command.id)}
						<button
							type="button"
							onclick={() => runCommand(command)}
							onmouseenter={() => (paletteIndex = index)}
							class={`flex w-full items-center gap-3 px-3 py-2 text-left transition ${
								index === paletteIndex
									? 'bg-[color-mix(in_srgb,var(--theme-fg)_9%,transparent)]'
									: 'hover:bg-[color-mix(in_srgb,var(--theme-fg)_6%,transparent)]'
							}`}
						>
							<span class={`grid h-7 w-7 shrink-0 place-items-center border border-[color-mix(in_srgb,currentColor_32%,transparent)] text-xs ${commandTone(command)}`}>
								{command.kind === 'navigate'
									? '↗'
									: command.kind === 'bookmark'
										? '★'
										: command.kind === 'docker-control'
											? command.action === 'start'
												? '▶'
												: command.action === 'stop'
													? '■'
													: '⟳'
											: command.kind === 'service-logs'
												? '≡'
												: '›'}
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-sm font-medium">
									{confirmingCommand === command.id ? `${command.title} — press Enter again` : command.title}
								</span>
								<span class="block truncate text-xs text-[color-mix(in_srgb,var(--theme-fg)_48%,transparent)]">
									{command.subtitle}
								</span>
							</span>
							{#if runningCommand === command.id}
								<span class="shrink-0 animate-spin text-xs text-[var(--theme-warning)]">⟳</span>
							{:else if command.danger}
								<span class="shrink-0 text-[10px] uppercase tracking-wide text-[var(--theme-danger)]">
									Confirm
								</span>
							{/if}
						</button>
					{/each}
				{/if}
			</div>
		</div>
	{/if}

	<nav
		aria-label="Primary"
		class="fixed inset-x-0 bottom-0 z-30 border-t border-[color-mix(in_srgb,var(--theme-fg)_12%,transparent)] bg-[color-mix(in_srgb,var(--theme-bg)_88%,transparent)] px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
	>
		<div class="mx-auto grid h-14 max-w-md grid-cols-4">
			{#each links as link (link.href)}
				<a
					href={link.href}
					aria-current={isActive(link.href) ? 'page' : undefined}
					class={`relative grid place-items-center px-1 text-[11px] font-medium transition active:translate-y-px ${
						isActive(link.href)
							? 'text-[var(--theme-fg)]'
							: 'text-[color-mix(in_srgb,var(--theme-fg)_52%,transparent)]'
					}`}
				>
					{#if isActive(link.href)}
						<span
							class="absolute inset-x-3 top-0 h-px bg-[var(--theme-accent)] shadow-[0_0_8px_var(--theme-accent)]"
						></span>
					{/if}
					{link.label}
				</a>
			{/each}
		</div>
	</nav>
</div>
