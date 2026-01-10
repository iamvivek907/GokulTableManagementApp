const CACHE_VERSION = '3.0.0';
const CACHE_NAME = `gokul-restaurant-v${CACHE_VERSION}`;
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Install service worker
self.addEventListener('install', event => {
  console.log('[SW] Installing service worker version:', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.error('[SW] Cache installation failed:', err);
      })
  );
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Cache and return requests
self.addEventListener('fetch', event => {
  // Skip caching for API requests - always fetch fresh
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Return error response if offline
        return new Response(JSON.stringify({ error: 'Offline - API unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Network first, falling back to cache for static assets
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Check if valid response
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Clone and cache the response
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });

        return response;
      })
      .catch(() => {
        // If network fails, try cache
        return caches.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            console.log('[SW] Serving from cache:', event.request.url);
            return cachedResponse;
          }
          
          // Return offline page for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// Update service worker
self.addEventListener('activate', event => {
  console.log('[SW] Activating service worker version:', CACHE_VERSION);
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all clients immediately
      return self.clients.claim();
    }).then(() => {
      // Notify all clients about the update
      return self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_UPDATED',
            version: CACHE_VERSION
          });
        });
      });
    })
  );
});

// Background sync for offline orders
self.addEventListener('sync', event => {
  if (event.tag === 'sync-orders') {
    event.waitUntil(syncOrders());
  }
});

async function syncOrders() {
  // TODO: Implement IndexedDB synchronization
  // This would store pending orders when offline and sync when online
  console.log('Syncing orders...');
  // Future implementation:
  // 1. Open IndexedDB
  // 2. Get pending orders
  // 3. Send to server
  // 4. Clear from IndexedDB on success
}

// Push notifications
self.addEventListener('push', event => {
  if (!event.data) {
    return;
  }
  
  try {
    const data = event.data.json();
    const options = {
      body: data.body || 'New notification',
      icon: './icon-192.png',
      badge: './icon-192.png',
      vibrate: [200, 100, 200],
      data: data.data || {}
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'Restaurant Update', options)
    );
  } catch (error) {
    console.error('Error handling push notification:', error);
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('./')
  );
});

// Listen for skip waiting message from client
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Received SKIP_WAITING message');
    self.skipWaiting();
  }
});
