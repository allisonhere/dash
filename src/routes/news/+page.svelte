<script lang="ts">
	import { enhance } from '$app/forms';
	import { fade, fly } from 'svelte/transition';

	type Feed = { id: string; title: string; url: string };
	type NewsItem = {
		id: string;
		feedId: string;
		feedTitle: string;
		title: string;
		url: string;
		summary: string;
		commentsUrl: string | null;
		image: string | null;
		publishedAt: string | null;
	};

	let { data, form }: { data: import('./$types').PageData; form: import('./$types').ActionData } =
		$props();

	let managing = $state(false);
	let search = $state('');
	let activeFeed = $state('');
	let refreshing = $state(false);
	let confirmingDelete = $state<string | null>(null);
	let searchInput = $state<HTMLInputElement>();

	const failures = $derived(data.results.filter((result) => result.status === 'error'));

	const items = $derived(
		data.results
			.flatMap((result) => result.items)
			.filter((item) => {
				if (activeFeed && item.feedId !== activeFeed) {
					return false;
				}

				const query = search.trim().toLowerCase();

				if (!query) {
					return true;
				}

				return [item.title, item.summary, item.feedTitle].some((field) =>
					field.toLowerCase().includes(query)
				);
			})
			.sort((left, right) => (right.publishedAt ?? '').localeCompare(left.publishedAt ?? ''))
	);

	const PALETTE = [
		'--theme-accent',
		'--theme-color12',
		'--theme-color3',
		'--theme-color6',
		'--theme-color5',
		'--theme-color11',
		'--theme-color14'
	];

	function feedColor(feedId: string) {
		const index = Math.max(0, data.feeds.findIndex((feed: Feed) => feed.id === feedId));
		return `var(${PALETTE[index % PALETTE.length]}, var(--theme-accent))`;
	}

	function timeAgo(iso: string | null): string {
		if (!iso) {
			return '';
		}

		const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);

		if (seconds < 90) {
			return 'just now';
		}

		const minutes = seconds / 60;

		if (minutes < 60) {
			return `${Math.round(minutes)}m ago`;
		}

		const hours = minutes / 60;

		if (hours < 24) {
			return `${Math.round(hours)}h ago`;
		}

		const days = hours / 24;

		if (days < 7) {
			return `${Math.round(days)}d ago`;
		}

		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function hostOf(url: string) {
		try {
			return new URL(url).hostname;
		} catch {
			return '';
		}
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
			if (managing) {
				managing = false;
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

		if (typing || managing) {
			return;
		}

		if (event.key === '/') {
			event.preventDefault();
			searchInput?.focus();
		}
	}

	function autofocus(node: HTMLElement) {
		node.focus();
	}

	const SUGGESTIONS = [
		{ title: 'Hacker News', url: 'https://news.ycombinator.com/rss' },
		{ title: 'Lobsters', url: 'https://lobste.rs/rss' },
		{ title: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index' },
		{ title: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' }
	];

	let draftUrl = $state('');
	let draftTitle = $state('');
</script>

<svelte:head>
	<title>News | Custom Dash</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<main class="mx-auto min-h-dvh w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<header class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<p class="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--theme-accent)]">
				Aggregated feeds
			</p>
			<h1 class="mt-2 text-4xl font-semibold text-[var(--theme-fg)] md:text-5xl">News</h1>
			<p class="mt-2 text-sm leading-6 text-[color-mix(in_srgb,var(--theme-fg)_60%,transparent)]">
				{items.length} stories from {data.feeds.length}
				{data.feeds.length === 1 ? 'feed' : 'feeds'}
			</p>
		</div>

		<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
			<label class="group relative block">
				<span class="sr-only">Search stories</span>
				<input
					bind:this={searchInput}
					bind:value={search}
					type="search"
					placeholder="Search…"
					class="w-full border border-[color-mix(in_srgb,var(--theme-fg)_14%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_60%,transparent)] py-2.5 pl-4 pr-10 text-sm outline-none backdrop-blur transition placeholder:text-[color-mix(in_srgb,var(--theme-fg)_38%,transparent)] focus:border-[var(--theme-accent)] focus:shadow-[0_0_20px_-6px_color-mix(in_srgb,var(--theme-accent)_60%,transparent)] sm:w-56 [&::-webkit-search-cancel-button]:hidden"
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
					class="w-full border border-[color-mix(in_srgb,var(--theme-fg)_16%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_60%,transparent)] px-4 py-2.5 text-sm backdrop-blur transition hover:border-[var(--theme-accent)] disabled:opacity-60 sm:w-auto"
				>
					<span class={refreshing ? 'inline-block animate-spin' : 'inline-block'}>⟳</span>
					{refreshing ? 'Refreshing…' : 'Refresh'}
				</button>
			</form>

			<button
				type="button"
				onclick={() => (managing = true)}
				class="border border-[color-mix(in_srgb,var(--theme-accent)_60%,transparent)] bg-[var(--theme-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--theme-bg)] shadow-[0_8px_28px_-10px_color-mix(in_srgb,var(--theme-accent)_75%,transparent)] transition hover:-translate-y-px hover:shadow-[0_12px_32px_-10px_color-mix(in_srgb,var(--theme-accent)_90%,transparent)]"
			>
				Manage feeds
			</button>
		</div>
	</header>

	{#if failures.length}
		<div
			class="mt-5 border border-[color-mix(in_srgb,var(--theme-warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--theme-warning)_12%,transparent)] px-4 py-3 text-sm"
			transition:fade={{ duration: 120 }}
		>
			{#each failures as failure (failure.feed.id)}
				<p>
					<span class="font-semibold">{failure.feed.title}</span>
					<span class="text-[color-mix(in_srgb,var(--theme-fg)_65%,transparent)]"> — {failure.error}</span>
				</p>
			{/each}
		</div>
	{/if}

	{#if data.feeds.length > 1}
		<nav class="mt-6 flex flex-wrap gap-2" aria-label="Filter by feed">
			<button
				type="button"
				onclick={() => (activeFeed = '')}
				class={`border px-3 py-1.5 text-xs font-medium transition ${
					activeFeed === ''
						? 'border-[color-mix(in_srgb,var(--theme-accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--theme-accent)_18%,transparent)] text-[var(--theme-fg)]'
						: 'border-[color-mix(in_srgb,var(--theme-fg)_12%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_55%,transparent)] text-[color-mix(in_srgb,var(--theme-fg)_62%,transparent)] hover:border-[color-mix(in_srgb,var(--theme-fg)_30%,transparent)]'
				}`}
			>
				All
			</button>

			{#each data.feeds as feed (feed.id)}
				<button
					type="button"
					style={`--cat: ${feedColor(feed.id)}`}
					onclick={() => (activeFeed = activeFeed === feed.id ? '' : feed.id)}
					class={`inline-flex items-center gap-2 border px-3 py-1.5 text-xs font-medium transition ${
						activeFeed === feed.id
							? 'border-[color-mix(in_srgb,var(--cat)_60%,transparent)] bg-[color-mix(in_srgb,var(--cat)_16%,transparent)] text-[var(--theme-fg)]'
							: 'border-[color-mix(in_srgb,var(--theme-fg)_12%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_55%,transparent)] text-[color-mix(in_srgb,var(--theme-fg)_62%,transparent)] hover:border-[color-mix(in_srgb,var(--cat)_45%,transparent)]'
					}`}
				>
					<span class="h-1.5 w-1.5 bg-[var(--cat)] shadow-[0_0_8px_var(--cat)]"></span>
					{feed.title}
				</button>
			{/each}
		</nav>
	{/if}

	{#if data.feeds.length === 0}
		<section
			class="mt-10 grid place-items-center border border-dashed border-[color-mix(in_srgb,var(--theme-fg)_18%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_40%,transparent)] px-6 py-20 text-center"
			in:fade={{ duration: 200 }}
		>
			<div
				class="grid h-16 w-16 place-items-center border border-[color-mix(in_srgb,var(--theme-accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--theme-accent)_14%,transparent)] text-3xl shadow-[0_0_32px_-8px_color-mix(in_srgb,var(--theme-accent)_70%,transparent)]"
			>
				⌁
			</div>
			<h2 class="mt-6 text-2xl font-semibold">No feeds yet</h2>
			<p class="mt-2 max-w-sm text-sm leading-6 text-[color-mix(in_srgb,var(--theme-fg)_60%,transparent)]">
				Add an RSS or Atom feed — or paste any site URL and the feed will be discovered
				automatically.
			</p>
			<button
				type="button"
				onclick={() => (managing = true)}
				class="mt-6 border border-[var(--theme-accent)] bg-[var(--theme-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--theme-bg)] transition hover:-translate-y-px"
			>
				Add a feed
			</button>
		</section>
	{:else if items.length === 0}
		<p class="mt-10 text-center text-sm text-[color-mix(in_srgb,var(--theme-fg)_60%,transparent)]" in:fade>
			{search ? `Nothing matches “${search}”.` : 'No stories loaded.'}
		</p>
	{:else}
		<section class="mt-6 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
			{#each items as item (item.feedId + item.id)}
				<article
					style={`--cat: ${feedColor(item.feedId)}`}
					class="group/card relative flex flex-col overflow-hidden border border-[color-mix(in_srgb,var(--theme-fg)_11%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_62%,transparent)] backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--cat)_55%,transparent)] hover:bg-[color-mix(in_srgb,var(--theme-panel)_80%,transparent)] hover:shadow-[0_12px_36px_-14px_color-mix(in_srgb,var(--cat)_65%,transparent)]"
				>
					<div
						class="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-linear-to-r from-transparent via-[color-mix(in_srgb,var(--cat)_70%,transparent)] to-transparent opacity-0 transition duration-200 group-hover/card:opacity-100"
					></div>

					<a
						href={item.url}
						target="_blank"
						rel="noreferrer"
						class="absolute inset-0 z-10"
						aria-label={`Open ${item.title}`}
					></a>

					{#if item.image}
						<div class="h-32 overflow-hidden">
							<img
								src={item.image}
								alt=""
								loading="lazy"
								class="h-full w-full object-cover transition duration-300 group-hover/card:scale-[1.03]"
								onerror={(event) => (event.currentTarget as HTMLImageElement).parentElement?.remove()}
							/>
						</div>
					{/if}

					<div class="flex flex-1 flex-col gap-1.5 p-3">
						<p class="flex items-center gap-2 text-xs">
							<span class="h-1.5 w-1.5 shrink-0 bg-[var(--cat)] shadow-[0_0_8px_var(--cat)]"></span>
							<span class="truncate font-medium text-[var(--cat)]">{item.feedTitle}</span>
							{#if item.publishedAt}
								<span class="shrink-0 text-[color-mix(in_srgb,var(--theme-fg)_45%,transparent)]">
									· {timeAgo(item.publishedAt)}
								</span>
							{/if}
						</p>

						<h3 class="line-clamp-2 text-sm font-semibold leading-snug text-[var(--theme-fg)]">
							{item.title}
						</h3>

						{#if item.summary}
							<p class="line-clamp-2 text-xs leading-5 text-[color-mix(in_srgb,var(--theme-fg)_58%,transparent)]">
								{item.summary}
							</p>
						{/if}

						<p
							class="mt-auto flex items-center justify-between gap-2 pt-1 text-[11px] text-[color-mix(in_srgb,var(--theme-fg)_40%,transparent)]"
						>
							<span class="truncate">{hostOf(item.url)}</span>
							{#if item.commentsUrl}
								<a
									href={item.commentsUrl}
									target="_blank"
									rel="noreferrer"
									class="relative z-20 shrink-0 text-[color-mix(in_srgb,var(--theme-fg)_55%,transparent)] transition hover:text-[var(--cat)]"
								>
									Comments ↗
								</a>
							{/if}
						</p>
					</div>
				</article>
			{/each}
		</section>
	{/if}
</main>

{#if managing}
	<div
		class="fixed inset-0 z-40 grid place-items-center bg-[color-mix(in_srgb,var(--theme-bg)_78%,transparent)] p-4 backdrop-blur-sm"
		transition:fade={{ duration: 120 }}
		onclick={(event) => event.target === event.currentTarget && (managing = false)}
		role="presentation"
	>
		<div
			class="relative w-full max-w-lg overflow-hidden border border-[color-mix(in_srgb,var(--theme-accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_35%,var(--theme-bg))] p-6 shadow-[0_24px_80px_-24px_color-mix(in_srgb,var(--theme-accent)_45%,transparent)]"
			transition:fly={{ y: 14, duration: 160 }}
			role="dialog"
			aria-modal="true"
			aria-label="Manage feeds"
		>
			<div
				class="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-[var(--theme-accent)] to-transparent"
			></div>

			<div class="flex items-start justify-between gap-4">
				<div>
					<p class="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--theme-accent)]">
						Sources
					</p>
					<h2 class="mt-1 text-2xl font-semibold">Manage feeds</h2>
				</div>
				<button
					type="button"
					onclick={() => (managing = false)}
					class="grid h-9 w-9 place-items-center border border-[color-mix(in_srgb,var(--theme-fg)_16%,transparent)] text-lg transition hover:border-[var(--theme-accent)]"
					aria-label="Close"
				>
					×
				</button>
			</div>

			{#if form?.message}
				<p
					class="mt-4 border border-[color-mix(in_srgb,var(--theme-danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--theme-danger)_14%,transparent)] px-3 py-2 text-sm"
					transition:fade={{ duration: 120 }}
				>
					{form.message}
				</p>
			{/if}

			<form
				method="POST"
				action="?/add"
				class="mt-5 grid gap-3"
				use:enhance={() => {
					return async ({ result, update }) => {
						await update();
						if (result.type === 'success') {
							draftUrl = '';
							draftTitle = '';
						}
					};
				}}
			>
				<label class="grid gap-2 text-sm">
					<span class="text-[color-mix(in_srgb,var(--theme-fg)_70%,transparent)]">Feed or site URL</span>
					<input
						name="url"
						required
						use:autofocus
						bind:value={draftUrl}
						placeholder="lobste.rs or https://…/rss"
						class="border border-[color-mix(in_srgb,var(--theme-fg)_14%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_55%,transparent)] px-3 py-2.5 font-mono text-sm outline-none transition placeholder:font-sans placeholder:text-[color-mix(in_srgb,var(--theme-fg)_32%,transparent)] focus:border-[var(--theme-accent)] focus:shadow-[0_0_16px_-6px_color-mix(in_srgb,var(--theme-accent)_60%,transparent)]"
					/>
				</label>

				<div class="grid gap-3 sm:grid-cols-[1fr_auto]">
					<label class="grid gap-2 text-sm">
						<span class="text-[color-mix(in_srgb,var(--theme-fg)_70%,transparent)]">
							Title <span class="text-[color-mix(in_srgb,var(--theme-fg)_40%,transparent)]">(optional, auto-detected)</span>
						</span>
						<input
							name="title"
							bind:value={draftTitle}
							class="border border-[color-mix(in_srgb,var(--theme-fg)_14%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_55%,transparent)] px-3 py-2.5 outline-none transition focus:border-[var(--theme-accent)] focus:shadow-[0_0_16px_-6px_color-mix(in_srgb,var(--theme-accent)_60%,transparent)]"
						/>
					</label>

					<button
						type="submit"
						class="self-end border border-[var(--theme-accent)] bg-[var(--theme-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--theme-bg)] shadow-[0_8px_24px_-10px_color-mix(in_srgb,var(--theme-accent)_80%,transparent)] transition hover:-translate-y-px"
					>
						Add feed
					</button>
				</div>
			</form>

			{#if data.feeds.length === 0}
				<div class="mt-4 flex flex-wrap gap-2">
					{#each SUGGESTIONS as suggestion (suggestion.url)}
						<button
							type="button"
							onclick={() => {
								draftUrl = suggestion.url;
								draftTitle = suggestion.title;
							}}
							class="border border-[color-mix(in_srgb,var(--theme-fg)_14%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_55%,transparent)] px-3 py-1.5 text-xs text-[color-mix(in_srgb,var(--theme-fg)_70%,transparent)] transition hover:border-[var(--theme-accent)] hover:text-[var(--theme-fg)]"
						>
							{suggestion.title}
						</button>
					{/each}
				</div>
			{/if}

			{#if data.feeds.length}
				<ul class="mt-6 grid gap-2 border-t border-[color-mix(in_srgb,var(--theme-fg)_10%,transparent)] pt-5">
					{#each data.feeds as feed (feed.id)}
						<li
							style={`--cat: ${feedColor(feed.id)}`}
							class="flex items-center gap-3 border border-[color-mix(in_srgb,var(--theme-fg)_10%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_55%,transparent)] px-3 py-2"
						>
							<span class="h-1.5 w-1.5 shrink-0 bg-[var(--cat)] shadow-[0_0_8px_var(--cat)]"></span>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium">{feed.title}</p>
								<p class="truncate text-xs text-[color-mix(in_srgb,var(--theme-fg)_48%,transparent)]">
									{feed.url}
								</p>
							</div>
							<form method="POST" action="?/delete" use:enhance>
								<input type="hidden" name="id" value={feed.id} />
								<button
									type="submit"
									onclick={(event) => requestDelete(event, feed.id)}
									class={`border px-2 py-1 text-xs transition ${
										confirmingDelete === feed.id
											? 'border-[var(--theme-danger)] bg-[color-mix(in_srgb,var(--theme-danger)_22%,transparent)] text-[var(--theme-fg)]'
											: 'border-[color-mix(in_srgb,var(--theme-danger)_40%,transparent)] text-[var(--theme-danger)] hover:bg-[color-mix(in_srgb,var(--theme-danger)_14%,transparent)]'
									}`}
								>
									{confirmingDelete === feed.id ? 'Sure?' : 'Remove'}
								</button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
{/if}
