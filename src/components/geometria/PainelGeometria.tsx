/**
 * Painel de notificações do job de geometria: progresso em tempo real e
 * histórico dos serviços localizados ou com erro durante a sessão.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, MapPin, Trash2 } from "lucide-react";

import { Botao, Cartao, Etiqueta } from "@/components/AppShell";
import {
  eventosGeometria,
  limparEventosGeometria,
  observarEventosGeometria,
  observarGeometria,
  progressoGeometria,
  type EventoGeometria,
  type ProgressoJob,
} from "@/lib/geometria/job";
import { ROTULO_GEOMETRIA, ehStatusGeometria } from "@/lib/geometria/status";

const rotulo = (v: string) => (ehStatusGeometria(v) ? ROTULO_GEOMETRIA[v] : v);
const hora = (v: string) => new Date(v).toLocaleTimeString("pt-BR", { timeStyle: "short" });

export function PainelGeometria({ compacto = false }: { compacto?: boolean }) {
  const [progresso, setProgresso] = useState<ProgressoJob>(progressoGeometria());
  const [eventos, setEventos] = useState<EventoGeometria[]>(eventosGeometria());

  useEffect(() => {
    const a = observarGeometria(setProgresso);
    const b = observarEventosGeometria(setEventos);
    return () => {
      a();
      b();
    };
  }, []);

  if (!progresso.emAndamento && !eventos.length) return null;

  return (
    <Cartao>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          {progresso.emAndamento ? (
            <Loader2 className="size-4 animate-spin text-primary" />
          ) : (
            <MapPin className="size-4 text-primary" />
          )}
          {progresso.mensagem}
        </p>
        {eventos.length ? (
          <Botao variante="contorno" onClick={() => limparEventosGeometria()}>
            <Trash2 className="size-4" />
            Limpar avisos
          </Botao>
        ) : null}
      </div>

      {progresso.total ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {progresso.concluidos} localizado(s) · {progresso.comErro} com erro ·{" "}
          {progresso.aguardando} na fila
          {progresso.fonte ? ` · fonte: ${progresso.fonte}` : ""}
        </p>
      ) : null}

      {eventos.length ? (
        <ul className="mt-3 max-h-64 space-y-1 overflow-auto">
          {eventos.slice(0, compacto ? 8 : 60).map((e) => (
            <li
              key={e.id}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-semibold">
                  {e.ok ? (
                    <CheckCircle2 className="size-3.5 text-primary" />
                  ) : (
                    <AlertTriangle className="size-3.5 text-destructive" />
                  )}
                  {e.rotulo}
                </span>
                <span className="flex items-center gap-2">
                  {e.simulacao ? <Etiqueta tom="neutro">simulação</Etiqueta> : null}
                  <Etiqueta tom={e.ok ? "ok" : "erro"}>{rotulo(e.statusNovo)}</Etiqueta>
                </span>
              </div>
              <p className="mt-0.5 text-muted-foreground">
                {hora(e.em)} · {rotulo(String(e.statusAnterior))} → {rotulo(e.statusNovo)} ·{" "}
                {e.mensagem}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </Cartao>
  );
}
