import type { Handle } from '@sveltejs/kit';
import { resolveTheme } from '$lib/server/theme-selection';

// The theme is applied on a div inside <body>, and the background is painted by
// a child of that div — both of which need the stylesheet to have loaded. Until
// then the browser paints its default white canvas, which shows as a flash on a
// cold container where the CSS is a separate request.
//
// Injecting the resolved theme onto <html> puts a background in the very first
// bytes of the document, so the first paint is already themed.
export const handle: Handle = async ({ event, resolve }) => {
	return resolve(event, {
		transformPageChunk: ({ html }) =>
			html.replace('%dash.theme%', () => {
				const { theme } = resolveTheme();
				return `${theme.cssText}; color-scheme: ${theme.mode}; background: var(--theme-bg); color: var(--theme-fg)`;
			})
	});
};
