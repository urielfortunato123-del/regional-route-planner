/**
 * Importa um pedaço (chunk) do aplicativo com nova tentativa.
 * Depois de uma nova publicação, o navegador (ou o service worker) pode ainda
 * apontar para um arquivo antigo que não existe mais no servidor: nesse caso
 * limpamos os caches e recarregamos a página uma única vez.
 */
const MARCA = "recarga-chunk";

export function importarComRetry<T>(carregar: () => Promise<T>): Promise<T> {
  return carregar().catch(async (erro) => {
    // segunda tentativa: pode ter sido apenas uma falha de rede momentânea
    try {
      return await carregar();
    } catch {
      if (typeof window === "undefined") throw erro;
      if (sessionStorage.getItem(MARCA)) throw erro;
      sessionStorage.setItem(MARCA, "1");
      try {
        if ("caches" in window) {
          const chaves = await caches.keys();
          await Promise.all(chaves.map((k) => caches.delete(k)));
        }
        const registros = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
        await Promise.all(registros.map((r) => r.unregister()));
      } catch {
        /* segue para o recarregamento mesmo assim */
      }
      window.location.reload();
      return new Promise<T>(() => {});
    }
  });
}

export function limparMarcaRecarga() {
  if (typeof window !== "undefined") sessionStorage.removeItem(MARCA);
}
