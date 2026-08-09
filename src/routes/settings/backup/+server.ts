import { createDashBackup } from '$lib/server/backup';

export const GET = async () => {
	const backup = await createDashBackup();
	const date = backup.exportedAt.slice(0, 10);

	return new Response(`${JSON.stringify(backup, null, 2)}\n`, {
		headers: {
			'Cache-Control': 'no-store',
			'Content-Disposition': `attachment; filename="dash-backup-${date}.json"`,
			'Content-Type': 'application/json; charset=utf-8'
		}
	});
};
