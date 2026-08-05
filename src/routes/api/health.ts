import { createFileRoute } from "@tanstack/react-router";

const TIMEOUT_MS = 2500;

type Estado = "ok" | "degraded" | "unavailable" | "unknown";

function configBanco() {
  const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ??
    process.env["SUPABASE_ANON_KEY"] ??
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  return { url, key };
}

async function pingar(url: string, headers: Record<string, string> = {}): Promise<Estado> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    return res.status < 500 ? "ok" : "degraded";
  } catch {
    return "unavailable";
  } finally {
    clearTimeout(timer);
  }
}

/** Banco: dependência essencial. Sem ele o aplicativo não opera online. */
async function verificarBanco(): Promise<Estado> {
  const { url, key } = configBanco();
  if (!url || !key) return "unknown";
  return pingar(`${url}/rest/v1/`, { apikey: key });
}

/** Storage (PDFs/fotos): importante, mas o app abre e opera sem ele. */
async function verificarStorage(): Promise<Estado> {
  const { url, key } = configBanco();
  if (!url || !key) return "unknown";
  return pingar(`${url}/storage/v1/bucket`, { apikey: key, Authorization: `Bearer ${key}` });
}

/** OSRM: serviço não essencial (rota some, o resto continua). */
async function verificarOsrm(): Promise<Estado> {
  const base = process.env["OSRM_BASE_URL"];
  if (!base) return "unknown";
  return pingar(`${base.replace(/\/$/, "")}/route/v1/driving/-46.6,-23.5;-46.7,-23.6?overview=false`);
}

/** DER-SP (WebRota): serviço não essencial, tem modo de contingência no app. */
async function verificarDer(): Promise<Estado> {
  const base = process.env["DER_MAP_SERVICE_URL"] ?? process.env["VITE_DER_MAP_SERVICE_URL"];
  if (!base) return "unknown";
  return pingar(base);
}

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const timestamp = new Date().toISOString();
        const headers = { "Cache-Control": "no-store" };

        const [database, storage, osrm, der] = await Promise.all([
          verificarBanco(),
          verificarStorage(),
          verificarOsrm(),
          verificarDer(),
        ]);

        // Só o banco (dependência essencial) derruba o serviço para 503.
        // OSRM e DER indisponíveis apenas marcam degradação: o app abre,
        // consulta a programação, usa cache e registra inspeções offline.
        const essencialOk = database !== "unavailable";
        const algoDegradado = [storage, osrm, der].some((e) => e !== "ok" && e !== "unknown");

        return Response.json(
          {
            status: essencialOk ? (algoDegradado ? "degraded" : "ok") : "unavailable",
            service: "fiscalizacao-der",
            version: process.env["APP_VERSION"] ?? "unknown",
            database,
            storage,
            osrm,
            der,
            timestamp,
            uptimeSeconds: Math.floor(process.uptime?.() ?? 0),
          },
          { status: essencialOk ? 200 : 503, headers },
        );
      },
    },
  },
});
