<script lang="ts">
	import { enhance } from '$app/forms';
	import { cssColor, SWATCHES } from '$lib/group-color';
	import { fade } from 'svelte/transition';
	import { untrack } from 'svelte';

	let { data, form }: { data: import('./$types').PageData; form: import('./$types').ActionData } =
		$props();

	type Draft = { name: string; color: string };

	let drafts = $state<Record<string, Draft>>({});
	let openPicker = $state<string | null>(null);
	let confirmingDelete = $state<string | null>(null);
	let moveTo = $state<Record<string, string>>({});

	let newName = $state('');
	let newColor = $state('');

	// Re-seed the row drafts whenever the server data changes, so a saved row
	// snaps back to the persisted values instead of holding a stale edit. Rows
	// with an unsaved edit of their own are left alone rather than being wiped
	// out by a save elsewhere on the page (untrack keeps this from depending on
	// `drafts` itself, which it also writes to).
	$effect(() => {
		const groups = data.groups;

		untrack(() => {
			drafts = Object.fromEntries(
				groups.map((group) => {
					const existing = drafts[group.id];
					const isDirty =
						existing && (existing.name !== group.name || existing.color !== group.color);

					return [group.id, isDirty ? existing : { name: group.name, color: group.color }];
				})
			);
		});
	});

	const otherGroups = (id: string) => data.groups.filter((group) => group.id !== id);

	function dirty(id: string) {
		const group = data.groups.find((candidate) => candidate.id === id);
		const draft = drafts[id];
		return Boolean(group && draft && (group.name !== draft.name || group.color !== draft.color));
	}

	function pick(id: string, color: string) {
		if (id === 'new') {
			newColor = color;
		} else if (drafts[id]) {
			drafts[id].color = color;
		}

		openPicker = null;
	}

	function requestDelete(event: MouseEvent, id: string, count: number) {
		if (confirmingDelete !== id) {
			event.preventDefault();
			confirmingDelete = id;
			return;
		}

		// A group with bookmarks needs somewhere to put them.
		if (count > 0 && !moveTo[id]) {
			event.preventDefault();
		}
	}
</script>

<svelte:head>
	<title>Settings | Custom Dash</title>
</svelte:head>

