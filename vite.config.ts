import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// adapter-node builds a standalone Node server (`node build`) so dash can
			// run as a long-lived service on each machine. See docs/deploy.md.
			adapter: adapter(),

			// LAN-only dashboard reached by several names (IP, hostname, caddy). A
			// single pinned ORIGIN would 403 form edits from the other names, so we
			// trust all origins. Safe here: trusted network, no auth/secrets mutated
			// beyond local dashboard data. Restrict this if it's ever exposed publicly.
			csrf: { trustedOrigins: ['*'] }
		})
	]
});
