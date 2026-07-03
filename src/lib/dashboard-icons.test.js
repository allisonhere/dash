import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hostOf, iconCandidatesForBookmark } from './dashboard-icons.js';

describe('dashboard icon resolver', () => {
	it('prefers Dashboard Icons for local services', () => {
		const candidates = iconCandidatesForBookmark({
			title: 'Home Assistant',
			url: 'http://192.168.86.74:8123',
			icon: '🏠'
		});

		assert.equal(
			candidates[0],
			'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/home-assistant.svg'
		);
		assert.ok(candidates.every((candidate) => !candidate.includes('duckduckgo.com')));
	});

	it('falls back to public host favicons after Dashboard Icons candidates', () => {
		const candidates = iconCandidatesForBookmark({
			title: 'GitHub',
			url: 'https://github.com/homarr-labs/dashboard-icons',
			icon: '↗'
		});

		assert.equal(
			candidates[0],
			'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/github-light.svg'
		);
		assert.equal(candidates.at(-1), 'https://icons.duckduckgo.com/ip3/github.com.ico');
	});

	it('supports explicit Dashboard Icons slugs in the fallback icon field', () => {
		const candidates = iconCandidatesForBookmark({
			title: 'Media',
			url: 'http://media.lan',
			icon: 'di:jellyfin'
		});

		assert.equal(
			candidates[0],
			'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/jellyfin.svg'
		);
	});

	it('uses the light Cockpit icon for explicit Cockpit slugs', () => {
		const candidates = iconCandidatesForBookmark({
			title: 'Cockpit',
			url: 'https://jarvis:9090/system',
			icon: 'di:cockpit'
		});

		assert.equal(
			candidates[0],
			'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/cockpit-light.svg'
		);
	});

	it('extracts hosts from valid urls', () => {
		assert.equal(hostOf('https://example.com/path'), 'example.com');
		assert.equal(hostOf('not a url'), '');
	});
});
