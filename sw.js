// 오프라인에서도 동작하도록 앱 파일을 캐시한다. 파일을 바꾸면 VERSION을 올린다.
const VERSION = 'v7';
const MEDIA_CACHE = 'media-v4'; // 같은 이름의 영상 파일을 바꾸면 이 값도 올린다
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/audio.js', 'js/avatar.js', 'js/icons.js', 'js/idb.js', 'js/media.js', 'js/music.js', 'js/ui.js',
  'js/exercises.js', 'js/plan.js', 'js/player.js', 'js/store.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== MEDIA_CACHE && k !== 'fonts-v1').map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // 글꼴(Google Fonts): 한 번 받으면 캐시에서 쓴다. 오프라인이면 시스템 글꼴로 대체된다
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open('fonts-v1').then(async (c) => (await c.match(e.request)) || fetch(e.request).then((res) => { c.put(e.request, res.clone()); return res; })));
    return;
  }
  if (url.origin !== location.origin) return;

  // 운동 영상: 한 번 받으면 캐시에서 통째로 준다 (영상은 Range 요청이라 따로 처리)
  if (url.pathname.includes('/media/')) {
    e.respondWith(caches.open(MEDIA_CACHE).then(async (c) => {
      const hit = await c.match(url.pathname);
      if (hit) return hit;
      const res = await fetch(url.pathname, { cache: 'reload' });
      if (res.ok && res.status === 200) c.put(url.pathname, res.clone());
      return res;
    }));
    return;
  }

  // 앱 파일: 네트워크 우선, 실패하면 캐시 (배포한 새 버전이 바로 반영되도록)
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
