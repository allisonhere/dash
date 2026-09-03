<script lang="ts">
	import { enhance } from '$app/forms';
	import { cssColor, SWATCHES } from '$lib/group-color';
	import { RADIUS_PRESETS } from '$lib/appearance';
	import { sortBySeverity, summarize } from '$lib/link-check.js';
	import { fade } from 'svelte/transition';
	import { tick, untrack } from 'svelte';

	let { data, form }: { data: import('./$types').PageData; form: import('./$types').ActionData } =
		$props();

	type Draft = { name: string; color: string };

	// Each check outcome gets a label, a theme color, and whether it counts as a
	// problem worth showing when the healthy links are hidden.
	const STATE_STYLE = {
		broken: { label: 'Broken', color: 'var(--theme-danger)', problem: true },
		unreachable: { label: 'Unreachable', color: 'var(--theme-danger)', problem: true },
		blocked: { label: 'Blocked', color: 'var(--theme-warning)', problem: true },
		redirect: { label: 'Redirect', color: 'var(--theme-info)', problem: true },
		skipped: { label: 'Skipped', color: 'color-mix(in srgb, var(--theme-fg) 45%, transparent)', problem: false },
		ok: { label: 'OK', color: 'var(--theme-success)', problem: false }
	} as const;

	let drafts = $state<Record<string, Draft>>({});
	let openPicker = $state<string | null>(null);
	let confirmingDelete = $state<string | null>(null);
	let moveTo = $state<Record<string, string>>({});

	type LinkResult = import('$lib/link-check.js').LinkResult;

	let source: EventSource | null = null;
	let checking = $state(false);
	let checked = $state(0);
	let checkTotal = $state(0);
	let checkError = $state('');
	let showHealthy = $state(false);
	let results = $state<LinkResult[]>([]);

	const summary = $derived(summarize(results));
	const sorted = $derived(sortBySeverity(results));
	const problems = $derived(sorted.filter((result) => STATE_STYLE[result.state].problem));
	const visible = $derived(showHealthy ? sorted : problems);
	const progress = $derived(checkTotal > 0 ? Math.round((checked / checkTotal) * 100) : 0);

	function runLinkCheck() {
		stopLinkCheck();

		results = [];
		checked = 0;
		checkTotal = 0;
		checkError = '';
		checking = true;

		source = new EventSource('/settings/link-check');

		source.addEventListener('start', (event) => {
			checkTotal = JSON.parse((event as MessageEvent).data).total;

			if (checkTotal === 0) {
				stopLinkCheck();
			}
		});

		source.addEventListener('result', (event) => {
			const payload = JSON.parse((event as MessageEvent).data);
			results = [...results, payload.result];
			checked = payload.done;
		});

		source.addEventListener('done', () => stopLinkCheck());

		source.addEventListener('failed', (event) => {
			checkError = JSON.parse((event as MessageEvent).data).message;
			stopLinkCheck();
		});

		// A dropped connection ends the run rather than letting EventSource retry,
		// which would restart the whole sweep from the beginning.
		source.onerror = () => {
			if (checking) {
				checkError = results.length ? '' : 'The link check connection was lost.';
			}

			stopLinkCheck();
		};
	}

	function stopLinkCheck() {
		source?.close();
		source = null;
		checking = false;
	}

	$effect(() => () => stopLinkCheck());

	// Corner rounding previews locally the moment it changes, then the form saves
	// it and the layout picks up the new value from the server.
	let corners = $state<'sharp' | 'round'>(untrack(() => data.appearance.corners));
	let radius = $state(untrack(() => data.appearance.radius));
	let surfaceOpacity = $state(untrack(() => data.appearance.surfaceOpacity));
	let backgroundBlur = $state(untrack(() => data.appearance.backgroundBlur));
	let appearanceForm = $state<HTMLFormElement | null>(null);

	$effect(() => {
		corners = data.appearance.corners;
		radius = data.appearance.radius;
		surfaceOpacity = data.appearance.surfaceOpacity;
		backgroundBlur = data.appearance.backgroundBlur;
	});

	// The form posts the hidden inputs, which Svelte only updates once the
	// current change has flushed to the DOM — submitting in the same tick would
	// save the previous values and snap the control straight back.
	async function saveAppearance() {
		await tick();
		appearanceForm?.requestSubmit();
	}

	let newName = $state('');
	let newColor = $state('');
	let selectedBackupName = $state('');
	let restoring = $state(false);

	let themeUrl = $state('');
	let themeNameOverride = $state('');
	let importingTheme = $state(false);
	let confirmingThemeDelete = $state<string | null>(null);
	let themeLabelDrafts = $state<Record<string, string>>({});

	// Keep the rename drafts in step with the server list; leave a row alone
	// while it holds an unsaved edit of its own.
	$effect(() => {
		const themes = data.themes;

		untrack(() => {
			themeLabelDrafts = Object.fromEntries(
				themes
					.filter((theme) => theme.kind === 'custom')
					.map((theme) => {
						const draft = themeLabelDrafts[theme.slug];
						return [theme.slug, draft != null && draft !== theme.label ? draft : theme.label];
					})
			);
		});
	});

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
			Manage bookmark groups and keep a portable copy of your Dash data.
		</p>
	</header>

	{#if form?.message}
		<p
			class={`mt-5 border px-4 py-3 text-sm text-[var(--theme-fg)] ${
				form.ok
					? 'border-[color-mix(in_srgb,var(--theme-success)_45%,transparent)] bg-[color-mix(in_srgb,var(--theme-success)_14%,transparent)]'
					: 'border-[color-mix(in_srgb,var(--theme-danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--theme-danger)_14%,transparent)]'
			}`}
			transition:fade={{ duration: 120 }}
			role="status"
		>
			{form.message}
		</p>
	{/if}

	<section class="mt-8">
		<div class="flex items-center gap-3">
			<h2 class="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--theme-accent)]">
				Appearance
			</h2>
			<div class="h-px flex-1 bg-linear-to-r from-[color-mix(in_srgb,var(--theme-accent)_45%,transparent)] to-transparent"></div>
		</div>

		<form
			method="POST"
			action="?/appearance"
			bind:this={appearanceForm}
			use:enhance
			class="mt-4 grid gap-5 border border-[color-mix(in_srgb,var(--theme-fg)_11%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_62%,transparent)] p-5 backdrop-blur md:grid-cols-[1.2fr_0.8fr] md:items-start"
		>
			<input type="hidden" name="corners" value={corners} />
			<input type="hidden" name="radius" value={radius} />
			<input type="hidden" name="surfaceOpacity" value={surfaceOpacity} />
			<input type="hidden" name="backgroundBlur" value={backgroundBlur} />

			<div>
				<h3 class="text-base font-semibold text-[var(--theme-fg)]">Card corners</h3>
				<p class="mt-2 text-sm leading-6 text-[color-mix(in_srgb,var(--theme-fg)_58%,transparent)]">
					Sharp keeps the default hard-edged look. Round softens cards, panels, and controls
					across every page on this dash.
				</p>

				<div class="mt-4 flex gap-2">
					{#each [{ value: 'sharp', label: 'Sharp' }, { value: 'round', label: 'Round' }] as option (option.value)}
						<button
							type="button"
							aria-pressed={corners === option.value}
							onclick={() => {
								corners = option.value as 'sharp' | 'round';
								saveAppearance();
							}}
							class={`flex-1 border px-4 py-2 text-sm font-semibold transition hover:-translate-y-px ${
								corners === option.value
									? 'border-[color-mix(in_srgb,var(--theme-accent)_60%,transparent)] bg-[var(--theme-accent)] text-[var(--theme-bg)]'
									: 'border-[color-mix(in_srgb,var(--theme-fg)_16%,transparent)] text-[var(--theme-fg)] hover:border-[var(--theme-accent)]'
							}`}
						>
							{option.label}
						</button>
					{/each}
				</div>

				<div class={`mt-5 transition ${corners === 'round' ? '' : 'pointer-events-none opacity-40'}`}>
					<div class="flex items-baseline justify-between">
						<span class="text-xs font-medium text-[color-mix(in_srgb,var(--theme-fg)_72%,transparent)]">
							Radius
						</span>
						<span class="text-xs tabular-nums text-[color-mix(in_srgb,var(--theme-fg)_50%,transparent)]">
							{radius}px
						</span>
					</div>

					<input
						type="range"
						min="2"
						max="32"
						step="1"
						aria-label="Corner radius"
						disabled={corners !== 'round'}
						bind:value={radius}
						onchange={saveAppearance}
						class="mt-2 w-full accent-[var(--theme-accent)]"
					/>

					<div class="mt-3 flex flex-wrap gap-1.5">
						{#each RADIUS_PRESETS as preset (preset.value)}
							<button
								type="button"
								disabled={corners !== 'round'}
								aria-pressed={radius === preset.value}
								onclick={() => {
									radius = preset.value;
									saveAppearance();
								}}
								class={`border px-2.5 py-1 text-xs transition ${
									radius === preset.value
										? 'border-[var(--theme-accent)] text-[var(--theme-accent)]'
										: 'border-[color-mix(in_srgb,var(--theme-fg)_16%,transparent)] text-[color-mix(in_srgb,var(--theme-fg)_62%,transparent)] hover:border-[var(--theme-accent)]'
								}`}
							>
								{preset.label}
							</button>
						{/each}
					</div>
				</div>
			</div>

			<div
				data-corners={corners}
				style={`--dash-radius: ${radius}px`}
				class="grid gap-2"
			>
				<span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--theme-fg)_50%,transparent)]">
					Preview
				</span>
				<div
					class="border border-[color-mix(in_srgb,var(--theme-fg)_14%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_70%,transparent)] p-4"
				>
					<span class="block h-2 w-16 bg-[var(--theme-accent)]"></span>
					<p class="mt-3 text-sm font-medium text-[var(--theme-fg)]">Sample card</p>
					<p class="mt-1 text-xs text-[color-mix(in_srgb,var(--theme-fg)_55%,transparent)]">
						Bookmarks, feeds, and homelab tiles follow this shape.
					</p>
					<button
						type="button"
						tabindex="-1"
						class="mt-3 border border-[color-mix(in_srgb,var(--theme-accent)_60%,transparent)] bg-[var(--theme-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--theme-bg)]"
					>
						Button
					</button>
				</div>
			</div>

			<div class="border-t border-[color-mix(in_srgb,var(--theme-fg)_10%,transparent)] pt-5 md:col-span-2">
				<h3 class="text-base font-semibold text-[var(--theme-fg)]">Surfaces</h3>
				<p class="mt-2 text-sm leading-6 text-[color-mix(in_srgb,var(--theme-fg)_58%,transparent)]">
					How solid panels sit over the background. Below 100% the theme background image —
					or the page colour — shows through; blur frosts what shows through when a theme
					has a background.
				</p>

				<div class="mt-4 grid gap-5 sm:grid-cols-2">
					<div>
						<div class="flex items-baseline justify-between">
							<span class="text-xs font-medium text-[color-mix(in_srgb,var(--theme-fg)_72%,transparent)]">
								Surface opacity
							</span>
							<span class="text-xs tabular-nums text-[color-mix(in_srgb,var(--theme-fg)_50%,transparent)]">
								{surfaceOpacity}%
							</span>
						</div>
						<input
							type="range"
							min="40"
							max="100"
							step="1"
							aria-label="Surface opacity"
							bind:value={surfaceOpacity}
							onchange={saveAppearance}
							class="mt-2 w-full accent-[var(--theme-accent)]"
						/>
					</div>

					<div>
						<div class="flex items-baseline justify-between">
							<span class="text-xs font-medium text-[color-mix(in_srgb,var(--theme-fg)_72%,transparent)]">
								Background blur
							</span>
							<span class="text-xs tabular-nums text-[color-mix(in_srgb,var(--theme-fg)_50%,transparent)]">
								{backgroundBlur}px
							</span>
						</div>
						<input
							type="range"
							min="0"
							max="24"
							step="1"
							aria-label="Background blur"
							bind:value={backgroundBlur}
							onchange={saveAppearance}
							class="mt-2 w-full accent-[var(--theme-accent)]"
						/>
					</div>
				</div>
			</div>
		</form>
	</section>

	<section class="mt-12">
		<div class="flex items-center gap-3">
			<h2 class="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--theme-accent)]">
				Themes
			</h2>
			<span class="text-xs text-[color-mix(in_srgb,var(--theme-fg)_42%,transparent)]">
				{data.themes.length}
			</span>
			<div class="h-px flex-1 bg-linear-to-r from-[color-mix(in_srgb,var(--theme-accent)_45%,transparent)] to-transparent"></div>
		</div>

		<form
			method="POST"
			action="?/themeImport"
			class="mt-4 flex flex-col gap-2 border border-[color-mix(in_srgb,var(--theme-fg)_11%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_62%,transparent)] p-3 backdrop-blur"
			use:enhance={() => {
				importingTheme = true;
				return async ({ result, update }) => {
					await update();
					importingTheme = false;
					if (result.type === 'success') {
						themeUrl = '';
						themeNameOverride = '';
					}
				};
			}}
		>
			<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
				<input
					name="url"
					required
					bind:value={themeUrl}
					placeholder="Theme git URL, e.g. https://github.com/user/omarchy-theme"
					class="min-w-0 flex-1 border border-[color-mix(in_srgb,var(--theme-fg)_14%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_55%,transparent)] px-3 py-2 text-sm outline-none transition placeholder:text-[color-mix(in_srgb,var(--theme-fg)_32%,transparent)] focus:border-[var(--theme-accent)]"
				/>
				<input
					name="name"
					bind:value={themeNameOverride}
					placeholder="Name (optional)"
					class="border border-[color-mix(in_srgb,var(--theme-fg)_14%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_55%,transparent)] px-3 py-2 text-sm outline-none transition placeholder:text-[color-mix(in_srgb,var(--theme-fg)_32%,transparent)] focus:border-[var(--theme-accent)] sm:w-40"
				/>
				<button
					type="submit"
					disabled={importingTheme}
					class="shrink-0 border border-[color-mix(in_srgb,var(--theme-accent)_60%,transparent)] bg-[var(--theme-accent)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] transition hover:-translate-y-px disabled:opacity-60"
				>
					{importingTheme ? 'Cloning…' : 'Import theme'}
				</button>
			</div>
			<p class="text-xs leading-5 text-[color-mix(in_srgb,var(--theme-fg)_50%,transparent)]">
				Clones the repository and converts its <code>colors.toml</code> / <code>alacritty.toml</code>
				(and <code>walker.css</code> / <code>hyprland.conf</code> if present) into a Dash theme. The
				imported theme is applied straight away and stored on this instance.
			</p>
		</form>

		<ul
			class="mt-3 border border-[color-mix(in_srgb,var(--theme-fg)_11%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_62%,transparent)] backdrop-blur"
		>
			{#each data.themes as theme (theme.slug)}
				{@const active = data.activeTheme === theme.slug}
				<li
					class="group/theme relative border-b border-[color-mix(in_srgb,var(--theme-fg)_9%,transparent)] transition last:border-b-0 hover:bg-[color-mix(in_srgb,var(--theme-fg)_4%,transparent)]"
					in:fade={{ duration: 150 }}
				>
					<div class="flex flex-wrap items-center gap-1.5 px-3 py-2">
						<span
							class="shrink-0 border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide {theme.kind ===
							'custom'
								? 'border-[color-mix(in_srgb,var(--theme-accent)_45%,transparent)] text-[var(--theme-accent)]'
								: 'border-[color-mix(in_srgb,var(--theme-fg)_18%,transparent)] text-[color-mix(in_srgb,var(--theme-fg)_55%,transparent)]'}"
						>
							{theme.kind === 'custom' ? 'Imported' : 'Built-in'}
						</span>

						{#if theme.kind === 'custom'}
							<form
								method="POST"
								action="?/themeRename"
								use:enhance
								class="flex min-w-0 flex-1 items-center gap-1.5"
							>
								<input type="hidden" name="id" value={theme.id} />
								<input
									name="label"
									required
									bind:value={themeLabelDrafts[theme.slug]}
									aria-label="Theme name"
									class="min-w-0 flex-1 border border-transparent bg-transparent px-1.5 py-1.5 text-sm font-medium outline-none transition focus:border-[color-mix(in_srgb,var(--theme-accent)_60%,transparent)] focus:bg-[color-mix(in_srgb,var(--theme-panel)_55%,transparent)]"
								/>
								{#if (themeLabelDrafts[theme.slug] ?? theme.label).trim() !== theme.label}
									<button
										type="submit"
										transition:fade={{ duration: 100 }}
										class="shrink-0 border border-[color-mix(in_srgb,var(--theme-accent)_60%,transparent)] bg-[var(--theme-accent)] px-2.5 py-1 text-xs font-semibold text-[var(--theme-bg)]"
									>
										Save
									</button>
								{/if}
							</form>
						{:else}
							<span class="min-w-0 flex-1 px-1.5 py-1.5 text-sm font-medium text-[var(--theme-fg)]">
								{theme.label}
							</span>
						{/if}

						{#if active}
							<span
								class="shrink-0 border border-[color-mix(in_srgb,var(--theme-success)_50%,transparent)] px-2 py-1 text-[11px] font-semibold text-[var(--theme-success)]"
							>
								Active
							</span>
						{:else}
							<form method="POST" action="?/themeActivate" use:enhance class="shrink-0">
								<input type="hidden" name="slug" value={theme.slug} />
								<button
									type="submit"
									class="border border-[color-mix(in_srgb,var(--theme-fg)_16%,transparent)] px-2.5 py-1 text-xs transition hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent)]"
								>
									Use
								</button>
							</form>
						{/if}

						{#if theme.kind === 'custom'}
							<form method="POST" action="?/themeDelete" use:enhance class="shrink-0">
								<input type="hidden" name="id" value={theme.id} />
								<button
									type="submit"
									onclick={(event) => {
										if (confirmingThemeDelete !== theme.slug) {
											event.preventDefault();
											confirmingThemeDelete = theme.slug;
										}
									}}
									class={`border px-2.5 py-1 text-xs transition ${
										confirmingThemeDelete === theme.slug
											? 'border-[var(--theme-danger)] bg-[color-mix(in_srgb,var(--theme-danger)_22%,transparent)] text-[var(--theme-fg)]'
											: 'border-transparent text-[color-mix(in_srgb,var(--theme-danger)_75%,transparent)] opacity-0 hover:border-[color-mix(in_srgb,var(--theme-danger)_40%,transparent)] focus:opacity-100 group-hover/theme:opacity-100'
									}`}
								>
									{confirmingThemeDelete === theme.slug ? 'Confirm' : 'Delete'}
								</button>
							</form>
						{/if}
					</div>

					<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 pb-2.5">
						{#if theme.hasBackground}
							<img
								src={`/theme/background?slug=${theme.slug}&v=${theme.backgroundVersion ?? 0}`}
								alt=""
								class="h-8 w-14 shrink-0 border border-[color-mix(in_srgb,var(--theme-fg)_18%,transparent)] object-cover"
							/>
						{/if}

						<form
							method="POST"
							action="?/themeBackgroundUpload"
							enctype="multipart/form-data"
							use:enhance
							class="flex min-w-0 items-center gap-2"
						>
							<input type="hidden" name="slug" value={theme.slug} />
							<label
								class="cursor-pointer border border-[color-mix(in_srgb,var(--theme-fg)_16%,transparent)] px-2 py-1 text-[11px] transition hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent)]"
							>
								{theme.hasBackground ? 'Replace background' : 'Set background'}
								<input
									type="file"
									name="image"
									accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
									class="sr-only"
									onchange={(event) => event.currentTarget.form?.requestSubmit()}
								/>
							</label>
						</form>

						{#if theme.hasBackground}
							<form method="POST" action="?/themeBackgroundClear" use:enhance>
								<input type="hidden" name="slug" value={theme.slug} />
								<button
									type="submit"
									class="text-[11px] text-[color-mix(in_srgb,var(--theme-danger)_75%,transparent)] underline-offset-2 transition hover:text-[var(--theme-danger)] hover:underline"
								>
									Remove background
								</button>
							</form>
						{/if}

						{#if theme.kind === 'custom' && theme.source}
							<span class="min-w-0 flex-1 truncate text-right text-[11px] text-[color-mix(in_srgb,var(--theme-fg)_38%,transparent)]">
								{theme.source}
							</span>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	</section>

	<section class="mt-12">
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

	<section class="mt-12">
		<div class="flex items-center gap-3">
			<h2 class="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--theme-accent)]">
				Link check
			</h2>
			{#if summary.total > 0}
				<span class="text-xs text-[color-mix(in_srgb,var(--theme-fg)_42%,transparent)]">
					{summary.total}
				</span>
			{/if}
			<div class="h-px flex-1 bg-linear-to-r from-[color-mix(in_srgb,var(--theme-accent)_45%,transparent)] to-transparent"></div>
		</div>

		<div
			class="mt-4 border border-[color-mix(in_srgb,var(--theme-fg)_11%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_62%,transparent)] backdrop-blur"
		>
			<div class="flex flex-wrap items-center gap-3 p-5">
				<div class="min-w-0 flex-1">
					<h3 class="text-base font-semibold text-[var(--theme-fg)]">Verify bookmark links</h3>
					<p class="mt-2 text-sm leading-6 text-[color-mix(in_srgb,var(--theme-fg)_58%,transparent)]">
						Requests every bookmark and reports the ones that are dead, unreachable, or have moved.
						LAN hosts are checked without TLS verification.
					</p>
				</div>

				<button
					type="button"
					onclick={checking ? stopLinkCheck : runLinkCheck}
					class={`shrink-0 border px-4 py-2 text-sm font-semibold transition hover:-translate-y-px active:translate-y-px ${
						checking
							? 'border-[color-mix(in_srgb,var(--theme-danger)_55%,transparent)] text-[var(--theme-fg)]'
							: 'border-[color-mix(in_srgb,var(--theme-accent)_60%,transparent)] bg-[var(--theme-accent)] text-[var(--theme-bg)]'
					}`}
				>
					{checking ? 'Stop' : summary.total > 0 ? 'Check again' : 'Check links'}
				</button>
			</div>

			{#if checking || summary.total > 0}
				<div
					class="border-t border-[color-mix(in_srgb,var(--theme-fg)_10%,transparent)] px-5 py-4"
					transition:fade={{ duration: 120 }}
				>
					<div class="flex items-center gap-3">
						<div
							class="h-1.5 flex-1 overflow-hidden bg-[color-mix(in_srgb,var(--theme-fg)_10%,transparent)]"
						>
							<div
								class="h-full bg-[var(--theme-accent)] transition-[width] duration-300"
								style={`width: ${progress}%`}
							></div>
						</div>
						<span class="shrink-0 text-xs tabular-nums text-[color-mix(in_srgb,var(--theme-fg)_55%,transparent)]">
							{checked}/{checkTotal || summary.total}
						</span>
					</div>

					<div class="mt-3 flex flex-wrap items-center gap-2">
						{#each Object.entries(STATE_STYLE) as [state, style] (state)}
							{@const count = summary[state as keyof typeof summary]}
							{#if count > 0}
								<span
									class="flex items-center gap-1.5 border border-[color-mix(in_srgb,var(--theme-fg)_12%,transparent)] px-2 py-1 text-[11px] text-[color-mix(in_srgb,var(--theme-fg)_75%,transparent)]"
									transition:fade={{ duration: 120 }}
								>
									<span class="h-2 w-2" style={`background: ${style.color}`}></span>
									{count}
									{style.label}
								</span>
							{/if}
						{/each}

						{#if summary.ok + summary.skipped > 0}
							<button
								type="button"
								onclick={() => (showHealthy = !showHealthy)}
								class="ml-auto text-[11px] text-[color-mix(in_srgb,var(--theme-fg)_55%,transparent)] underline-offset-4 transition hover:text-[var(--theme-accent)] hover:underline"
							>
								{showHealthy ? 'Hide healthy links' : 'Show all links'}
							</button>
						{/if}
					</div>
				</div>
			{/if}

			{#if checkError}
				<p
					class="border-t border-[color-mix(in_srgb,var(--theme-danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--theme-danger)_12%,transparent)] px-5 py-3 text-sm text-[var(--theme-fg)]"
					role="status"
				>
					{checkError}
				</p>
			{/if}

			{#if visible.length > 0}
				<ul class="border-t border-[color-mix(in_srgb,var(--theme-fg)_10%,transparent)]">
					{#each visible as result (result.id)}
						<li
							style={`--state: ${STATE_STYLE[result.state].color}`}
							class="relative border-b border-[color-mix(in_srgb,var(--theme-fg)_9%,transparent)] py-2.5 pl-5 pr-4 transition last:border-b-0 hover:bg-[color-mix(in_srgb,var(--theme-fg)_4%,transparent)]"
							in:fade={{ duration: 150 }}
						>
							<div class="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-[var(--state)]"></div>

							<div class="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
								<a
									href={result.url}
									target="_blank"
									rel="noreferrer"
									class="text-sm font-medium text-[var(--theme-fg)] underline-offset-4 transition hover:text-[var(--theme-accent)] hover:underline"
								>
									{result.title}
								</a>
								<span class="text-[11px] text-[color-mix(in_srgb,var(--theme-fg)_40%,transparent)]">
									{result.category}
								</span>
								<span class="ml-auto text-[11px] font-semibold text-[var(--state)]">
									{STATE_STYLE[result.state].label}
								</span>
							</div>

							<p class="mt-0.5 truncate text-[11px] text-[color-mix(in_srgb,var(--theme-fg)_45%,transparent)]">
								{result.detail} · {result.url}
							</p>
						</li>
					{/each}
				</ul>
			{:else if !checking && summary.total > 0}
				<p
					class="border-t border-[color-mix(in_srgb,var(--theme-fg)_10%,transparent)] px-5 py-4 text-sm text-[color-mix(in_srgb,var(--theme-fg)_60%,transparent)]"
				>
					Every bookmark answered. Nothing to fix.
				</p>
			{/if}
		</div>
	</section>

	<section class="mt-12">
		<div class="flex items-center gap-3">
			<h2 class="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--theme-accent)]">
				Backup and restore
			</h2>
			<div class="h-px flex-1 bg-linear-to-r from-[color-mix(in_srgb,var(--theme-accent)_45%,transparent)] to-transparent"></div>
		</div>

		<div
			class="mt-4 grid border border-[color-mix(in_srgb,var(--theme-fg)_11%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_62%,transparent)] backdrop-blur md:grid-cols-[0.85fr_1.15fr]"
		>
			<div class="p-5 md:border-r md:border-[color-mix(in_srgb,var(--theme-fg)_10%,transparent)]">
				<h3 class="text-base font-semibold text-[var(--theme-fg)]">Download backup</h3>
				<p class="mt-2 text-sm leading-6 text-[color-mix(in_srgb,var(--theme-fg)_58%,transparent)]">
					Save bookmarks, feeds, groups, and the selected theme as one JSON file. Homelab credentials are excluded.
				</p>
				<a
					href="/settings/backup"
					download
					class="mt-4 inline-flex border border-[color-mix(in_srgb,var(--theme-accent)_60%,transparent)] bg-[var(--theme-accent)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] transition hover:-translate-y-px active:translate-y-px"
				>
					Download backup
				</a>
			</div>

			<form
				method="POST"
				action="?/restore"
				enctype="multipart/form-data"
				class="border-t border-[color-mix(in_srgb,var(--theme-fg)_10%,transparent)] p-5 md:border-t-0"
				use:enhance={() => {
					restoring = true;
					return async ({ update }) => {
						await update();
						restoring = false;
					};
				}}
			>
				<h3 class="text-base font-semibold text-[var(--theme-fg)]">Restore backup</h3>
				<p class="mt-2 text-sm leading-6 text-[color-mix(in_srgb,var(--theme-fg)_58%,transparent)]">
					The file is fully checked before it replaces current data. The restore limit is 2 MB.
				</p>

				<label class="mt-4 block">
					<span class="mb-2 block text-xs font-medium text-[color-mix(in_srgb,var(--theme-fg)_72%,transparent)]">
						Dash backup file
					</span>
					<input
						type="file"
						name="backup"
						accept=".json,application/json"
						required
						onchange={(event) =>
							(selectedBackupName = event.currentTarget.files?.[0]?.name ?? '')}
						class="block w-full border border-[color-mix(in_srgb,var(--theme-fg)_14%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_55%,transparent)] text-xs text-[color-mix(in_srgb,var(--theme-fg)_60%,transparent)] outline-none file:mr-3 file:border-0 file:border-r file:border-[color-mix(in_srgb,var(--theme-fg)_14%,transparent)] file:bg-[color-mix(in_srgb,var(--theme-fg)_7%,transparent)] file:px-3 file:py-2.5 file:text-xs file:font-semibold file:text-[var(--theme-fg)] focus:border-[var(--theme-accent)]"
					/>
				</label>

				<label class="mt-3 flex items-start gap-2 text-xs leading-5 text-[color-mix(in_srgb,var(--theme-fg)_66%,transparent)]">
					<input
						type="checkbox"
						name="confirm"
						value="replace"
						required
						class="mt-1 accent-[var(--theme-accent)]"
					/>
					<span>I understand this replaces the current bookmarks, feeds, groups, and theme selection.</span>
				</label>

				<button
					type="submit"
					disabled={restoring || !selectedBackupName}
					class="mt-4 border border-[color-mix(in_srgb,var(--theme-danger)_55%,transparent)] px-4 py-2 text-sm font-semibold text-[var(--theme-fg)] transition hover:bg-[color-mix(in_srgb,var(--theme-danger)_16%,transparent)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
				>
					{restoring ? 'Restoring…' : 'Restore data'}
				</button>
			</form>
		</div>
	</section>
</main>
