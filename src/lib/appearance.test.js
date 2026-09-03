import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	clampBackgroundBlur,
	clampRadius,
	clampSurfaceOpacity,
	DEFAULT_APPEARANCE
} from './appearance.ts';

describe('appearance clamps', () => {
	it('keeps the radius inside 2..32', () => {
		assert.equal(clampRadius(0), 2);
		assert.equal(clampRadius(999), 32);
		assert.equal(clampRadius('14'), 14);
		assert.equal(clampRadius('nope'), DEFAULT_APPEARANCE.radius);
	});

	it('keeps surface opacity inside 40..100', () => {
		assert.equal(clampSurfaceOpacity(10), 40);
		assert.equal(clampSurfaceOpacity(250), 100);
		assert.equal(clampSurfaceOpacity('72'), 72);
		assert.equal(clampSurfaceOpacity(undefined), DEFAULT_APPEARANCE.surfaceOpacity);
		assert.equal(clampSurfaceOpacity(71.6), 72);
	});

	it('keeps background blur inside 0..24', () => {
		assert.equal(clampBackgroundBlur(-5), 0);
		assert.equal(clampBackgroundBlur(40), 24);
		assert.equal(clampBackgroundBlur('8'), 8);
		assert.equal(clampBackgroundBlur(null), DEFAULT_APPEARANCE.backgroundBlur);
	});
});
