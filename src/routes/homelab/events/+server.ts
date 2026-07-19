import { subscribeHomelab } from '$lib/server/homelab';

// Server-sent events: notify open homelab pages when container/VM status
// changes so they can re-load in place. The server only polls upstream while
// at least one client is connected.
export const GET = () => {
	const encoder = new TextEncoder();
	let unsubscribe: (() => void) | null = null;
	let ping: ReturnType<typeof setInterval> | null = null;

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

			unsubscribe = subscribeHomelab(() => emit(`data: ${Date.now()}\n\n`));
			ping = setInterval(() => emit(': ping\n\n'), 25000);
		},
		cancel() {
			unsubscribe?.();

			if (ping) {
				clearInterval(ping);
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
