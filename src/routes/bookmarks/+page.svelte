<script lang="ts">
	import { enhance } from '$app/forms';
	import { hostOf, iconCandidatesForBookmark } from '$lib/dashboard-icons.js';
	import { cssColorForKey } from '$lib/group-color';
	import { fade, fly } from 'svelte/transition';

	type Bookmark = {
		id: string;
		title: string;
		url: string;
		category: string;
		icon: string;
		lastUsedAt?: string;
		useCount?: number;
		pinnedAt?: string;
	};

	let { data, form }: { data: import('./$types').PageData; form: import('./$types').ActionData } =
		$props();

	let editing = $state<Bookmark | null>(null);
	let creating = $state(false);
	let search = $state('');
	let activeCategory = $state('');
	let confirmingDelete = $state<string | null>(null);
	let searchInput = $state<HTMLInputElement>();
	let loadedFavicons = $state<Record<string, boolean>>({});
	let failedIconAttempts = $state<Record<string, number>>({});
	let recentVisitTimes = $state<Record<string, string>>({});

	let draftTitle = $state('');
	let draftUrl = $state('');
	let draftCategory = $state('General');
	let draftIcon = $state('↗');
	let newCategory = $state(false);

	const NEW_CATEGORY = '__new__';

	const editorOpen = $derived(creating || editing !== null);

	// Groups come from settings now, so an empty group still offers itself in the
	// category dropdown even though it renders no section below.
	const categories = $derived(data.groups.map((group) => group.name));

	const filtered = $derived(
		data.bookmarks.filter((bookmark) => {
			if (activeCategory && bookmark.category !== activeCategory) {
				return false;
			}

			const query = search.trim().toLowerCase();

			if (!query) {
				return true;
			}

			return [bookmark.title, bookmark.url, bookmark.category].some((field) =>
				field.toLowerCase().includes(query)
			);
		})
	);

	const groups = $derived(
		categories
			.map((category) => ({
				category,
				bookmarks: filtered.filter((bookmark) => bookmark.category === category)
			}))
			.filter((group) => group.bookmarks.length > 0)
	);

	const MAX_PINNED = 4;

	const pinnedBookmarks = $derived(
		data.bookmarks
			.filter((bookmark) => Boolean(bookmark.pinnedAt))
			.toSorted((left, right) => Date.parse(left.pinnedAt ?? '') - Date.parse(right.pinnedAt ?? ''))
			.slice(0, MAX_PINNED)
	);

	const recentBookmarks = $derived(
		data.bookmarks
			.filter((bookmark) => !bookmark.pinnedAt && effectiveLastUsedAt(bookmark) !== '')
			.toSorted((left, right) => Date.parse(effectiveLastUsedAt(right)) - Date.parse(effectiveLastUsedAt(left)))
			.slice(0, 8)
	);

	function categoryColor(category: string) {
		const index = data.groups.findIndex((group) => group.name === category);
		const group = index >= 0 ? data.groups[index] : null;
		return cssColorForKey(group?.color ?? '', category, Math.max(0, index));
	}

	function iconCandidates(bookmark: Pick<Bookmark, 'title' | 'url' | 'icon'>) {
		return iconCandidatesForBookmark(bookmark);
	}

	function activeIconUrl(bookmark: Bookmark) {
		return iconCandidates(bookmark)[failedIconAttempts[bookmark.id] ?? 0] ?? '';
	}

	function draftIconUrl() {
		return iconCandidates({ title: draftTitle, url: draftUrl, icon: draftIcon })[0] ?? '';
	}

	function fallbackIconText(icon: string) {
		return icon.trim().toLowerCase().startsWith('di:') ? '↗' : icon || '↗';
	}

	function tryNextIcon(bookmark: Bookmark) {
		const nextAttempt = (failedIconAttempts[bookmark.id] ?? 0) + 1;
		failedIconAttempts[bookmark.id] = nextAttempt;
		loadedFavicons[bookmark.id] = false;
	}

	function effectiveLastUsedAt(bookmark: Bookmark) {
		return recentVisitTimes[bookmark.id] ?? bookmark.lastUsedAt ?? '';
	}

	function trackBookmarkVisit(bookmark: Bookmark) {
		recentVisitTimes[bookmark.id] = new Date().toISOString();

		const body = new FormData();
		body.set('id', bookmark.id);

		if (navigator.sendBeacon?.('?/visit', body)) {
			return;
		}

		void fetch('?/visit', {
			method: 'POST',
			body,
			keepalive: true
		});
	}

	function openCreate() {
		creating = true;
		editing = null;
		draftTitle = '';
		draftUrl = '';
		draftCategory = activeCategory || categories[0] || 'General';
		draftIcon = '↗';
		newCategory = false;
	}

	function openEdit(bookmark: Bookmark) {
		editing = bookmark;
		creating = false;
		draftTitle = bookmark.title;
		draftUrl = bookmark.url;
		draftCategory = bookmark.category;
		draftIcon = bookmark.icon;
		newCategory = false;
	}

	function selectCategory(value: string) {
		if (value === NEW_CATEGORY) {
			newCategory = true;
			draftCategory = '';
			return;
		}

		draftCategory = value;
	}

	function cancelNewCategory() {
		newCategory = false;
		draftCategory = categories[0] ?? 'General';
	}

	function closeEditor() {
		editing = null;
		creating = false;
	}

	function requestDelete(event: MouseEvent, id: string) {
		if (confirmingDelete !== id) {
			event.preventDefault();
			confirmingDelete = id;
			setTimeout(() => {
				if (confirmingDelete === id) {
					confirmingDelete = null;
				}
			}, 2500);
		}
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			if (editorOpen) {
				closeEditor();
			} else if (search) {
				search = '';
			}
			return;
		}

		const target = event.target as HTMLElement;
		const typing =
			target instanceof HTMLInputElement ||
			target instanceof HTMLTextAreaElement ||
			target?.isContentEditable;

		if (typing || editorOpen) {
			return;
		}

		if (event.key === '/') {
			event.preventDefault();
			searchInput?.focus();
		}

		if (event.key === 'n') {
			event.preventDefault();
			openCreate();
		}
	}

	function autofocus(node: HTMLElement) {
		node.focus();
	}

	function autofocusIf(node: HTMLElement, enabled: boolean) {
		if (enabled) {
			node.focus();
		}
	}
