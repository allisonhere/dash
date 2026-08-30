import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	classifyError,
	classifyStatus,
	isCheckableUrl,
	sortBySeverity,
	summarize
} from './link-check.js';

/**
 * @param {string} id
 * @param {import('./link-check.js').LinkState} state
 * @param {string} [title]
 */
const result = (id, state, title = id) => ({
	id,
	title,
	url: `https://${id}.example`,
	category: 'Apps',
	state,
	status: 0,
	detail: '',
	finalUrl: ''
});

describe('isCheckableUrl', () => {
	it('accepts http and https links', () => {
		assert.equal(isCheckableUrl('https://example.com'), true);
		assert.equal(isCheckableUrl('http://10.0.0.4:8080/app'), true);
	});

	it('rejects other schemes and malformed URLs', () => {
		assert.equal(isCheckableUrl('mailto:someone@example.com'), false);
		assert.equal(isCheckableUrl('not a url'), false);
	});
});

describe('classifyStatus', () => {
	it('treats a 2xx without a redirect as ok', () => {
		assert.deepEqual(classifyStatus(200), { state: 'ok', detail: 'HTTP 200' });
	});

	it('reports where a link ended up when it redirected', () => {
		const classified = classifyStatus(200, 'https://example.com/new');

		assert.equal(classified.state, 'redirect');
		assert.match(classified.detail, /https:\/\/example\.com\/new/);
	});

	it('separates bot-blocking responses from real breakage', () => {
		assert.equal(classifyStatus(403).state, 'blocked');
		assert.equal(classifyStatus(429).state, 'blocked');
		assert.equal(classifyStatus(404).state, 'broken');
		assert.equal(classifyStatus(500).state, 'broken');
	});
});

describe('classifyError', () => {
	it('maps a nested undici cause code to a readable reason', () => {
		const error = new Error('fetch failed', { cause: Object.assign(new Error('dns'), { code: 'ENOTFOUND' }) });

		assert.deepEqual(classifyError(error), { state: 'unreachable', detail: 'Host not found' });
	});

	it('recognises aborts as timeouts', () => {
		assert.equal(classifyError(new Error('This operation was aborted')).detail, 'Timed out');
	});

	it('falls back to the error message', () => {
		assert.deepEqual(classifyError(new Error('socket hang up')), {
			state: 'unreachable',
			detail: 'socket hang up'
		});
	});
});

describe('summarize', () => {
	it('counts each state and totals only the real problems', () => {
		const summary = summarize([
			result('a', 'ok'),
			result('b', 'ok'),
			result('c', 'blocked'),
			result('d', 'broken'),
			result('e', 'unreachable'),
			result('f', 'skipped')
		]);

		assert.equal(summary.total, 6);
		assert.equal(summary.ok, 2);
		assert.equal(summary.blocked, 1);
		assert.equal(summary.problems, 2);
	});
});

describe('sortBySeverity', () => {
	it('puts broken links first and healthy ones last', () => {
		const sorted = sortBySeverity([
			result('a', 'ok'),
			result('b', 'blocked'),
			result('c', 'broken'),
			result('d', 'unreachable')
		]);

		assert.deepEqual(
			sorted.map((entry) => entry.id),
			['c', 'd', 'b', 'a']
		);
	});

	it('sorts alphabetically within one state', () => {
		const sorted = sortBySeverity([result('b', 'broken', 'Beta'), result('a', 'broken', 'Alpha')]);

		assert.deepEqual(
			sorted.map((entry) => entry.title),
			['Alpha', 'Beta']
		);
	});
});
