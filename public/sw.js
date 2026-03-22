const CACHE_NAME = 'gavel-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/auth.js',
    '/js/nav.js',
    '/js/main.js'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;
    
    // For API calls, try network first
    if (e.request.url.includes('/api/')) {
        e.respondWith(
            fetch(e.request).catch(() => new Response(JSON.stringify({ error: 'Offline mode' }), {
                headers: { 'Content-Type': 'application/json' }
            }))
        );
        return;
    }

    // For static assets, try cache first, fallback to network
    e.respondWith(
        caches.match(e.request).then((response) => response || fetch(e.request))
    );
});
