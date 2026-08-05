import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CalendarRange,
  CheckCircle2,
  CloudOff,
  History,
  Home,
  Loader2,
  Map,
  RefreshCw,
  Route as RouteIcon,
  Settings,
  Wifi,
} from "lucide-react";

import type { PerfilLocal } from "@/lib/perfil-local";
import { limparOutrasRegionais } from "@/lib/offline/db";
import { useSincronizacao } from "@/lib/offline/sync";
import { EVENTO_SERVIDOR_ONLINE, MENSAGEM_INICIANDO, useEstadoServidor } from "@/lib/servidor";
import { cn } from "@/lib/utils";

export function Cartao({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4 text-card-foreground shadow-[var(--shadow-card)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Botao({
  children,
  variante = "primario",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: "primario" | "secundario" | "contorno" | "destaque" | "perigo";
}) {
  const variantes: Record<string, string> = {
    primario: "bg-primary text-primary-foreground hover:bg-primary/90",
    secundario: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    contorno: "border border-border bg-card text-foreground hover:bg-surface",
    destaque: "bg-accent text-accent-foreground hover:bg-accent/90",
    perigo: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  };
  return (
    <button
      {...props}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variantes[variante],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Campo({
  rotulo,
  children,
  dica,
}: {
  rotulo: string;
  children: ReactNode;
  dica?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </span>
      {children}
      {dica ? <span className="mt-1 block text-xs text-muted-foreground">{dica}</span> : null}
    </label>
  );
}

export const estiloEntrada =
  "w-full min-h-11 rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-ring";

export function Etiqueta({
  children,
  tom = "neutro",
}: {
  children: ReactNode;
  tom?: "neutro" | "ok" | "alerta" | "erro" | "destaque";
}) {
  const tons: Record<string, string> = {
    neutro: "bg-muted text-muted-foreground",
    ok: "bg-success/15 text-success",
    alerta: "bg-warning/20 text-warning-foreground",
    erro: "bg-destructive/15 text-destructive",
    destaque: "bg-accent/25 text-accent-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        tons[tom],
      )}
    >
      {children}
    </span>
  );
}

const itensMenu = [
  { para: "/", rotulo: "Início", icone: Home },
  { para: "/programacao", rotulo: "Programação", icone: CalendarRange },
  { para: "/mapa", rotulo: "Mapa", icone: Map },
  { para: "/rota", rotulo: "Rota", icone: RouteIcon },
  { para: "/importacoes", rotulo: "Importações", icone: History },
  { para: "/configuracoes", rotulo: "Ajustes", icone: Settings },
] as const;

/** Faixa fixa de estado da conexão, da partida do servidor e da fila de envio. */
export function IndicadorConexao({ regional }: { regional: string }) {
  const { online, pendentes, sincronizando, sincronizar } = useSincronizacao(regional);
  const { estado, iniciando, tentarNovamente } = useEstadoServidor();
  const [sincronizadoAgora, setSincronizadoAgora] = useState(false);

  // Assim que o servidor responde, a fila guardada no aparelho sobe sozinha.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const aoResponder = () => void sincronizar();
    window.addEventListener(EVENTO_SERVIDOR_ONLINE, aoResponder);
    return () => window.removeEventListener(EVENTO_SERVIDOR_ONLINE, aoResponder);
  }, [sincronizar]);

  // "Sincronizado" aparece por alguns segundos depois do envio da fila.
  const anterior = useRef(sincronizando);
  useEffect(() => {
    if (anterior.current && !sincronizando && pendentes === 0) {
      setSincronizadoAgora(true);
      const t = window.setTimeout(() => setSincronizadoAgora(false), 4000);
      return () => window.clearTimeout(t);
    }
    anterior.current = sincronizando;
    return;
  }, [sincronizando, pendentes]);

  const offline = !online || estado === "offline";

  if (iniciando) {
    return (
      <div className="flex w-full flex-wrap items-center justify-center gap-2 bg-warning/25 px-4 py-1.5 text-[11px] font-semibold text-warning-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        <span className="normal-case">{MENSAGEM_INICIANDO}</span>
        <button onClick={tentarNovamente} className="underline underline-offset-2">
          Tentar novamente
        </button>
      </div>
    );
  }

  if (offline) {
    return (
      <button
        onClick={tentarNovamente}
        className="flex w-full items-center justify-center gap-2 bg-destructive/20 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-destructive"
      >
        <CloudOff className="size-3.5" />
        {`Offline — trabalhando no aparelho${pendentes ? ` (${pendentes} na fila)` : ""}`}
        <span className="underline underline-offset-2">Tentar novamente</span>
      </button>
    );
  }

  if (sincronizando) {
    return (
      <div className="flex w-full items-center justify-center gap-2 bg-warning/25 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-warning-foreground">
        <RefreshCw className="size-3.5 animate-spin" /> Sincronizando...
      </div>
    );
  }

  if (pendentes > 0) {
    return (
      <button
        onClick={() => void sincronizar()}
        className="flex w-full items-center justify-center gap-2 bg-warning/25 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-warning-foreground"
      >
        <Wifi className="size-3.5" />
        {`${pendentes} alteração(ões) aguardando envio`}
        <RefreshCw className="size-3.5" />
      </button>
    );
  }

  if (sincronizadoAgora) {
    return (
      <div className="flex w-full items-center justify-center gap-2 bg-success/20 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-success">
        <CheckCircle2 className="size-3.5" /> Sincronizado
      </div>
    );
  }

  return null;
}

export function AppShell({
  perfil,
  titulo,
  children,
}: {
  perfil: PerfilLocal;
  titulo: string;
  children: ReactNode;
}) {
  const caminho = useRouterState({ select: (s) => s.location.pathname });

  // Nunca manter no aparelho dados de uma regional que não é a atual.
  useEffect(() => {
    void limparOutrasRegionais(perfil.regional_codigo);
  }, [perfil.regional_codigo]);

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-background">
      <header className="sticky top-0 z-[1000] w-full shrink-0 border-b border-border bg-primary text-primary-foreground shadow-[var(--shadow-card)]">
        <div className="faixa-rodoviaria h-1 w-full" />
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold uppercase tracking-widest opacity-80">
              {perfil.regional_rotulo}
            </p>
            <h1 className="truncate font-display text-xl font-semibold">{titulo}</h1>
          </div>
          <div className="shrink-0 rounded-lg bg-primary-foreground/10 px-3 py-1.5 text-right">
            <p className="truncate text-xs font-semibold">{perfil.nome.split(" ")[0]}</p>
            <p className="text-[10px] uppercase tracking-wide opacity-80">
              {perfil.regional_codigo.replace(/_/g, ".")}
            </p>
          </div>
        </div>
        <IndicadorConexao regional={perfil.regional_codigo} />
      </header>

      <main className="mx-auto box-border w-full max-w-3xl flex-1 px-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] pt-4">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-[1100] border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl">
          {itensMenu.map((item) => {
              const ativo =
                item.para === "/" ? caminho === "/" : caminho.startsWith(item.para);
              const Icone = item.icone;
              return (
                <Link
                  key={item.para}
                  to={item.para}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold",
                    ativo ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <Icone className="size-5" strokeWidth={ativo ? 2.4 : 1.8} />
                  {item.rotulo}
                </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );

}