</script>

<svelte:head>
	<title>Bookmarks | Custom Dash</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} />

{#snippet bookmarkCard(bookmark: Bookmark, accent: string)}
	<article
		style={`--cat: ${accent}`}
		in:fade={{ duration: 150 }}
		class="group/card relative overflow-hidden border border-[color:var(--cat)] bg-[color-mix(in_srgb,var(--theme-panel)_62%,transparent)] p-2.5 backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-[color-mix(in_srgb,var(--theme-panel)_80%,transparent)] hover:shadow-[0_12px_36px_-14px_color-mix(in_srgb,var(--cat)_65%,transparent)]"
	>
		<div
			class="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-[color-mix(in_srgb,var(--cat)_70%,transparent)] to-transparent opacity-0 transition duration-200 group-hover/card:opacity-100"
		></div>

		<a
			href={bookmark.url}
			target="_blank"
			rel="noreferrer"
			class="absolute inset-0 z-0"
			aria-label={`Open ${bookmark.title}`}
			onclick={() => trackBookmarkVisit(bookmark)}
		></a>

		<div class="pointer-events-none flex items-center gap-3">
			<div
				class="relative grid h-9 w-9 shrink-0 place-items-center border border-[color-mix(in_srgb,var(--cat)_35%,transparent)] bg-[color-mix(in_srgb,var(--cat)_13%,transparent)] transition duration-200 group-hover/card:scale-105 group-hover/card:shadow-[0_0_18px_-4px_color-mix(in_srgb,var(--cat)_70%,transparent)]"
			>
				{#if !loadedFavicons[bookmark.id]}
					<span class="text-base">{fallbackIconText(bookmark.icon)}</span>
				{/if}
				{#if activeIconUrl(bookmark)}
					<img
						src={activeIconUrl(bookmark)}
						alt=""
						loading="lazy"
						class={`absolute h-5 w-5 transition ${loadedFavicons[bookmark.id] ? 'opacity-100' : 'opacity-0'}`}
						onload={() => (loadedFavicons[bookmark.id] = true)}
						onerror={() => tryNextIcon(bookmark)}
					/>
				{/if}
			</div>

			<div class="min-w-0 flex-1">
				<h3 class="truncate text-sm font-semibold text-[var(--theme-fg)]">
					{bookmark.title}
				</h3>
				<p class="truncate text-xs text-[color-mix(in_srgb,var(--theme-fg)_52%,transparent)]">
					{hostOf(bookmark.url) || bookmark.url}
				</p>
			</div>

			<span
				class="pr-1 text-[color-mix(in_srgb,var(--theme-fg)_35%,transparent)] transition duration-200 group-hover/card:opacity-0"
				aria-hidden="true"
			>
				{bookmark.pinnedAt ? '📌' : '↗'}
			</span>
		</div>

		<div
			class="absolute inset-y-0 right-2.5 z-10 flex items-center gap-1.5 opacity-0 transition duration-150 focus-within:opacity-100 group-hover/card:opacity-100"
		>
			<form method="POST" action="?/pin" use:enhance>
				<input type="hidden" name="id" value={bookmark.id} />
				<button
					type="submit"
					title={bookmark.pinnedAt ? 'Unpin' : `Pin to top (max ${MAX_PINNED})`}
					aria-label={bookmark.pinnedAt ? 'Unpin bookmark' : 'Pin bookmark'}
					class={`border px-2 py-1 text-xs backdrop-blur transition ${
						bookmark.pinnedAt
							? 'border-[color-mix(in_srgb,var(--cat)_60%,transparent)] bg-[color-mix(in_srgb,var(--cat)_20%,transparent)] text-[var(--theme-fg)]'
							: 'border-[color-mix(in_srgb,var(--theme-fg)_16%,transparent)] bg-[color-mix(in_srgb,var(--theme-bg)_78%,transparent)] text-[color-mix(in_srgb,var(--theme-fg)_80%,transparent)] hover:border-[var(--cat)] hover:text-[var(--theme-fg)]'
					}`}
				>
					{bookmark.pinnedAt ? 'Unpin' : 'Pin'}
				</button>
			</form>

			<button
				type="button"
				onclick={() => openEdit(bookmark)}
				class="border border-[color-mix(in_srgb,var(--theme-fg)_16%,transparent)] bg-[color-mix(in_srgb,var(--theme-bg)_78%,transparent)] px-2 py-1 text-xs text-[color-mix(in_srgb,var(--theme-fg)_80%,transparent)] backdrop-blur transition hover:border-[var(--cat)] hover:text-[var(--theme-fg)]"
			>
				Edit
			</button>

			<form method="POST" action="?/delete" use:enhance>
				<input type="hidden" name="id" value={bookmark.id} />
				<button
					type="submit"
					onclick={(event) => requestDelete(event, bookmark.id)}
					class={`border px-2 py-1 text-xs backdrop-blur transition ${
						confirmingDelete === bookmark.id
							? 'border-[var(--theme-danger)] bg-[color-mix(in_srgb,var(--theme-danger)_22%,transparent)] text-[var(--theme-fg)]'
							: 'border-[color-mix(in_srgb,var(--theme-danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--theme-bg)_78%,transparent)] text-[var(--theme-danger)] hover:bg-[color-mix(in_srgb,var(--theme-danger)_14%,transparent)]'
					}`}
				>
					{confirmingDelete === bookmark.id ? 'Sure?' : 'Delete'}
				</button>
			</form>
		</div>
	</article>
{/snippet}

<main class="mx-auto min-h-dvh w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<header class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<p class="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--theme-accent)]">
				Quick launch
			</p>
			<h1 class="mt-2 text-4xl font-semibold text-[var(--theme-fg)] md:text-5xl">Bookmarks</h1>
			<p class="mt-2 text-sm leading-6 text-[color-mix(in_srgb,var(--theme-fg)_60%,transparent)]">
				{data.bookmarks.length} saved · stored in
				<span class="font-mono text-[color-mix(in_srgb,var(--theme-accent)_85%,var(--theme-fg))]">~/.config/custom-dash/bookmarks.json</span>
			</p>
		</div>

		<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
			<label class="group relative block">
				<span class="sr-only">Search bookmarks</span>
				<input
					bind:this={searchInput}
					bind:value={search}
					type="search"
					placeholder="Search…"
					class="w-full border border-[color-mix(in_srgb,var(--theme-fg)_14%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_60%,transparent)] py-2.5 pl-4 pr-10 text-sm outline-none backdrop-blur transition placeholder:text-[color-mix(in_srgb,var(--theme-fg)_38%,transparent)] focus:border-[var(--theme-accent)] focus:shadow-[0_0_20px_-6px_color-mix(in_srgb,var(--theme-accent)_60%,transparent)] sm:w-64 [&::-webkit-search-cancel-button]:hidden"
				/>
				{#if search}
					<button
						type="button"
						aria-label="Clear search"
						onclick={() => {
							search = '';
							searchInput?.focus();
						}}
						class="absolute right-3 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center border border-[color-mix(in_srgb,var(--theme-fg)_18%,transparent)] text-xs leading-none text-[color-mix(in_srgb,var(--theme-fg)_55%,transparent)] transition hover:border-[var(--theme-accent)] hover:text-[var(--theme-fg)]"
					>
						×
					</button>
				{:else}
					<kbd
						class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 border border-[color-mix(in_srgb,var(--theme-fg)_18%,transparent)] px-1.5 py-0.5 text-[10px] text-[color-mix(in_srgb,var(--theme-fg)_50%,transparent)]"
					>
						/
					</kbd>
				{/if}
			</label>

			<button
				type="button"
				onclick={openCreate}
				class="border border-[color-mix(in_srgb,var(--theme-accent)_60%,transparent)] bg-[var(--theme-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--theme-bg)] shadow-[0_8px_28px_-10px_color-mix(in_srgb,var(--theme-accent)_75%,transparent)] transition hover:-translate-y-px hover:shadow-[0_12px_32px_-10px_color-mix(in_srgb,var(--theme-accent)_90%,transparent)]"
			>
				＋ New bookmark
			</button>
		</div>
	</header>

	{#if form?.message}
		<p
			class="mt-5 border border-[color-mix(in_srgb,var(--theme-danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--theme-danger)_14%,transparent)] px-4 py-3 text-sm text-[var(--theme-fg)]"
			transition:fade={{ duration: 120 }}
		>
			{form.message}
		</p>
	{/if}

	{#if categories.length > 1}
		<nav class="mt-6 flex flex-wrap gap-2" aria-label="Filter by category">
			<button
				type="button"
				onclick={() => (activeCategory = '')}
				class={`border px-3 py-1.5 text-xs font-medium transition ${
					activeCategory === ''
						? 'border-[color-mix(in_srgb,var(--theme-accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--theme-accent)_18%,transparent)] text-[var(--theme-fg)]'
						: 'border-[color-mix(in_srgb,var(--theme-fg)_12%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_55%,transparent)] text-[color-mix(in_srgb,var(--theme-fg)_62%,transparent)] hover:border-[color-mix(in_srgb,var(--theme-fg)_30%,transparent)]'
				}`}
			>
				All
				<span class="ml-1 text-[color-mix(in_srgb,var(--theme-fg)_45%,transparent)]">{data.bookmarks.length}</span>
			</button>

			{#each categories as category (category)}
				{@const count = data.bookmarks.filter((bookmark) => bookmark.category === category).length}
				<button
					type="button"
					style={`--cat: ${categoryColor(category)}`}
					onclick={() => (activeCategory = activeCategory === category ? '' : category)}
					class={`inline-flex items-center gap-2 border px-3 py-1.5 text-xs font-medium transition ${
						activeCategory === category
							? 'border-[color-mix(in_srgb,var(--cat)_60%,transparent)] bg-[color-mix(in_srgb,var(--cat)_16%,transparent)] text-[var(--theme-fg)]'
							: 'border-[color-mix(in_srgb,var(--theme-fg)_12%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_55%,transparent)] text-[color-mix(in_srgb,var(--theme-fg)_62%,transparent)] hover:border-[color-mix(in_srgb,var(--cat)_45%,transparent)]'
					}`}
				>
					<span class="h-1.5 w-1.5 bg-[var(--cat)] shadow-[0_0_8px_var(--cat)]"></span>
					{category}
					<span class="text-[color-mix(in_srgb,var(--theme-fg)_45%,transparent)]">{count}</span>
				</button>
			{/each}
		</nav>
	{/if}

	{#if pinnedBookmarks.length > 0}
		<section class="mt-7" aria-label="Pinned bookmarks">
			<div class="flex items-center gap-3">
				<h2 class="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--theme-accent)]">
					Pinned
				</h2>
				<span class="text-xs text-[color-mix(in_srgb,var(--theme-fg)_42%,transparent)]">
					{pinnedBookmarks.length}/{MAX_PINNED}
				</span>
				<div class="h-px flex-1 bg-linear-to-r from-[color-mix(in_srgb,var(--theme-accent)_45%,transparent)] to-transparent"></div>
			</div>

			<div class="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
				{#each pinnedBookmarks as bookmark (bookmark.id)}
					{@render bookmarkCard(bookmark, categoryColor(bookmark.category))}
				{/each}
			</div>
		</section>
	{/if}

	{#if recentBookmarks.length > 0}
		<section class="mt-7" aria-label="Recently opened bookmarks">
			<div class="flex items-center gap-3">
				<h2 class="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--theme-accent)]">
					Recent
				</h2>
				<span class="text-xs text-[color-mix(in_srgb,var(--theme-fg)_42%,transparent)]">
					{recentBookmarks.length}
				</span>
				<div class="h-px flex-1 bg-linear-to-r from-[color-mix(in_srgb,var(--theme-accent)_45%,transparent)] to-transparent"></div>
			</div>

			<div class="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
				{#each recentBookmarks as bookmark (bookmark.id)}
					{@render bookmarkCard(bookmark, categoryColor(bookmark.category))}
				{/each}
			</div>
		</section>
	{/if}

	{#if data.bookmarks.length === 0}
		<section
			class="mt-10 grid place-items-center border border-dashed border-[color-mix(in_srgb,var(--theme-fg)_18%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_40%,transparent)] px-6 py-20 text-center"
			in:fade={{ duration: 200 }}
		>
			<div
				class="grid h-16 w-16 place-items-center border border-[color-mix(in_srgb,var(--theme-accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--theme-accent)_14%,transparent)] text-3xl shadow-[0_0_32px_-8px_color-mix(in_srgb,var(--theme-accent)_70%,transparent)]"
			>
				↗
			</div>
			<h2 class="mt-6 text-2xl font-semibold">No bookmarks yet</h2>
			<p class="mt-2 max-w-sm text-sm leading-6 text-[color-mix(in_srgb,var(--theme-fg)_60%,transparent)]">
				Add your first bookmark to start building the launch grid. Press
				<kbd class="border border-[color-mix(in_srgb,var(--theme-fg)_20%,transparent)] px-1.5 py-0.5 text-xs">n</kbd>
				anytime.
			</p>
			<button
				type="button"
				onclick={openCreate}
				class="mt-6 border border-[var(--theme-accent)] bg-[var(--theme-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--theme-bg)] transition hover:-translate-y-px"
			>
				Add a bookmark
			</button>
		</section>
	{:else if groups.length === 0}
		<p class="mt-10 text-center text-sm text-[color-mix(in_srgb,var(--theme-fg)_60%,transparent)]" in:fade>
			Nothing matches “{search}”. Press
			<kbd class="border border-[color-mix(in_srgb,var(--theme-fg)_20%,transparent)] px-1.5 py-0.5 text-xs">Esc</kbd>
			to clear the search.
		</p>
	{:else}
		{#each groups as group (group.category)}
			<section class="mt-6" style={`--cat: ${categoryColor(group.category)}`}>
				<div class="flex items-center gap-3">
					<h2 class="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--cat)]">
						{group.category}
					</h2>
					<span class="text-xs text-[color-mix(in_srgb,var(--theme-fg)_42%,transparent)]">
						{group.bookmarks.length}
					</span>
					<div class="h-px flex-1 bg-linear-to-r from-[color-mix(in_srgb,var(--cat)_45%,transparent)] to-transparent"></div>
				</div>

				<div class="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{#each group.bookmarks as bookmark (bookmark.id)}
						{@render bookmarkCard(bookmark, categoryColor(group.category))}
					{/each}
				</div>
			</section>
		{/each}
	{/if}
</main>

{#if editorOpen}
	<div
		class="fixed inset-0 z-40 grid place-items-center bg-[color-mix(in_srgb,var(--theme-bg)_78%,transparent)] p-4 backdrop-blur-sm"
		transition:fade={{ duration: 120 }}
		onclick={(event) => event.target === event.currentTarget && closeEditor()}
		role="presentation"
	>
		<div
			class="relative w-full max-w-lg overflow-hidden border border-[color-mix(in_srgb,var(--theme-accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_35%,var(--theme-bg))] p-6 shadow-[0_24px_80px_-24px_color-mix(in_srgb,var(--theme-accent)_45%,transparent)]"
			transition:fly={{ y: 14, duration: 160 }}
			role="dialog"
			aria-modal="true"
			aria-label={editing ? 'Edit bookmark' : 'Create bookmark'}
		>
			<div
				class="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-[var(--theme-accent)] to-transparent"
			></div>

			<div class="flex items-start justify-between gap-4">
				<div>
					<p class="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--theme-accent)]">
						{editing ? 'Edit' : 'New'}
					</p>
					<h2 class="mt-1 text-2xl font-semibold">
						{editing ? 'Update bookmark' : 'Create bookmark'}
					</h2>
				</div>
				<button
					type="button"
					onclick={closeEditor}
					class="grid h-9 w-9 place-items-center border border-[color-mix(in_srgb,var(--theme-fg)_16%,transparent)] text-lg transition hover:border-[var(--theme-accent)]"
					aria-label="Close editor"
				>
					×
				</button>
			</div>

			<div
				class="mt-5 flex items-center gap-3 border border-[color-mix(in_srgb,var(--theme-fg)_10%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_55%,transparent)] p-3"
			>
				<div
					class="relative grid h-11 w-11 shrink-0 place-items-center border border-[color-mix(in_srgb,var(--theme-accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--theme-accent)_13%,transparent)]"
				>
					<span class="text-lg">{fallbackIconText(draftIcon)}</span>
					{#if draftIconUrl()}
						<img
							src={draftIconUrl()}
							alt=""
							class="absolute h-6 w-6 bg-[color-mix(in_srgb,var(--theme-accent)_13%,var(--theme-bg))]"
							onerror={(event) => (event.currentTarget as HTMLImageElement).remove()}
						/>
					{/if}
				</div>
				<div class="min-w-0">
					<p class="truncate text-sm font-semibold">{draftTitle || 'Untitled'}</p>
					<p class="truncate text-xs text-[color-mix(in_srgb,var(--theme-fg)_52%,transparent)]">
						{hostOf(draftUrl) || 'no url yet'}
					</p>
				</div>
			</div>

			<form
				method="POST"
				action={editing ? '?/update' : '?/create'}
				class="mt-5 grid gap-4"
				use:enhance={() => {
					return async ({ result, update }) => {
						await update({ reset: !editing });
						if (result.type === 'success') {
							closeEditor();
						}
					};
				}}
			>
				{#if editing}
					<input type="hidden" name="id" value={editing.id} />
				{/if}

				<label class="grid gap-2 text-sm">
					<span class="text-[color-mix(in_srgb,var(--theme-fg)_70%,transparent)]">Title</span>
					<input
						name="title"
						required
						use:autofocus
						bind:value={draftTitle}
						placeholder="Jellyfin"
						class="border border-[color-mix(in_srgb,var(--theme-fg)_14%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_55%,transparent)] px-3 py-2.5 outline-none transition placeholder:text-[color-mix(in_srgb,var(--theme-fg)_32%,transparent)] focus:border-[var(--theme-accent)] focus:shadow-[0_0_16px_-6px_color-mix(in_srgb,var(--theme-accent)_60%,transparent)]"
					/>
				</label>

				<label class="grid gap-2 text-sm">
					<span class="text-[color-mix(in_srgb,var(--theme-fg)_70%,transparent)]">URL</span>
					<input
						name="url"
						required
						bind:value={draftUrl}
						placeholder="jellyfin.local:8096 or https://…"
						class="border border-[color-mix(in_srgb,var(--theme-fg)_14%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_55%,transparent)] px-3 py-2.5 font-mono text-sm outline-none transition placeholder:font-sans placeholder:text-[color-mix(in_srgb,var(--theme-fg)_32%,transparent)] focus:border-[var(--theme-accent)] focus:shadow-[0_0_16px_-6px_color-mix(in_srgb,var(--theme-accent)_60%,transparent)]"
					/>
				</label>

				<div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,14rem)]">
					<label class="grid gap-2 text-sm">
						<span class="text-[color-mix(in_srgb,var(--theme-fg)_70%,transparent)]">Category</span>
						<input type="hidden" name="category" value={draftCategory} />

						{#if categories.length > 0 && !newCategory}
							<select
								value={draftCategory}
								onchange={(event) => selectCategory(event.currentTarget.value)}
								class="border border-[color-mix(in_srgb,var(--theme-fg)_14%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_55%,transparent)] px-3 py-2.5 outline-none transition focus:border-[var(--theme-accent)] focus:shadow-[0_0_16px_-6px_color-mix(in_srgb,var(--theme-accent)_60%,transparent)]"
							>
								{#each categories as category (category)}
									<option value={category}>{category}</option>
								{/each}
								<option value={NEW_CATEGORY}>＋ New category…</option>
							</select>
						{:else}
							<div class="flex items-center gap-2">
								<input
									use:autofocusIf={newCategory}
									bind:value={draftCategory}
									placeholder="Media"
									class="min-w-0 flex-1 border border-[color-mix(in_srgb,var(--theme-fg)_14%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_55%,transparent)] px-3 py-2.5 outline-none transition placeholder:text-[color-mix(in_srgb,var(--theme-fg)_32%,transparent)] focus:border-[var(--theme-accent)] focus:shadow-[0_0_16px_-6px_color-mix(in_srgb,var(--theme-accent)_60%,transparent)]"
								/>
								{#if categories.length > 0}
									<button
										type="button"
										onclick={cancelNewCategory}
										aria-label="Pick an existing category"
										class="shrink-0 border border-[color-mix(in_srgb,var(--theme-fg)_16%,transparent)] px-2.5 py-2.5 text-xs transition hover:border-[var(--theme-accent)]"
									>
										×
									</button>
								{/if}
							</div>
						{/if}
					</label>

					<label class="grid gap-2 text-sm">
						<span class="text-[color-mix(in_srgb,var(--theme-fg)_70%,transparent)]">Icon</span>
						<input
							name="icon"
							bind:value={draftIcon}
							placeholder="di:jellyfin or ↗"
							class="border border-[color-mix(in_srgb,var(--theme-fg)_14%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_55%,transparent)] px-3 py-2.5 outline-none transition placeholder:text-[color-mix(in_srgb,var(--theme-fg)_32%,transparent)] focus:border-[var(--theme-accent)] focus:shadow-[0_0_16px_-6px_color-mix(in_srgb,var(--theme-accent)_60%,transparent)]"
						/>
					</label>
				</div>

				<p class="text-xs leading-5 text-[color-mix(in_srgb,var(--theme-fg)_45%,transparent)]">
					Icons load from Dashboard Icons when possible. Use this field for an emoji fallback or
					a specific slug like di:home-assistant. Bare hostnames get https:// added for you.
				</p>

				<div class="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
					<button
						type="button"
						onclick={closeEditor}
						class="border border-[color-mix(in_srgb,var(--theme-fg)_16%,transparent)] px-4 py-2 text-sm transition hover:border-[color-mix(in_srgb,var(--theme-fg)_40%,transparent)]"
					>
						Cancel
					</button>
					<button
						type="submit"
						class="border border-[var(--theme-accent)] bg-[var(--theme-accent)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] shadow-[0_8px_24px_-10px_color-mix(in_srgb,var(--theme-accent)_80%,transparent)] transition hover:-translate-y-px"
					>
						{editing ? 'Save changes' : 'Create bookmark'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
