// WCAG relative-luminance contrast, plus a nudge that lightens or darkens a
// colour just enough to clear a target ratio against a background. Used when a
// theme is composed (src/lib/server/theme-core.ts) so an imported palette with a
// muddy accent or foreground still renders readable text and buttons.

/** @param {string} hex @returns {[number, number, number] | null} */
function toRgb(hex) {
	const m = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());

	if (!m) {
		return null;
	}

	let s = m[1];

	if (s.length === 3 || s.length === 4) {
		s = s
			.split('')
			.map((c) => c + c)
			.join('');
	}

	return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

/** @param {[number, number, number]} rgb */
function toHex([r, g, b]) {
	return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

/** @param {number} c 0-255 */
function channel(c) {
	const v = c / 255;
	return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/**
 * WCAG relative luminance, 0 (black) to 1 (white).
 * @param {string} hex
 * @returns {number}
 */
export function luminance(hex) {
	const rgb = toRgb(hex);

	if (!rgb) {
		return 0;
	}

	return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

/**
 * WCAG contrast ratio between two colours, 1 (identical) to 21 (black on white).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function contrastRatio(a, b) {
	const la = luminance(a);
	const lb = luminance(b);
	const hi = Math.max(la, lb);
	const lo = Math.min(la, lb);
	return (hi + 0.05) / (lo + 0.05);
}

/** @param {[number,number,number]} a @param {[number,number,number]} b @param {number} t */
function mix(a, b, t) {
	return /** @type {[number,number,number]} */ (a.map((v, i) => v + (b[i] - v) * t));
}

/**
 * Whichever of white / black reads best on `background`.
 * @param {string} background
 * @returns {string}
 */
export function bestTextOn(background) {
	return contrastRatio('#ffffff', background) >= contrastRatio('#000000', background)
		? '#ffffff'
		: '#000000';
}

/**
 * Return `color` unchanged if it already clears `min` contrast against
 * `background`; otherwise blend it toward white or black (whichever raises the
 * ratio) by the smallest amount that reaches `min`. Hue is preserved for small
 * corrections and washes out only when a colour is very close to the background.
 *
 * @param {string} color
 * @param {string} background
 * @param {number} [min]
 * @returns {string}
 */
export function ensureReadable(color, background, min = 4.5) {
	const rgb = toRgb(color);
	const bg = toRgb(background);

	if (!rgb || !bg) {
		return color;
	}

	if (contrastRatio(color, background) >= min) {
		return color;
	}

	// Move away from the background's luminance: toward white if `color` is the
	// lighter of the two (or they are level and the background is dark), else
	// toward black.
	const towardWhite =
		luminance(color) > luminance(background) ||
		(luminance(color) === luminance(background) && luminance(background) < 0.5);
	const pole = /** @type {[number,number,number]} */ (towardWhite ? [255, 255, 255] : [0, 0, 0]);

	let lo = 0;
	let hi = 1;

	for (let i = 0; i < 24; i += 1) {
		const t = (lo + hi) / 2;

		if (contrastRatio(toHex(mix(rgb, pole, t)), background) >= min) {
			hi = t;
		} else {
			lo = t;
		}
	}

	return toHex(mix(rgb, pole, hi));
}