{#snippet swatchGrid(id: string, current: string)}
	<div
		class="absolute left-0 top-full z-30 mt-2 w-64 border border-[color-mix(in_srgb,var(--theme-accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_40%,var(--theme-bg))] p-3 shadow-[0_20px_60px_-20px_color-mix(in_srgb,var(--theme-bg)_90%,transparent)] backdrop-blur"
		transition:fade={{ duration: 100 }}
	>
		<p class="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--theme-fg)_55%,transparent)]">
			Theme colors
		</p>

		<div class="mt-2 grid grid-cols-7 gap-1.5">
			{#each SWATCHES as swatch (swatch)}
				<button
					type="button"
					onclick={() => pick(id, swatch)}
					aria-label={swatch.replace('--theme-', '')}
					style={`background: var(${swatch}, var(--theme-accent))`}
					class={`h-6 w-6 border transition hover:scale-110 ${
						current === swatch
							? 'border-[var(--theme-fg)]'
							: 'border-[color-mix(in_srgb,var(--theme-fg)_20%,transparent)]'
					}`}
				></button>
			{/each}
		</div>

		<div class="mt-3 flex items-center gap-2">
			<input
				type="color"
				value={current.startsWith('#') ? current : '#b48ead'}
				oninput={(event) => pick(id, event.currentTarget.value)}
				aria-label="Custom color"
				class="h-8 w-12 shrink-0 cursor-pointer border border-[color-mix(in_srgb,var(--theme-fg)_20%,transparent)] bg-transparent"
			/>
			<button
				type="button"
				onclick={() => pick(id, '')}
				class="flex-1 border border-[color-mix(in_srgb,var(--theme-fg)_16%,transparent)] px-2 py-1.5 text-xs transition hover:border-[var(--theme-accent)]"
			>
				Auto
			</button>
		</div>
	</div>
{/snippet}

{#snippet colorButton(id: string, color: string, index: number)}
	<div class="relative shrink-0">
		<button
			type="button"
			onclick={() => (openPicker = openPicker === id ? null : id)}
			aria-label="Choose color"
			class="flex items-center gap-2 border border-[color-mix(in_srgb,var(--theme-fg)_16%,transparent)] px-2 py-2 transition hover:border-[var(--theme-accent)]"
		>
			<span
				class="h-4 w-4 border border-[color-mix(in_srgb,var(--theme-fg)_25%,transparent)]"
				style={`background: ${cssColor(color, index)}`}
			></span>
			<span class="text-[10px] text-[color-mix(in_srgb,var(--theme-fg)_50%,transparent)]">
				{color ? (color.startsWith('#') ? color : color.replace('--theme-', '')) : 'auto'}
			</span>
		</button>

		{#if openPicker === id}
			{@render swatchGrid(id, color)}
		{/if}
	</div>
{/snippet}

<main class="mx-auto min-h-dvh w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
	<header>
		<p class="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--theme-accent)]">
			Configuration
		</p>
		<h1 class="mt-2 text-4xl font-semibold text-[var(--theme-fg)] md:text-5xl">Settings</h1>
		<p class="mt-2 text-sm leading-6 text-[color-mix(in_srgb,var(--theme-fg)_60%,transparent)]">
			Bookmark groups, their colors, and where their bookmarks go when a group is removed.
		</p>
	</header>

	{#if form?.message}
		<p
			class="mt-5 border border-[color-mix(in_srgb,var(--theme-danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--theme-danger)_14%,transparent)] px-4 py-3 text-sm text-[var(--theme-fg)]"
			transition:fade={{ duration: 120 }}
		>
			{form.message}
		</p>
	{/if}

	<section class="mt-8">
		<div class="flex items-center gap-3">
			<h2 class="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--theme-accent)]">
				Groups
			</h2>
			<span class="text-xs text-[color-mix(in_srgb,var(--theme-fg)_42%,transparent)]">
				{data.groups.length}
			</span>
			<div class="h-px flex-1 bg-linear-to-r from-[color-mix(in_srgb,var(--theme-accent)_45%,transparent)] to-transparent"></div>
		</div>

		<form
			method="POST"
			action="?/create"
			class="mt-4 flex flex-col gap-2 border border-[color-mix(in_srgb,var(--theme-fg)_11%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_62%,transparent)] p-3 backdrop-blur sm:flex-row sm:items-center"
			use:enhance={() =>
				async ({ result, update }) => {
					await update();
					if (result.type === 'success') {
						newName = '';
						newColor = '';
					}
				}}
		>
			{@render colorButton('new', newColor, data.groups.length)}
			<input type="hidden" name="color" value={newColor} />

			<input
				name="name"
				required
				bind:value={newName}
				placeholder="New group name"
				class="min-w-0 flex-1 border border-[color-mix(in_srgb,var(--theme-fg)_14%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_55%,transparent)] px-3 py-2 text-sm outline-none transition placeholder:text-[color-mix(in_srgb,var(--theme-fg)_32%,transparent)] focus:border-[var(--theme-accent)]"
			/>

			<button
				type="submit"
				class="shrink-0 border border-[color-mix(in_srgb,var(--theme-accent)_60%,transparent)] bg-[var(--theme-accent)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] transition hover:-translate-y-px"
			>
				＋ Add group
			</button>
		</form>

		{#if data.groups.length > 0}
			<ul
				class="mt-3 border border-[color-mix(in_srgb,var(--theme-fg)_11%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_62%,transparent)] backdrop-blur"
			>
				{#each data.groups as group, index (group.id)}
					{@const draft = drafts[group.id] ?? { name: group.name, color: group.color }}
					<li
						style={`--cat: ${cssColor(draft.color, index)}`}
						class="group/row relative border-b border-[color-mix(in_srgb,var(--theme-fg)_9%,transparent)] pl-3 transition last:border-b-0 hover:bg-[color-mix(in_srgb,var(--theme-fg)_4%,transparent)]"
						in:fade={{ duration: 150 }}
					>
						<div class="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-[var(--cat)]"></div>

						<div class="flex items-center gap-1.5 pr-2">
							<form
								method="POST"
								action="?/update"
								use:enhance
								class="flex min-w-0 flex-1 items-center gap-1.5"
							>
								<input type="hidden" name="id" value={group.id} />
								<input type="hidden" name="color" value={draft.color} />

								{@render colorButton(group.id, draft.color, index)}

								<input
									name="name"
									required
									bind:value={draft.name}
									aria-label="Group name"
									class="min-w-0 flex-1 border border-transparent bg-transparent px-1.5 py-2 text-sm font-medium outline-none transition focus:border-[color-mix(in_srgb,var(--theme-accent)_60%,transparent)] focus:bg-[color-mix(in_srgb,var(--theme-panel)_55%,transparent)]"
								/>

								<span
									class="shrink-0 px-1 text-xs tabular-nums text-[color-mix(in_srgb,var(--theme-fg)_40%,transparent)]"
									title={`${group.count} bookmarks`}
								>
									{group.count}
								</span>

								{#if dirty(group.id)}
									<button
										type="submit"
										transition:fade={{ duration: 100 }}
										class="shrink-0 border border-[color-mix(in_srgb,var(--theme-accent)_60%,transparent)] bg-[var(--theme-accent)] px-2.5 py-1 text-xs font-semibold text-[var(--theme-bg)] transition"
									>
										Save
									</button>
								{/if}
							</form>

							<form method="POST" action="?/delete" use:enhance class="flex items-center gap-1.5">
								<input type="hidden" name="id" value={group.id} />

								{#if confirmingDelete === group.id && group.count > 0}
									<select
										name="moveTo"
										bind:value={moveTo[group.id]}
										aria-label={`Move ${group.count} bookmarks to`}
										class="border border-[color-mix(in_srgb,var(--theme-fg)_14%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_55%,transparent)] px-1.5 py-1 text-xs outline-none focus:border-[var(--theme-accent)]"
									>
										<option value="" disabled selected>Move {group.count} to…</option>
										{#each otherGroups(group.id) as target (target.id)}
											<option value={target.id}>{target.name}</option>
										{/each}
									</select>
								{/if}

								<button
									type="submit"
									onclick={(event) => requestDelete(event, group.id, group.count)}
									title={group.count > 0 ? 'Move its bookmarks, then remove' : 'Remove empty group'}
									class={`shrink-0 border px-2.5 py-1 text-xs transition ${
										confirmingDelete === group.id
											? 'border-[var(--theme-danger)] bg-[color-mix(in_srgb,var(--theme-danger)_22%,transparent)] text-[var(--theme-fg)]'
											: 'border-transparent text-[color-mix(in_srgb,var(--theme-danger)_75%,transparent)] opacity-0 hover:border-[color-mix(in_srgb,var(--theme-danger)_40%,transparent)] focus:opacity-100 group-hover/row:opacity-100'
									}`}
								>
									{confirmingDelete === group.id ? 'Confirm' : 'Delete'}
								</button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="mt-6 text-center text-sm text-[color-mix(in_srgb,var(--theme-fg)_60%,transparent)]">
				No groups yet. Add one above, or create a bookmark and its group appears here.
			</p>
		{/if}
	</section>
</main>
