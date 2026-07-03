#!/usr/bin/env node
import { existsSync, readFileSync, watch } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { createServer } from 'node:http';

const PORT = Number(process.env.OMARCHY_HELPER_PORT ?? 43741);
const HOST = '127.0.0.1';
const OMARCHY_DIR =
	process.env.OMARCHY_DIR?.trim() || join(homedir(), '.config', 'omarchy');
const CURRENT_DIR = join(OMARCHY_DIR, 'current');
const CURRENT_THEME_DIR = join(CURRENT_DIR, 'theme');

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
	'Access-Control-Allow-Private-Network': 'true'
};

const clients = new Set();
let currentWatcher = null;
let themeWatcher = null;
let debounce = null;
let currentSignature = themeSignature();

const server = createServer((request, response) => {
	const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${HOST}:${PORT}`}`);

	if (request.method === 'OPTIONS') {
		writeHead(response, 204, CORS_HEADERS);
		response.end();
		return;
	}

	if (request.method === 'GET' && url.pathname === '/theme') {
		try {
			const payload = currentThemePayload();
			writeJson(response, 200, payload);
		} catch (error) {
			writeJson(response, 404, {
				error: error instanceof Error ? error.message : 'Unable to read Omarchy theme.'
			});
		}
		return;
	}

	if (request.method === 'GET' && url.pathname === '/events') {
		writeHead(response, 200, {
			...CORS_HEADERS,
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		});
		response.write('retry: 2000\n\n');
		response.write(`data: ${Date.now()}\n\n`);
		clients.add(response);
		request.on('close', () => clients.delete(response));
		return;
	}

	writeJson(response, 404, { error: 'Not found.' });
});

server.listen(PORT, HOST, () => {
	armWatchers();
	setInterval(pollForChanges, 1000);
	console.log(`Omarchy theme helper listening at http://${HOST}:${PORT}`);
	console.log(`Reading ${OMARCHY_DIR}`);
});

server.on('error', (error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});

function currentThemePayload() {
	if (!existsSync(CURRENT_DIR)) {
		throw new Error(`Omarchy current directory not found: ${CURRENT_DIR}`);
	}

	const name = readText(join(CURRENT_DIR, 'theme.name')).trim() || basename(CURRENT_THEME_DIR);
	const mode = existsSync(join(CURRENT_THEME_DIR, 'light.mode')) ? 'light' : 'dark';

	return {
		name,
		mode,
		files: {
			colorsToml: readText(join(CURRENT_THEME_DIR, 'colors.toml')),
			alacrittyToml: readText(join(CURRENT_THEME_DIR, 'alacritty.toml')),
			walkerCss: readText(join(CURRENT_THEME_DIR, 'walker.css')),
			hyprlandConf: readText(join(CURRENT_THEME_DIR, 'hyprland.conf'))
		}
	};
}

function armWatchers() {
	currentWatcher?.close();
	themeWatcher?.close();
	currentWatcher = watchPath(CURRENT_DIR);
	themeWatcher = watchPath(CURRENT_THEME_DIR);
}

function watchPath(path) {
	if (!existsSync(path)) {
		return null;
	}

	try {
		return watch(path, () => {
			if (debounce) {
				clearTimeout(debounce);
			}

			debounce = setTimeout(() => {
				armWatchers();
				emitChangeIfChanged();
			}, 200);
		});
	} catch {
		return null;
	}
}

function pollForChanges() {
	emitChangeIfChanged();
}

function emitChangeIfChanged() {
	const nextSignature = themeSignature();

	if (nextSignature === currentSignature) {
		return;
	}

	currentSignature = nextSignature;
	armWatchers();
	emitChange();
}

function themeSignature() {
	const payload = currentThemePayload();
	return JSON.stringify(payload);
}

function emitChange() {
	const payload = `data: ${Date.now()}\n\n`;

	for (const client of clients) {
		try {
			client.write(payload);
		} catch {
			clients.delete(client);
		}
	}
}

function readText(path) {
	try {
		return readFileSync(path, 'utf8');
	} catch {
		return '';
	}
}

function writeJson(response, statusCode, body) {
	writeHead(response, statusCode, {
		...CORS_HEADERS,
		'Content-Type': 'application/json; charset=utf-8',
		'Cache-Control': 'no-cache'
	});
	response.end(`${JSON.stringify(body)}\n`);
}

function writeHead(response, statusCode, headers) {
	response.writeHead(statusCode, headers);
}
