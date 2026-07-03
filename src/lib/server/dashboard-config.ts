import { homedir } from 'node:os';
import { join } from 'node:path';
import { env } from '$env/dynamic/private';

// DASH_CONFIG_DIR lets a container point the data dir at a mounted volume
// (e.g. /config). Defaults to ~/.config/custom-dash for local/desktop runs.
export const DASHBOARD_CONFIG_DIR = env.DASH_CONFIG_DIR?.trim() || join(homedir(), '.config', 'custom-dash');

export function dashboardConfigPath(...segments: string[]) {
	return join(DASHBOARD_CONFIG_DIR, ...segments);
}
