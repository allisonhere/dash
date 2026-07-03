import { existsSync, watch, type FSWatcher } from 'node:fs';
import { OMARCHY_CURRENT_DIR } from '$lib/server/omarchy-theme';

// Server-sent events: notify open pages when the local omarchy theme changes so
// they can restyle in place. Only meaningful when an omarchy dir is present
// (a desktop, or a bind-mounted omarchy folder in the container).
export const GET = () => {
	const encoder = new TextEncoder();
	let watcher: FSWatcher | null = null;
	let ping: ReturnType<typeof setInterval> | null = null;
	let debounce: ReturnType<typeof setTimeout> | null = null;

	const stream = new ReadableStream({
		start(controller) {
			const emit = (payload: string) => {
				try {
					controller.enqueue(encoder.encode(payload));
				} catch {
					// stream already closed
				}
			};

			emit('retry: 2000\n\n');

			if (existsSync(OMARCHY_CURRENT_DIR)) {
				try {
					watcher = watch(OMARCHY_CURRENT_DIR, () => {
						if (debounce) {
							clearTimeout(debounce);
						}

						debounce = setTimeout(() => emit(`data: ${Date.now()}\n\n`), 200);
					});
				} catch {
					// unwatchable; clients just won't get live updates
				}
			}

			ping = setInterval(() => emit(': ping\n\n'), 25000);
		},
		cancel() {
			watcher?.close();

			if (ping) {
				clearInterval(ping);
			}

			if (debounce) {
				clearTimeout(debounce);
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
