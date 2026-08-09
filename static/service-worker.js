const CACHE_NAME = 'dash-static-v1';
const PRECACHE = [
	'/manifest.webmanifest',
	'/icons/dash.svg',
	'/icons/dash-180.png',
	'/icons/dash-192.png',
	'/icons/dash-512.png'
];

self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	const request = event.request;
	const url = new URL(request.url);

	if (
		request.method !== 'GET' ||
		url.origin !== self.location.origin ||
		(!url.pathname.startsWith('/_app/immutable/') && !PRECACHE.includes(url.pathname))
	) {
		return;
	}

	event.respondWith(
		caches.match(request).then(async (cached) => {
			if (cached) {
				return cached;
			}

			const response = await fetch(request);
			if (response.ok) {
				const cache = await caches.open(CACHE_NAME);
				cache.put(request, response.clone());
			}
			return response;
		})
	);
});
