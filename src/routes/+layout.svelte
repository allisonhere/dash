<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { invalidate } from '$app/navigation';
	import { fade, scale } from 'svelte/transition';
	import type { Snippet } from 'svelte';

	let { children, data }: { children: Snippet; data: import('./$types').LayoutData } = $props();

	const links = [
		{ href: '/', label: 'Overview' },
		{ href: '/bookmarks', label: 'Bookmarks' },
		{ href: '/news', label: 'News' },
		{ href: '/homelab', label: 'Homelab' }
	];

	const isActive = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);

	let pickerOpen = $state(false);
	let switching = $state(false);

	const inOmarchyMode = $derived(data.selection.mode === 'omarchy');

	const backgroundUrl = $derived(
		inOmarchyMode && data.theme.backgroundVersion
			? `/theme/background?v=${data.theme.backgroundVersion}`
			: null
	);

	async function selectTheme(mode: 'builtin' | 'omarchy', name: string) {
		if (switching) {
			return;
		}

		switching = true;

		try {
			await fetch('/theme/select', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mode, name })
			});
			await invalidate('omarchy:theme');
			pickerOpen = false;
		} finally {
			switching = false;
		}
	}

	// Live-follow only matters in omarchy mode: subscribe to theme-change events
	// from the desktop and restyle in place. Built-in themes need no watcher.
	$effect(() => {
		if (!inOmarchyMode) {
			return;
		}

		const source = new EventSource('/theme/events');
		source.onmessage = () => invalidate('omarchy:theme');
		return () => source.close();
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<div
	class="relative isolate min-h-dvh text-[var(--theme-fg)]"
	style={`${data.theme.cssText}; color-scheme: ${data.theme.mode}`}
>
	<div class="fixed inset-0 -z-30 bg-[var(--theme-bg)]"></div>

	{#if backgroundUrl}
		{#key backgroundUrl}
			<div
				class="fixed inset-0 -z-20 bg-cover bg-center"
				style={`background-image: url('${backgroundUrl}')`}
				transition:fade={{ duration: 500 }}
			></div>
		{/key}
		<div
			class="fixed inset-0 -z-10 bg-[color-mix(in_srgb,var(--theme-bg)_76%,transparent)] backdrop-blur-xl"
		></div>
		<div
			class="fixed inset-0 -z-10 bg-linear-to-b from-transparent to-[color-mix(in_srgb,var(--theme-bg)_65%,transparent)]"
		></div>
	{:else}
		<div
			class="fixed inset-0 -z-20 bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--theme-accent)_18%,transparent),transparent_34rem)]"
		></div>
	{/if}

	<nav
		class="sticky top-0 z-30 border-b border-[color-mix(in_srgb,var(--theme-fg)_10%,transparent)] bg-[color-mix(in_srgb,var(--theme-bg)_78%,transparent)] backdrop-blur"
	>
		<div class="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
			<a href="/" class="flex items-center gap-2.5 text-sm font-semibold tracking-wide">
				<span class="h-2.5 w-2.5 bg-[var(--theme-accent)] shadow-[0_0_10px_var(--theme-accent)]"></span>
				dash
			</a>

			<div class="flex items-center gap-1">
				{#each links as link (link.href)}
					<a
						href={link.href}
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
					onclick={() => (pickerOpen = !pickerOpen)}
					class="flex items-center gap-2 border border-[color-mix(in_srgb,var(--theme-fg)_14%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_55%,transparent)] px-3 py-1.5 text-xs transition hover:border-[var(--theme-accent)]"
					aria-haspopup="menu"
					aria-expanded={pickerOpen}
				>
					<span class="h-3 w-3 border border-[color-mix(in_srgb,var(--theme-fg)_25%,transparent)] bg-[var(--theme-accent)]"></span>
					<span class="hidden capitalize sm:inline">{data.theme.name}</span>
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
							{@const selected = data.selection.mode === 'builtin' && data.selection.name === builtin.slug}
							<button
								type="button"
								role="menuitem"
								disabled={switching}
								onclick={() => selectTheme('builtin', builtin.slug)}
								class={`flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm transition hover:bg-[color-mix(in_srgb,var(--theme-fg)_8%,transparent)] ${selected ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-fg)]'}`}
							>
								{builtin.label}
								{#if selected}<span aria-hidden="true">✓</span>{/if}
							</button>
						{/each}

						{#if data.omarchyAvailable}
							<div class="my-1 border-t border-[color-mix(in_srgb,var(--theme-fg)_10%,transparent)]"></div>
							{@const omarchySelected = data.selection.mode === 'omarchy'}
							<button
								type="button"
								role="menuitem"
								disabled={switching}
								onclick={() => selectTheme('omarchy', '')}
								class={`flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm transition hover:bg-[color-mix(in_srgb,var(--theme-fg)_8%,transparent)] ${omarchySelected ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-fg)]'}`}
							>
								<span class="flex flex-col">
									<span>Match omarchy</span>
									<span class="text-[10px] text-[color-mix(in_srgb,var(--theme-fg)_50%,transparent)]">
										Live-follows your desktop
									</span>
								</span>
								{#if omarchySelected}<span aria-hidden="true">✓</span>{/if}
							</button>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</nav>

	{@render children()}
</div>
