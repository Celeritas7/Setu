/* Offline shell for this page only. Research JSON stays in IndexedDB/backups. */
const PREFIX = 'setu-research-import-' + encodeURIComponent(new URL('.',self.registration.scope).pathname) + '-';
const VERSION = 'r4-1';
const CACHE = PREFIX + VERSION;
const ASSETS = ['research-import.html','css/research-import.css','js/research-import-schema.js',
  'js/research-import.js','js/research-local.js','js/research-storage.js','js/research-offline.js','js/research-import-ui.js','icons/icon-192.png'];
const URLS = ASSETS.map(path => new URL(path,self.registration.scope).href);
const STATUS = 'SETU_RESEARCH_OFFLINE_STATUS';
self.addEventListener('message',event => {
  if (![STATUS,'SETU_RESEARCH_OFFLINE_PREPARE'].includes(event.data?.type) || !event.ports?.[0]) return;
  // Only this importer may request setup; no uploaded JSON or personal data is exchanged.
  if (!event.source?.url || !event.source.url.startsWith(self.registration.scope)) return;
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      if (event.data.type === 'SETU_RESEARCH_OFFLINE_PREPARE') {
        try {await cache.addAll(URLS.map(url => new Request(url,{cache:'reload'})));} catch (_) { /* Report what is still cached. */ }
      }
      const missing = [];
      for (const url of URLS) if (!(await cache.match(url))?.ok) missing.push(new URL(url).pathname);
      event.ports[0].postMessage({type:STATUS,version:VERSION,ready:missing.length === 0,missing});
    } catch (_) {event.ports[0].postMessage({type:STATUS,version:VERSION,ready:false});}
  })());
});
self.addEventListener('install',event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  await cache.addAll(URLS.map(url => new Request(url,{cache:'reload'})));
  await self.skipWaiting();
})()));
self.addEventListener('activate',event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event => {
  const url = new URL(event.request.url);url.search='';url.hash='';
  if (event.request.method !== 'GET' || !URLS.includes(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request);
      if (response.ok) {try {await cache.put(url.href,response.clone());} catch (_) { /* A usable online response survives cache quota errors. */ }return response;}
      return await cache.match(url.href) || response;
    } catch (error) {const cached = await cache.match(url.href);if (cached) return cached;throw error;}
  })());
});
