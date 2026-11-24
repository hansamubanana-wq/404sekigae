// オフラインでも開けるようにするキャッシュ
// ・このサイトのファイル: ネットを優先 (更新がすぐ反映される)。つながらないときはキャッシュ
// ・three.js やフォントなど外部のファイル: キャッシュを優先
const CACHE = "sekigae-v20";
// 音声はアプリが必要なタイミングで読み込むので、事前キャッシュには含めない。
const CORE = [
  "./", "index.html", "style.css", "students.js", "sound.js", "app.js", "world.js", "models.js", "mc-model.js", "mc.js", "extras.js", "frontrow.js", "pair.js", "show.js",
  "sounds/_list.json", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  // 動画は部分読み込み (Range) で届くので、キャッシュを通さずそのままネットから
  if (req.headers.has("range") || /\.(mp4|webm|mov)(\?|$)/.test(req.url)) return;
  const sameOrigin = new URL(req.url).origin === location.origin;

  if (sameOrigin) {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("index.html")))
    );
  } else {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }))
    );
  }
});
