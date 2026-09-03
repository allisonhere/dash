import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bestTextOn, contrastRatio, ensureReadable, luminance } from './contrast.js';

describe('contrast ratio', () => {
	it('is 21 for black on white and 1 for a colour on itself', () => {
		assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21);
		assert.equal(contrastRatio('#3a7bd5', '#3a7bd5'), 1);
	});

	it('is order independent and tolerates shorthand / alpha hex', () => {
		assert.equal(contrastRatio('#000', '#fff'), contrastRatio('#ffffff', '#000000'));
		assert.equal(Math.round(contrastRatio('#000000ff', '#ffffffff')), 21);
	});

	it('treats an unparseable colour as black rather than throwing', () => {
		assert.equal(luminance('rebeccapurple'), 0);
	});
});

describe('bestTextOn', () => {
	it('picks black on light backgrounds and white on dark', () => {
		assert.equal(bestTextOn('#faf4ed'), '#000000');
		assert.equal(bestTextOn('#1c1213'), '#ffffff');
	});
});

describe('ensureReadable', () => {
	it('leaves a colour that already meets the target untouched', () => {
		// gruvbox accent on gruvbox bg is ~6.9:1
		assert.equal(ensureReadable('#fe8019', '#282828', 4.5), '#fe8019');
	});

	it('lightens a muddy accent on a near-black background until it clears the bar', () => {
		// Caroline Skyline: accent #684c59 on #1c1213 is only ~2.4:1
		const fixed = ensureReadable('#684c59', '#1c1213', 3);
		assert.ok(contrastRatio('#684c59', '#1c1213') < 3);
		assert.ok(contrastRatio(fixed, '#1c1213') >= 3);
		// it moved lighter, not to a totally different hue
		assert.ok(luminance(fixed) > luminance('#684c59'));
	});

	it('darkens a colour that is too light against a light background', () => {
		const fixed = ensureReadable('#e0d0d8', '#faf4ed', 4.5);
		assert.ok(contrastRatio(fixed, '#faf4ed') >= 4.5);
		assert.ok(luminance(fixed) < luminance('#e0d0d8'));
	});

	it('falls back to a pole colour when the target is unreachable any other way', () => {
		// nothing beats 4.5:1 against mid-grey except going near-black/near-white
		const fixed = ensureReadable('#808080', '#7f7f7f', 4.5);
		assert.ok(contrastRatio(fixed, '#7f7f7f') >= 4.5 - 0.5);
	});
});
