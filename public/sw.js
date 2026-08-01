/* Service worker — funcionamento em campo sem sinal.
 * Guarda a casca do aplicativo e os quadradinhos do mapa (OpenStreetMap)
 * já visitados. Dados da programação ficam no IndexedDB, não aqui.
 */
const VERSAO = "programacao-regional-v1";
const CASCA = `${VERSAO}-casca`;
const MAPA = `${VERSAO}-mapa`;
const LIMITE_MAPA = 600;

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(CASCA).then((c) => c.addAll(["/"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) =>
        Promise.all(chaves.filter((k) => !k.startsWith(VERSAO)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

async function limitar(nome, limite) {
  const cache = await caches.open(nome);
  const chaves = await cache.keys();
  if (chaves.length > limite) {
    await Promise.all(chaves.slice(0, chaves.length - limite).map((k) => cache.delete(k)));
  }
}

self.addEventListener("fetch", (evento) => {
  const requisicao = evento.request;
  if (requisicao.method !== "GET") return;

  const url = new URL(requisicao.url);

  // Quadradinhos do mapa: cache primeiro (o mapa continua desenhando offline).
  if (/tile\.openstreetmap\.org|tile\.opentopomap\.org/.test(url.hostname)) {
    evento.respondWith(
      caches.open(MAPA).then(async (cache) => {
        const guardado = await cache.match(requisicao);
        if (guardado) return guardado;
        try {
          const resposta = await fetch(requisicao);
          if (resposta.ok) {
            await cache.put(requisicao, resposta.clone());
            void limitar(MAPA, LIMITE_MAPA);
          }
          return resposta;
        } catch {
          return new Response("", { status: 504 });
        }
      }),
    );
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_serverFn") || url.pathname.startsWith("/api/")) return;

  // Navegação e arquivos do aplicativo: rede primeiro, cache como reserva.
  evento.respondWith(
    fetch(requisicao)
      .then(async (resposta) => {
        if (resposta.ok) {
          const cache = await caches.open(CASCA);
          await cache.put(requisicao, resposta.clone());
        }
        return resposta;
      })
      .catch(async () => {
        const cache = await caches.open(CASCA);
        const guardado = await cache.match(requisicao);
        if (guardado) return guardado;
        if (requisicao.mode === "navigate") {
          const inicial = await cache.match("/");
          if (inicial) return inicial;
        }
        return new Response("Sem conexão", { status: 503 });
      }),
  );
});
