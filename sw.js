// 오프라인에서도 동작하도록 앱 파일을 캐시한다. 파일을 바꾸면 VERSION을 올린다.
const VERSION = 'v32';
const MEDIA_CACHE = 'media-v11'; // 같은 이름의 영상 파일을 바꾸면 이 값도 올린다
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css', 'css/rewards.css', 'css/design.css',
  'js/app.js', 'js/audio.js', 'js/voice.js', 'js/voice-lines.js', 'js/avatar.js', 'js/icons.js', 'js/idb.js', 'js/media.js', 'js/music.js', 'js/ui.js',
  'js/exercises.js', 'js/plan.js', 'js/player.js', 'js/push.js', 'js/push-messages.js', 'js/native.js', 'js/flags.js', 'js/billing.js', 'js/share.js', 'fonts/PretendardVariable.woff2', 'js/rewards.js', 'js/store.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/badge-96.png',
];

// 알림 문구 생성기 (앱과 같은 파일을 쓴다)
importScripts('js/push-messages.js');

// 앱이 IndexedDB에 복사해 둔 기록을 읽는다
function readState() {
  return new Promise((res) => {
    const r = indexedDB.open('homet', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onerror = () => res(null);
    r.onsuccess = () => {
      try {
        const q = r.result.transaction('files', 'readonly').objectStore('files').get('state');
        q.onsuccess = () => res(q.result || null);
        q.onerror = () => res(null);
      } catch { res(null); }
    };
  });
}

// 매일 저녁 8시 푸시: 받는 순간 오늘 기록을 보고 문구를 만든다 (운동 전이면 독려, 운동 후면 성과 정리)
self.addEventListener('push', (e) => {
  let payload = {};
  try { payload = e.data ? e.data.json() : {}; } catch { /* 내용 없는 푸시 */ }
  e.waitUntil((async () => {
    const m = payload.title ? payload : self.buildPushMessage(await readState());
    await self.registration.showNotification(m.title, {
      body: m.body, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', tag: 'daily', renotify: true, data: { url: './' },
    });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    for (const w of ws) if ('focus' in w) return w.focus();
    return self.clients.openWindow('./');
  }));
});

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
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' || (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('/pretendard'))) {
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
