import { createFileRoute } from "@tanstack/react-router";

const TIMEOUT_MS = 2500;

/** Verificação leve da dependência crítica (Supabase / banco). */
async function verificarBanco(): Promise<boolean> {
  const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ??
    process.env["SUPABASE_ANON_KEY"] ??
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

  // Sem configuração de banco não há como declarar indisponibilidade.
  if (!url || !key) return true;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: key },
      signal: controller.signal,
    });
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const timestamp = new Date().toISOString();
        const headers = { "Cache-Control": "no-store" };
        const bancoOk = await verificarBanco();

        if (!bancoOk) {
          return Response.json(
            {
              status: "degraded",
              service: "fiscalizacao-der",
              database: "unavailable",
              version: process.env["APP_VERSION"] ?? "unknown",
              timestamp,
            },
            { status: 503, headers },
          );
        }

        return Response.json(
          {
            status: "ok",
            service: "fiscalizacao-der",
            version: process.env["APP_VERSION"] ?? "unknown",
            timestamp,
            uptimeSeconds: Math.floor(process.uptime?.() ?? 0),
          },
          { status: 200, headers },
        );
      },
    },
  },
});
