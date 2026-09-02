/**
 * @typedef {object} PaletteCommand
 * @property {string} id
 * @property {string} title
 * @property {string} subtitle
 * @property {'navigate' | 'bookmark' | 'service-open' | 'service-inspect' | 'service-logs' | 'docker-control'} kind
 * @property {string=} href
 * @property {string=} url
 * @property {string=} host
 * @property {string=} name
 * @property {'start' | 'stop' | 'restart'=} action
 * @property {boolean=} danger
 * @property {string[]=} keywords
 */

/** @type {PaletteCommand[]} */
const PAGE_COMMANDS = [
	{ id: 'page:bookmarks', title: 'Open Bookmarks', subtitle: 'Quick launch', kind: 'navigate', href: '/bookmarks', keywords: [] },
	{ id: 'page:news', title: 'Open News', subtitle: 'Feeds and articles', kind: 'navigate', href: '/news', keywords: [] },
	{ id: 'page:homelab', title: 'Open Homelab', subtitle: 'Infrastructure status', kind: 'navigate', href: '/homelab', keywords: [] },
	{ id: 'page:settings', title: 'Open Settings', subtitle: 'Dash configuration', kind: 'navigate', href: '/settings', keywords: [] }
];

/**
 * @param {{ bookmarks?: Array<{ id: string, title: string, url: string, category: string }> }} input
 * @returns {PaletteCommand[]}
 */
export function buildNavigationCommands(input = {}) {
	return [
		...PAGE_COMMANDS,
		...(input.bookmarks ?? []).map((bookmark) => ({
			id: `bookmark:${bookmark.id}`,
			title: bookmark.title,
			subtitle: `${bookmark.category} · ${hostOf(bookmark.url) || bookmark.url}`,
			kind: /** @type {const} */ ('bookmark'),
			url: bookmark.url,
			keywords: [bookmark.category, bookmark.url]
		}))
	];
}

/**
 * @param {{ dockerHosts?: Array<{ name: string, target: string, containers: Array<object> }> }} input
 * @param {(host: object, container: object) => string} openUrlFor
 * @returns {PaletteCommand[]}
 */
export function buildServiceCommands(input = {}, openUrlFor = () => '') {
	/** @type {PaletteCommand[]} */
	const commands = [];

	for (const host of input.dockerHosts ?? []) {
		for (const container of host.containers ?? []) {
			const service = /** @type {{ name?: string, state?: string, image?: string, composeProject?: string }} */ (container);
			const name = service.name ?? '';

			if (!name) {
				continue;
			}

			const key = `docker:${host.name}/${name}`;
			const subtitle = service.composeProject
				? `${host.name} · ${service.composeProject}`
				: `${host.name} · ${service.image ?? 'Docker'}`;
			const keywords = [host.name, service.image ?? '', service.composeProject ?? ''];
			const url = openUrlFor(host, container);

			if (url) {
				commands.push({
					id: `service-open:${key}`,
					title: `Open ${name}`,
					subtitle,
					kind: /** @type {const} */ ('service-open'),
					url,
					host: host.name,
					name,
					keywords
				});
			}

			commands.push(
				{
					id: `service-inspect:${key}`,
					title: `Inspect ${name}`,
					subtitle,
					kind: /** @type {const} */ ('service-inspect'),
					href: `/homelab?inspect=${encodeURIComponent(key)}`,
					host: host.name,
					name,
					keywords
				},
				{
					id: `service-logs:${key}`,
					title: `View ${name} logs`,
					subtitle,
					kind: /** @type {const} */ ('service-logs'),
					href: `/homelab?inspect=${encodeURIComponent(key)}&logs=1`,
					host: host.name,
					name,
					keywords
				}
			);

			if (service.state === 'running') {
				commands.push(
					{
						id: `docker-restart:${key}`,
						title: `Restart ${name}`,
						subtitle,
						kind: /** @type {const} */ ('docker-control'),
						host: host.name,
						name,
						action: 'restart',
						danger: true,
						keywords
					},
					{
						id: `docker-stop:${key}`,
						title: `Stop ${name}`,
						subtitle,
						kind: /** @type {const} */ ('docker-control'),
						host: host.name,
						name,
						action: 'stop',
						danger: true,
						keywords
					}
				);
			} else {
				commands.push({
					id: `docker-start:${key}`,
					title: `Start ${name}`,
					subtitle,
					kind: /** @type {const} */ ('docker-control'),
					host: host.name,
					name,
					action: 'start',
					keywords
				});
			}
		}
	}

	return commands;
}

/**
 * @param {PaletteCommand[]} commands
 * @param {string} query
 * @param {number} limit
 * @returns {Array<PaletteCommand & { score: number }>}
 */
export function rankCommands(commands, query, limit = 12) {
	const normalized = normalize(query);

	return commands
		.map((command, index) => ({ command, score: scoreCommand(command, normalized), index }))
		.filter((entry) => entry.score > 0)
		.sort((left, right) => right.score - left.score || left.index - right.index)
		.slice(0, limit)
		.map((entry) => ({ ...entry.command, score: entry.score }));
}

/**
 * @param {PaletteCommand} command
 * @param {string} normalizedQuery
 */
export function scoreCommand(command, normalizedQuery) {
	if (!normalizedQuery) {
		return 1;
	}

	const haystacks = [command.title, command.subtitle, ...(command.keywords ?? [])].map(normalize);
	let best = 0;

	for (const haystack of haystacks) {
		best = Math.max(best, scoreText(haystack, normalizedQuery));
	}

	return best;
}

/**
 * @param {string} text
 * @param {string} query
 */
function scoreText(text, query) {
	if (!text || !query) {
		return query ? 0 : 1;
	}

	if (text === query) {
		return 1000;
	}

	if (text.startsWith(query)) {
		return 800 - text.length * 0.2;
	}

	const index = text.indexOf(query);

	if (index >= 0) {
		return 600 - index * 2 - text.length * 0.1;
	}

	let score = 0;
	let lastIndex = -1;
	let streak = 0;

	for (const char of query) {
		const nextIndex = text.indexOf(char, lastIndex + 1);

		if (nextIndex === -1) {
			return 0;
		}

		streak = nextIndex === lastIndex + 1 ? streak + 1 : 1;
		score += 18 + streak * 8;

		if (nextIndex === 0 || /[\s:/._-]/.test(text[nextIndex - 1] ?? '')) {
			score += 12;
		}

		score -= Math.max(0, nextIndex - lastIndex - 1);
		lastIndex = nextIndex;
	}

	return score;
}

/**
 * @param {unknown} value
 */
function normalize(value) {
	return String(value ?? '').trim().toLowerCase();
}

/**
 * @param {string} rawUrl
 */
function hostOf(rawUrl) {
	try {
		return new URL(rawUrl).hostname;
	} catch {
		return '';
	}
}
