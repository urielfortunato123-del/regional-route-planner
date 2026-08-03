/**
 * Recuperação automática quando o navegador tenta baixar um pedaço (chunk)
 * antigo do aplicativo que não existe mais depois de uma nova publicação.
 * Nesses casos a tela fica em branco; aqui limpamos os caches, removemos o
 * service worker e recarregamos a página uma única vez.
 */
const MARCA = "recarga-chunk";

const PADROES = [
  "failed to fetch dynamically imported module",
  "importing a module script failed",
  "error loading dynamically imported module",
  "'text/html' is not a valid javascript mime type",
];

function ehFalhaDeChunk(mensagem: string) {
  const texto = mensagem.toLowerCase();
  return PADROES.some((p) => texto.includes(p));
}

export async function limparCachesERecarregar() {
  if (typeof window === "undefined") return;
  if (sessionStorage.getItem(MARCA)) return;
  sessionStorage.setItem(MARCA, "1");
  try {
    if ("caches" in window) {
      const chaves = await caches.keys();
      await Promise.all(chaves.map((k) => caches.delete(k)));
    }
    const registros = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(registros.map((r) => r.unregister()));
  } catch {
    /* recarrega mesmo assim */
  }
  window.location.reload();
}

export function instalarRecuperacaoDeChunk() {
  if (typeof window === "undefined") return () => {};

  const aoErro = (evento: ErrorEvent) => {
    if (ehFalhaDeChunk(evento.message ?? "")) void limparCachesERecarregar();
  };
  const aoRejeitar = (evento: PromiseRejectionEvent) => {
    const motivo = evento.reason;
    const mensagem = motivo instanceof Error ? motivo.message : String(motivo ?? "");
    if (ehFalhaDeChunk(mensagem)) void limparCachesERecarregar();
  };

  window.addEventListener("error", aoErro);
  window.addEventListener("unhandledrejection", aoRejeitar);
  return () => {
    window.removeEventListener("error", aoErro);
    window.removeEventListener("unhandledrejection", aoRejeitar);
  };
}

/** Chamado quando o aplicativo carrega bem, liberando uma futura recuperação. */
export function limparMarcaRecarga() {
  if (typeof window !== "undefined") sessionStorage.removeItem(MARCA);
}
