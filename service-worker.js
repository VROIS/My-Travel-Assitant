const CACHE_NAME = 'my-travel-assistant-cache-v7'; // Force update by bumping cache version
const urlsToCache = [
  '/',
  'index.html',
  'index.js',
  'services/geminiService.js',
  'utils/imageOptimizer.js',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Maru+Buri:wght@300;400;500;600;700&display=swap',
];

// On install, cache the core assets.
self.addEventListener('install', event => {
  self.skipWaiting(); 
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache and caching core assets.');
        // Use addAll with a catch block to prevent install failure if one resource fails
        return cache.addAll(urlsToCache).catch(error => {
            console.error('Failed to cache all resources during install:', error);
        });
      })
  );
});

// On activate, clean up old caches.
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
        return self.clients.claim();
    })
  );
});

// On fetch, use a network-first strategy.
self.addEventListener('fetch', event => {
  // We only want to handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    // 1. Try to fetch from the network.
    fetch(event.request)
      .then(networkResponse => {
        // If the fetch is successful, clone the response and update the cache.
        // This ensures that the next time the user is offline, they have the latest version.
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME)
          .then(cache => {
            cache.put(event.request, responseToCache);
          });
        // Return the response from the network.
        return networkResponse;
      })
      .catch(error => {
        // 2. If the network fetch fails (e.g., user is offline), try to serve from the cache.
        console.log('Network request failed. Attempting to serve from cache for:', event.request.url);
        return caches.match(event.request)
          .then(cachedResponse => {
            // If we have a match in the cache, return it.
            // Otherwise, the browser will handle the error as a standard network failure.
            return cachedResponse;
          });
      })
  );
});