var CACHE_NAME = "polevoy-konspekt-v11";
var CORE_ASSETS = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(CORE_ASSETS.map(function (u) { return new Request(u, {cache: "reload"}); }));
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

function isPage(request) {
  if (request.mode === "navigate") return true;
  var path = new URL(request.url).pathname;
  return path.slice(-1) === "/" || path.slice(-11) === "/index.html";
}

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;

  // сама страница: сначала сеть (свежая версия); если сеть не ответила за 3 с или недоступна —
  // сразу отдаём сохранённую копию, а свежую докачиваем в фоне к следующему открытию
  if (isPage(event.request)) {
    var net = fetch(event.request, {cache: "no-cache"}).then(function (response) {
      if (response && response.ok) {
        var copy = response.clone();
        return caches.open(CACHE_NAME).then(function (cache) {
          return cache.put("./index.html", copy);
        }).then(function () { return response; });
      }
      return response;
    });
    event.waitUntil(net.catch(function () {}));
    event.respondWith(new Promise(function (resolve) {
      var done = false;
      function finish(r) { if (!done && r) { done = true; clearTimeout(timer); resolve(r); } }
      var timer = setTimeout(function () {
        caches.match("./index.html").then(finish);
      }, 3000);
      net.then(finish).catch(function () {
        caches.match("./index.html").then(function (c) { finish(c || Response.error()); });
      });
    }));
    return;
  }

  // остальное (иконки, манифест): сначала кэш
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request)
        .then(function (response) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
          return response;
        })
        .catch(function () {
          return caches.match("./index.html");
        });
    })
  );
});
