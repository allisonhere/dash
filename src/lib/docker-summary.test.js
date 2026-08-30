import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { summarizeDockerHost } from './docker-summary.js';

const baseContainer = {
	state: 'running',
	status: 'Up 5 minutes',
	cpu: 0,
	memUsed: 0,
	memLimit: 0
};

describe('summarizeDockerHost', () => {
	it('counts running, stopped, and unhealthy containers', () => {
		const summary = summarizeDockerHost({
			host: null,
			containers: [
				{ ...baseContainer, state: 'running', status: 'Up 1 hour (healthy)' },
				{ ...baseContainer, state: 'running', status: 'Up 1 hour (unhealthy)' },
				{ ...baseContainer, state: 'exited', status: 'Exited (0) 2 days ago' }
			]
		});

		assert.equal(summary.runningCount, 2);
		assert.equal(summary.stoppedCount, 1);
		assert.equal(summary.unhealthyCount, 1);
	});

	it('aggregates running container CPU and memory only', () => {
		const summary = summarizeDockerHost({
			host: null,
			containers: [
				{ ...baseContainer, state: 'running', cpu: 12.4, memUsed: 256, memLimit: 1024 },
				{ ...baseContainer, state: 'running', cpu: 8.6, memUsed: 128, memLimit: 1024 },
				{ ...baseContainer, state: 'exited', cpu: 90, memUsed: 512, memLimit: 1024 }
			]
		});

		assert.equal(summary.containerCpuTotal, 21);
		assert.equal(summary.containerMemUsed, 384);
		assert.equal(summary.containerMemLimit, 2048);
		assert.equal(summary.containerMemPercent, 19);
	});

	it('calculates host memory and disk percent while safely handling missing limits', () => {
		const summary = summarizeDockerHost({
			host: { memUsed: 75, memTotal: 100, diskUsed: 40, diskTotal: 80 },
			containers: [{ ...baseContainer, state: 'running', memUsed: 50, memLimit: 0 }]
		});

		assert.equal(summary.hostMemPercent, 75);
		assert.equal(summary.hostDiskPercent, 50);
		assert.equal(summary.containerMemPercent, 0);
	});
});
