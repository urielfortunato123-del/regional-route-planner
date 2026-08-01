import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import {
  CalendarRange,
  CloudOff,
  Home,
  Map,
  RefreshCw,
  Route as RouteIcon,
  Settings,
  Wifi,
} from "lucide-react";

import type { PerfilLocal } from "@/lib/perfil-local";
import { limparOutrasRegionais } from "@/lib/offline/db";
import { useSincronizacao } from "@/lib/offline/sync";
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
  { para: "/configuracoes", rotulo: "Ajustes", icone: Settings },
] as const;

/** Faixa fixa de estado da conexão e da fila de envio. */
export function IndicadorConexao({ regional }: { regional: string }) {
  const { online, pendentes, sincronizando, sincronizar } = useSincronizacao(regional);
  if (online && pendentes === 0) return null;
  return (
    <button
      onClick={() => void sincronizar()}
      className={cn(
        "flex w-full items-center justify-center gap-2 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide",
        online ? "bg-warning/25 text-warning-foreground" : "bg-destructive/20 text-destructive",
      )}
    >
      {online ? <Wifi className="size-3.5" /> : <CloudOff className="size-3.5" />}
      {online
        ? `${pendentes} alteração(ões) aguardando envio`
        : `Sem conexão — trabalhando offline${pendentes ? ` (${pendentes} na fila)` : ""}`}
      {online ? (
        <RefreshCw className={cn("size-3.5", sincronizando && "animate-spin")} />
      ) : null}
    </button>
  );
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
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-20 border-b border-border bg-primary text-primary-foreground">
        <div className="faixa-rodoviaria h-1 w-full" />
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
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

      <main className="mx-auto max-w-3xl px-4 py-4">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur">
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
