import { summarize } from '$lib/link-check.js';
import { checkBookmarkLinks, countBookmarksToCheck } from '$lib/server/link-check';

// Server-sent events: a link check can take a while over a large bookmark list,
// so each result is streamed as it lands instead of making the page wait for the
// whole sweep. The check is aborted as soon as the client goes away.
export const GET = async () => {
	const encoder = new TextEncoder();
	const controller = new AbortController();
	const total = await countBookmarksToCheck();

	const stream = new ReadableStream({
		async start(streamController) {
			const emit = (event: string, payload: unknown) => {
				try {
					streamController.enqueue(
						encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
					);
				} catch {
					// stream already closed
				}
			};

			emit('start', { total });

			try {
				const results = await checkBookmarkLinks(
					(result, done) => emit('result', { result, done, total }),
					controller.signal
				);

				if (!controller.signal.aborted) {
					emit('done', { summary: summarize(results) });
				}
			} catch (error) {
				emit('failed', { message: error instanceof Error ? error.message : 'Link check failed.' });
			}

			try {
				streamController.close();
			} catch {
				// already closed
			}
		},
		cancel() {
			controller.abort();
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
