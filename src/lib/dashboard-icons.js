const DASHBOARD_ICON_BASE = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg';

/**
 * @typedef {Object} BookmarkIconSource
 * @property {string} title
 * @property {string} url
 * @property {string} icon
 */

/** @type {Map<string, string>} */
const HOST_ALIASES = new Map([
	['homeassistant', 'home-assistant'],
	['ha', 'home-assistant'],
	['plex', 'plex'],
	['jellyfin', 'jellyfin'],
	['emby', 'emby'],
	['proxmox', 'proxmox'],
	['portainer', 'portainer'],
	['grafana', 'grafana'],
	['prometheus', 'prometheus'],
	['adguard', 'adguard-home'],
	['pihole', 'pi-hole'],
	['pi-hole', 'pi-hole'],
	['sonarr', 'sonarr'],
	['radarr', 'radarr'],
	['lidarr', 'lidarr'],
	['readarr', 'readarr'],
	['bazarr', 'bazarr'],
	['prowlarr', 'prowlarr'],
	['qbittorrent', 'qbittorrent'],
	['transmission', 'transmission'],
	['sabnzbd', 'sabnzbd'],
	['nzbget', 'nzbget'],
	['overseerr', 'overseerr'],
	['tautulli', 'tautulli'],
	['nextcloud', 'nextcloud'],
	['immich', 'immich'],
	['paperless', 'paperless-ngx'],
	['paperlessngx', 'paperless-ngx'],
	['vaultwarden', 'vaultwarden'],
	['bitwarden', 'bitwarden'],
	['gitea', 'gitea'],
	['forgejo', 'forgejo'],
	['gitlab', 'gitlab'],
	['github', 'github-light'],
	['youtube', 'youtube'],
	['twitch', 'twitch'],
	['pluto', 'pluto-tv'],
	['plutotv', 'pluto-tv'],
	['hass', 'home-assistant']
]);

/** @param {string} url */
export function hostOf(url) {
	try {
		return new URL(url).hostname;
	} catch {
		return '';
	}
}

/** @param {BookmarkIconSource} bookmark */
export function iconCandidatesForBookmark(bookmark) {
	const host = hostOf(bookmark.url);
	/** @type {string[]} */
	const candidates = [];

	for (const slug of dashboardIconSlugs(bookmark.title, host, bookmark.icon)) {
		candidates.push(`${DASHBOARD_ICON_BASE}/${slug}.svg`);
	}

	if (host && !isLocalHost(host)) {
		candidates.push(`https://icons.duckduckgo.com/ip3/${host}.ico`);
	}

	return dedupe(candidates);
}

/**
 * @param {string} title
 * @param {string} host
 * @param {string} fallbackIcon
 */
function dashboardIconSlugs(title, host, fallbackIcon) {
	const explicit = explicitDashboardIconSlug(fallbackIcon);
	const titleSlug = slugify(title);
	const hostParts = host.split('.').filter(Boolean);
	const hostSlug = slugify(hostParts[0] ?? '');
	const domainSlug = slugify(publicDomainName(host));

	return dedupe([
		explicit,
		aliasFor(titleSlug),
		titleSlug,
		aliasFor(hostSlug),
		hostSlug,
		aliasFor(domainSlug),
		domainSlug
	]).filter(Boolean);
}

/** @param {string} icon */
function explicitDashboardIconSlug(icon) {
	if (typeof icon !== 'string') {
		return '';
	}

	const trimmed = icon.trim();
	return trimmed.startsWith('di:') ? slugify(trimmed.slice(3)) : '';
}

/** @param {string} slug */
function aliasFor(slug) {
	return HOST_ALIASES.get(slug) ?? '';
}

/** @param {string} host */
function publicDomainName(host) {
	if (!host || isLocalHost(host)) {
		return '';
	}

	const parts = host.split('.').filter(Boolean);
	return parts.length > 1 ? parts.at(-2) ?? '' : parts[0] ?? '';
}

/** @param {string} host */
function isLocalHost(host) {
	return (
		!host.includes('.') ||
		/^[\d.]+$/.test(host) ||
		/\.(local|lan|home|internal)$/.test(host)
	);
}

/** @param {unknown} value */
function slugify(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/** @param {Array<string | undefined>} values */
function dedupe(values) {
	const seen = new Set();
	/** @type {string[]} */
	const next = [];

	for (const value of values) {
		if (!value || seen.has(value)) {
			continue;
		}

		seen.add(value);
		next.push(value);
	}

	return next;
}
