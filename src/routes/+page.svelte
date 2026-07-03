<script lang="ts">
	let { data }: { data: import('./$types').PageData } = $props();

	const swatches = [
		'color0',
		'color1',
		'color2',
		'color3',
		'color4',
		'color5',
		'color6',
		'color7',
		'color8',
		'color9',
		'color10',
		'color11',
		'color12',
		'color13',
		'color14',
		'color15'
	] as const;
</script>

<main class="mx-auto flex min-h-dvh w-full max-w-7xl flex-col justify-between px-6 py-8 md:px-10">
	<section class="grid flex-1 items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
		<div class="max-w-3xl">
			<p class="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--theme-accent)]">
				Omarchy dashboard
			</p>
			<h1 class="text-5xl font-semibold leading-[0.98] text-balance md:text-7xl">
				System-native control surface for {data.theme.name}
			</h1>
			<p class="mt-6 max-w-2xl text-lg leading-8 text-[color-mix(in_srgb,var(--theme-fg)_72%,transparent)]">
				The app is initialized with SvelteKit, Svelte 5 runes mode, Tailwind CSS, and a
				server-side Omarchy color pipeline that turns the active theme into CSS variables.
			</p>
		</div>

		<aside
			class="border border-[color-mix(in_srgb,var(--theme-accent)_38%,transparent)] bg-[color-mix(in_srgb,var(--theme-panel)_74%,transparent)] p-5 shadow-2xl shadow-[color-mix(in_srgb,var(--theme-bg)_72%,transparent)] backdrop-blur"
		>
			<div class="flex items-start justify-between gap-4">
				<div>
					<p class="text-sm text-[color-mix(in_srgb,var(--theme-fg)_62%,transparent)]">
						Active theme
					</p>
					<h2 class="mt-1 text-2xl font-semibold capitalize">{data.theme.name}</h2>
				</div>
				<div class="h-11 w-11 bg-[var(--theme-accent)] shadow-lg shadow-[color-mix(in_srgb,var(--theme-accent)_30%,transparent)]"></div>
			</div>

			<div class="mt-6 grid grid-cols-8 gap-2">
				{#each swatches as swatch}
					<div
						class="aspect-square border border-[color-mix(in_srgb,var(--theme-fg)_10%,transparent)]"
						style={`background: var(--theme-${swatch})`}
						title={`${swatch}: ${data.theme.colors[swatch]}`}
					></div>
				{/each}
			</div>

			<dl class="mt-6 grid gap-3 text-sm">
				<div class="flex justify-between gap-4 border-t border-[color-mix(in_srgb,var(--theme-fg)_10%,transparent)] pt-3">
					<dt class="text-[color-mix(in_srgb,var(--theme-fg)_62%,transparent)]">Source</dt>
					<dd class="truncate text-right">{data.theme.source ?? 'not found'}</dd>
				</div>
				<div class="flex justify-between gap-4 border-t border-[color-mix(in_srgb,var(--theme-fg)_10%,transparent)] pt-3">
					<dt class="text-[color-mix(in_srgb,var(--theme-fg)_62%,transparent)]">Accent</dt>
					<dd>{data.theme.colors.accent}</dd>
				</div>
				<div class="flex justify-between gap-4 border-t border-[color-mix(in_srgb,var(--theme-fg)_10%,transparent)] pt-3">
					<dt class="text-[color-mix(in_srgb,var(--theme-fg)_62%,transparent)]">Border</dt>
					<dd>{data.theme.colors.border ?? 'not set'}</dd>
				</div>
				<div class="flex justify-between gap-4 border-t border-[color-mix(in_srgb,var(--theme-fg)_10%,transparent)] pt-3">
					<dt class="text-[color-mix(in_srgb,var(--theme-fg)_62%,transparent)]">Effects</dt>
					<dd class="text-right">
						{data.theme.settings.blur ?? 'no blur'} / {data.theme.settings.opacity ?? 'no opacity'} /
						{data.theme.settings.gap ?? data.theme.settings.gapInner ?? 'no gaps'}
					</dd>
				</div>
			</dl>
		</aside>
	</section>
</main>
