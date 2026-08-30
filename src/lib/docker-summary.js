/**
 * @typedef {object} DockerContainerSummaryInput
 * @property {string} state
 * @property {string} status
 * @property {number} cpu
 * @property {number} memUsed
 * @property {number} memLimit
 */

/**
 * @typedef {object} DockerHostSummaryInput
 * @property {{ memUsed: number, memTotal: number, diskUsed?: number, diskTotal?: number } | null} host
 * @property {DockerContainerSummaryInput[]} containers
 */

/**
 * @typedef {object} DockerHostSummary
 * @property {number} runningCount
 * @property {number} stoppedCount
 * @property {number} unhealthyCount
 * @property {number} containerCpuTotal
 * @property {number} containerMemUsed
 * @property {number} containerMemLimit
 * @property {number} containerMemPercent
 * @property {number} hostMemPercent
 * @property {number} hostDiskPercent
 */

/**
 * @param {DockerHostSummaryInput} host
 * @returns {DockerHostSummary}
 */
export function summarizeDockerHost(host) {
	const running = host.containers.filter((container) => container.state === 'running');
	const containerMemUsed = running.reduce((total, container) => total + positiveNumber(container.memUsed), 0);
	const containerMemLimit = running.reduce((total, container) => total + positiveNumber(container.memLimit), 0);

	return {
		runningCount: running.length,
		stoppedCount: host.containers.length - running.length,
		unhealthyCount: host.containers.filter((container) => /\(unhealthy\)/i.test(container.status)).length,
		containerCpuTotal: running.reduce((total, container) => total + positiveNumber(container.cpu), 0),
		containerMemUsed,
		containerMemLimit,
		containerMemPercent: percent(containerMemUsed, containerMemLimit),
		hostMemPercent: percent(host.host?.memUsed ?? 0, host.host?.memTotal ?? 0),
		hostDiskPercent: percent(host.host?.diskUsed ?? 0, host.host?.diskTotal ?? 0)
	};
}

/**
 * @param {number} used
 * @param {number} total
 */
function percent(used, total) {
	return total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
}

/**
 * @param {number} value
 */
function positiveNumber(value) {
	return Number.isFinite(value) && value > 0 ? value : 0;
}
