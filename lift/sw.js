// Keeps the app's own files on the phone so it opens instantly, even with no signal.
// Only the page, its scripts, icons and fonts are cached; nothing from Supabase ever is (your data
// lives in the database, and the app keeps its own snapshot of what you last saw).
// Stale-while-revalidate: answer from the phone straight away, then fetch a fresh copy in the
// background, so a new version of the app shows up on the next open.
const CACHE = 'lift-shell-v3';
const SCOPE = new URL('./', self.location).href;
const SHELL = ['./', 'index.html', 'app.js', 'data.js', 'logic.js', 'charts.js', 'starters.js', 'themes.js', 'seasons.js', 'config.js',
  'icon.svg', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest'].map(p => new URL(p, SCOPE).href);
const LIBS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('lift-shell-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const ours = url.href.startsWith(SCOPE);
  if (!ours && !LIBS.includes(url.hostname)) return;   // Supabase and anything else: straight to the network
  // Every visit to the page (any ?query or #hash) is the same page.
  const key = req.mode === 'navigate' ? new URL('index.html', SCOPE).href : req;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(key, { ignoreSearch: req.mode === 'navigate' });
    const fresh = fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') c.put(key, res.clone());
      return res;
    }).catch(() => hit || Response.error());
    if (hit) { e.waitUntil(fresh.catch(() => {})); return hit; }
    return fresh;
  }));
});
