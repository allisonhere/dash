import { createConnection } from 'node:net';
import type { NutUpsConfig } from './homelab-config';

export type NutUpsStatus = {
	name: string;
	target: string;
	reachable: boolean;
	error: string | null;
	model: string;
	status: string[];
	charge: number;
	runtime: number;
	load: number;
	inputVoltage: number;
	outputVoltage: number;
	realPower: number;
	realPowerNominal: number;
};

const TIMEOUT_MS = 5_000;

export async function loadNutUps(config: NutUpsConfig): Promise<NutUpsStatus> {
	const base: NutUpsStatus = {
		name: config.name,
		target: `${config.upsName}@${config.host}:${config.port}`,
		reachable: false,
		error: null,
		model: '',
		status: [],
		charge: 0,
		runtime: 0,
		load: 0,
		inputVoltage: 0,
		outputVoltage: 0,
		realPower: 0,
		realPowerNominal: 0
	};

	try {
		const variables = await listVariables(config);

		return {
			...base,
			reachable: true,
			model: variables.get('ups.model') ?? variables.get('device.model') ?? '',
			status: (variables.get('ups.status') ?? '').split(/\s+/).filter(Boolean),
			charge: number(variables.get('battery.charge')),
			runtime: number(variables.get('battery.runtime')),
			load: number(variables.get('ups.load')),
			inputVoltage: number(variables.get('input.voltage')),
			outputVoltage: number(variables.get('output.voltage')),
			realPower: number(variables.get('ups.realpower')),
			realPowerNominal: number(variables.get('ups.realpower.nominal'))
		};
	} catch (error) {
		return { ...base, error: nutError(error) };
	}
}

function listVariables(config: NutUpsConfig): Promise<Map<string, string>> {
	return new Promise((resolve, reject) => {
		const socket = createConnection({ host: config.host, port: config.port });
		let response = '';
		let settled = false;

		const finish = (error?: Error) => {
			if (settled) return;
			settled = true;
			socket.destroy();

			if (error) {
				reject(error);
				return;
			}

			try {
				resolve(parseListResponse(response, config.upsName));
			} catch (parseError) {
				reject(parseError);
			}
		};

		socket.setTimeout(TIMEOUT_MS);
		socket.setEncoding('utf8');
		socket.on('connect', () => socket.write(`LIST VAR ${config.upsName}\n`));
		socket.on('data', (chunk) => {
			response += chunk;

			if (response.includes('\nEND LIST VAR ') || response.startsWith('ERR ')) {
				finish();
			}
		});
		socket.on('timeout', () => finish(new Error('NUT request timed out')));
		socket.on('error', (error) => finish(error));
		socket.on('end', () => finish());
	});
}

function parseListResponse(response: string, upsName: string): Map<string, string> {
	const error = response.match(/^ERR\s+([^\r\n]+)/m);

	if (error) {
		throw new Error(`NUT ${error[1]}`);
	}

	if (!response.includes(`END LIST VAR ${upsName}`)) {
		throw new Error('NUT returned an incomplete response');
	}

	const variables = new Map<string, string>();
	const prefix = `VAR ${upsName} `;

	for (const line of response.split(/\r?\n/)) {
		if (!line.startsWith(prefix)) continue;

		const match = line.slice(prefix.length).match(/^(\S+)\s+"((?:\\.|[^"])*)"$/);

		if (match) {
			variables.set(match[1], match[2].replace(/\\(["\\])/g, '$1'));
		}
	}

	return variables;
}

function number(value: string | undefined): number {
	const parsed = Number.parseFloat(value ?? '');
	return Number.isFinite(parsed) ? parsed : 0;
}

function nutError(error: unknown): string {
	const message = error instanceof Error ? error.message : 'NUT request failed.';

	if (/timed out|ETIMEDOUT/i.test(message)) return 'Timed out reaching the NUT server.';
	if (/ECONNREFUSED/i.test(message)) return 'NUT refused the connection — check upsd is listening.';
	if (/EHOSTUNREACH|ENETUNREACH|ENOTFOUND/i.test(message)) return 'Could not reach the NUT server.';
	if (/UNKNOWN-UPS/i.test(message)) return 'UPS not found — check the configured NUT UPS name.';
	if (/ACCESS-DENIED/i.test(message)) return 'NUT denied access from this host.';

	return message;
}
