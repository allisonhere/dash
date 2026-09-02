export const CONTAINER_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

/**
 * @param {string | null} currentKey
 * @param {string} selectedKey
 * @returns {string | null}
 */
export function nextExpandedService(currentKey, selectedKey) {
	return currentKey === selectedKey ? null : selectedKey;
}

/**
 * @param {{ state?: string } | null | undefined} container
 * @returns {Array<'open' | 'logs' | 'stop' | 'restart' | 'start' | 'more'>}
 */
export function containerActions(container) {
	const running = container?.state === 'running';
	return running ? ['open', 'logs', 'stop', 'restart', 'more'] : ['logs', 'start', 'more'];
}

/**
 * @param {unknown} host
 * @param {unknown} name
 * @param {unknown} lines
 * @returns {{ ok: false, error: string } | { ok: true, host: string, name: string, lines: number }}
 */
export function validateContainerLogRequest(host, name, lines = 50) {
	const normalizedHost = typeof host === 'string' ? host.trim() : '';
	const normalizedName = typeof name === 'string' ? name.trim() : '';
	const requestedLines = Number(lines);

	if (!normalizedHost) {
		return { ok: false, error: 'Unknown host.' };
	}

	if (!CONTAINER_NAME_RE.test(normalizedName)) {
		return { ok: false, error: 'Invalid container name.' };
	}

	return {
		ok: true,
		host: normalizedHost,
		name: normalizedName,
		lines: Number.isFinite(requestedLines) ? Math.min(500, Math.max(1, Math.round(requestedLines))) : 50
	};
}

/**
 * @param {unknown} target
 * @returns {string}
 */
export function dockerHostAddress(target) {
	const value = String(target ?? '').trim();

	if (!value || value === 'local') {
		return '';
	}

	const withoutUser = value.includes('@') ? value.split('@').pop() : value;
	return (withoutUser ?? '').replace(/:\d+$/, '');
}

/**
 * @param {Array<{ hostPort?: string, privatePort?: string }>} ports
 * @returns {{ hostPort?: string, privatePort?: string } | null}
 */
export function firstPublishedPort(ports = []) {
	for (const port of ports) {
		if (port?.hostPort) {
			return port;
		}
	}

	return null;
}

/**
 * @param {{ name?: string, target?: string } | null | undefined} host
 * @param {{ labels?: Record<string, string>, ports?: Array<{ hostPort?: string, privatePort?: string }> } | null | undefined} container
 * @param {string} browserHost
 * @returns {string}
 */
export function serviceOpenUrl(host, container, browserHost = '') {
	const labels = container?.labels ?? {};
	const labeledUrl =
		labels['dash.url'] ||
		labels['homepage.href'] ||
		labels['homepage.url'];

	if (labeledUrl && /^https?:\/\//i.test(labeledUrl)) {
		return labeledUrl;
	}

	const port = firstPublishedPort(container?.ports);

	if (!port) {
		return '';
	}

	const targetHost = dockerHostAddress(host?.target) || browserHost || host?.name || 'localhost';
	return `http://${targetHost}:${port.hostPort}/`;
}
