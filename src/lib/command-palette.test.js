import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	buildNavigationCommands,
	buildServiceCommands,
	rankCommands
} from './command-palette.js';

describe('command palette helpers', () => {
	it('builds page and bookmark commands', () => {
		const commands = buildNavigationCommands({
			bookmarks: [
				{
					id: 'jellyfin',
					title: 'Jellyfin',
					url: 'http://192.168.86.66:8096/',
					category: 'Media'
				}
			]
		});

		assert.ok(commands.some((command) => command.id === 'page:homelab'));
		assert.deepEqual(
			commands.find((command) => command.id === 'bookmark:jellyfin'),
			{
				id: 'bookmark:jellyfin',
				title: 'Jellyfin',
				subtitle: 'Media · 192.168.86.66',
				kind: 'bookmark',
				url: 'http://192.168.86.66:8096/',
				keywords: ['Media', 'http://192.168.86.66:8096/']
			}
		);
	});

	it('builds service commands with guarded actions based on state', () => {
		const commands = buildServiceCommands(
			{
				dockerHosts: [
					{
						name: 'services',
						target: 'local',
						containers: [
							{ name: 'jellyfin', state: 'running', image: 'jellyfin/jellyfin', composeProject: 'media' },
							{ name: 'ntopng', state: 'exited', image: 'ntop/ntopng', composeProject: 'ntopng' }
						]
					}
				]
			},
			(_host, container) =>
				/** @type {{ name?: string }} */ (container).name === 'jellyfin' ? 'http://jarvis:8096/' : ''
		);

		assert.ok(commands.some((command) => command.id === 'service-open:docker:services/jellyfin'));
		assert.equal(commands.find((command) => command.id === 'docker-restart:docker:services/jellyfin')?.danger, true);
		assert.equal(commands.find((command) => command.id === 'docker-stop:docker:services/jellyfin')?.danger, true);
		assert.ok(commands.some((command) => command.id === 'docker-start:docker:services/ntopng'));
	});

	it('ranks exact, substring, and fuzzy command matches', () => {
		const commands = buildNavigationCommands({
			bookmarks: [
				{ id: 'jf', title: 'Jellyfin', url: 'http://jellyfin.test', category: 'Media' },
				{ id: 'gh', title: 'GitHub', url: 'https://github.com', category: 'Dev' }
			]
		});

		assert.equal(rankCommands(commands, 'jelly')[0].id, 'bookmark:jf');
		assert.equal(rankCommands(commands, 'hm')[0].id, 'page:homelab');
		assert.equal(rankCommands(commands, 'dev')[0].id, 'bookmark:gh');
		assert.deepEqual(rankCommands(commands, 'zzzz'), []);
	});
});
