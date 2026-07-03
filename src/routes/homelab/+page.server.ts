import { clearHomelabCache, loadHomelab } from '$lib/server/homelab';

export const load = async ({ depends }: { depends: (dep: string) => void }) => {
	depends('homelab:status');
	return loadHomelab();
};

export const actions = {
	refresh: async () => {
		clearHomelabCache();
		return { ok: true };
	}
};
