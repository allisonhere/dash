import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	containerActions,
	nextExpandedService,
	serviceOpenUrl,
	validateContainerLogRequest
} from './service-inspector.js';

describe('service inspector helpers', () => {
	it('keeps services collapsed by default and toggles one expanded key', () => {
		assert.equal(nextExpandedService(null, 'docker:services/jellyfin'), 'docker:services/jellyfin');
		assert.equal(
			nextExpandedService('docker:services/jellyfin', 'docker:services/jellyfin'),
			null
		);
		assert.equal(
			nextExpandedService('docker:services/jellyfin', 'docker:services/immich'),
			'docker:services/immich'
		);
	});

	it('does not collapse an expanded service when live data changes under the same key', () => {
		const expanded = nextExpandedService(null, 'docker:services/jellyfin');
		const updatedContainer = { name: 'jellyfin', state: 'running', cpu: 9.1 };

		assert.equal(expanded, `docker:services/${updatedContainer.name}`);
	});

	it('shows the correct primary actions for running and stopped containers', () => {
		assert.deepEqual(containerActions({ state: 'running' }), ['open', 'logs', 'stop', 'restart', 'more']);
		assert.deepEqual(containerActions({ state: 'exited' }), ['logs', 'start', 'more']);
	});

	it('validates container log identifiers and clamps requested lines', () => {
		assert.deepEqual(validateContainerLogRequest('services', 'jellyfin', 1000), {
			ok: true,
			host: 'services',
			name: 'jellyfin',
			lines: 500
		});

		assert.equal(validateContainerLogRequest('services', '../jellyfin', 50).ok, false);
		assert.equal(validateContainerLogRequest('', 'jellyfin', 50).ok, false);
	});

	it('derives an open URL from labels or published ports when available', () => {
		assert.equal(
			serviceOpenUrl({}, { labels: { 'dash.url': 'https://jellyfin.example.test' }, ports: [] }),
			'https://jellyfin.example.test'
		);

		assert.equal(
			serviceOpenUrl(
				{ name: 'services', target: 'allie@192.168.86.74' },
				{ labels: {}, ports: [{ hostPort: '8096', privatePort: '8096/tcp' }] }
			),
			'http://192.168.86.74:8096/'
		);
	});
});
