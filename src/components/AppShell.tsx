import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { CalendarRange, Home, Map, Settings, Upload } from "lucide-react";

import type { PerfilLocal } from "@/lib/perfil-local";
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
  { para: "/programacao/importar", rotulo: "Importar", icone: Upload },
  { para: "/configuracoes", rotulo: "Ajustes", icone: Settings },
] as const;

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
  const podeImportar = perfil.role !== "funcionario";

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
            <p className="text-[10px] uppercase tracking-wide opacity-80">{perfil.role}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl">
          {itensMenu
            .filter((item) => item.para !== "/programacao/importar" || podeImportar)
            .map((item) => {
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
