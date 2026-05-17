const CACHE_NAME = 'booksmart-v3';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request)),
  );
});

self.addEventListener('push', (event) => {
  let payload = { title: 'Booksmart', body: '', url: '/', type: 'default' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Booksmart', {
      body: payload.body || '',
      icon: '/logo192.png',
      badge: '/favicon.ico',
      tag: payload.type || 'booksmart',
      data: { url: payload.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          if ('navigate' in client) {
            return client.navigate(targetUrl).then(() => client.focus());
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    }),
  );
});
