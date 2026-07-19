import { fail } from '@sveltejs/kit';
import { clearHomelabCache, controlContainer, controlGuest, loadHomelab } from '$lib/server/homelab';
import type { ProxmoxAction } from '$lib/server/proxmox';
import type { DockerAction } from '$lib/server/docker-ssh';

export const load = async ({ depends }: { depends: (dep: string) => void }) => {
	depends('homelab:status');
	return loadHomelab();
};

export const actions = {
	refresh: async () => {
		clearHomelabCache();
		return { ok: true };
	},

	guest: async ({ request }: { request: Request }) => {
		const form = await request.formData();
		const vmid = Number(form.get('vmid'));
		const action = String(form.get('action') ?? '');
		const target = `pve:${vmid}`;

		const result = await controlGuest(vmid, action as ProxmoxAction);

		if (!result.ok) {
			return fail(result.kind === 'validation' ? 400 : 502, {
				ok: false,
				intent: 'guest',
				target,
				message: result.error
			});
		}

		return { ok: true, intent: 'guest', target, action };
	},

	container: async ({ request }: { request: Request }) => {
		const form = await request.formData();
		const host = String(form.get('host') ?? '');
		const name = String(form.get('name') ?? '');
		const action = String(form.get('action') ?? '');
		const target = `docker:${host}/${name}`;

		const result = await controlContainer(host, name, action as DockerAction);

		if (!result.ok) {
			return fail(result.kind === 'validation' ? 400 : 502, {
				ok: false,
				intent: 'container',
				target,
				message: result.error
			});
		}

		return { ok: true, intent: 'container', target, action };
	}
};
