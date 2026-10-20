// App-shell cache so the app opens with no signal. Supabase calls (other origins) are never cached here.
const CACHE = 'duet-shell-v4';
const SHELL = ['./', 'index.html', 'styles.css', 'theme.js', 'config.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'vendor/supabase.js',
  'js/app.js', 'js/core.js', 'js/charts.js', 'js/auth.js', 'js/tx.js', 'js/money.js', 'js/analytics.js', 'js/settings.js', 'js/dates.js', 'js/domain.js', 'js/store.js', 'js/backend.js', 'js/local-api.js'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request).then((r) => r || caches.match('./'))));
});
