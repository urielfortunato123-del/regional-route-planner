/**
 * Checklist automático das 12 etapas do pipeline, lido e gravado no banco.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck, Wrench } from "lucide-react";

import { Botao, Cartao, Etiqueta } from "@/components/AppShell";
import {
  atualizarEtapasDivergentes,
  checklistPersistido,
  executarChecklistPipeline,
} from "@/lib/pipeline/checklist";
import type { EtapaChecklist, StatusEtapa } from "@/lib/pipeline/etapas";

const TOM: Record<StatusEtapa, "ok" | "alerta" | "erro" | "neutro"> = {
  PENDENTE: "neutro",
  VALIDANDO: "neutro",
  OK: "ok",
  CORRIGIDO: "ok",
  DIVERGENTE: "alerta",
  ERRO: "erro",
};

const dataHora = (v?: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

export function ChecklistPipeline({
  funcionarioId,
  importacaoId,
  regionalCodigo,
  dia,
  aoAtualizar,
  aoMudarChecklist,
}: {
  funcionarioId: string;
  importacaoId: string | null;
  regionalCodigo: string;
  dia?: string | null;
  aoAtualizar?: () => void;
  aoMudarChecklist?: (etapas: EtapaChecklist[]) => void;
}) {
  const consulta = useQuery({
    queryKey: ["checklist-pipeline", importacaoId, funcionarioId],
    queryFn: async () => {
      const r = await checklistPersistido({ funcionarioId, importacaoId });
      aoMudarChecklist?.(r.checklist);
      return r;
    },
  });

  const validar = useMutation({
    mutationFn: () =>
      executarChecklistPipeline({ funcionarioId, importacaoId, regionalCodigo, dia: dia ?? null }),
    onSuccess: (r) => {
      aoMudarChecklist?.(r.checklist);
      consulta.refetch();
      aoAtualizar?.();
      if (r.criticasDivergentes.length)
        toast.error(`${r.criticasDivergentes.length} etapa(s) crítica(s) divergente(s).`);
      else if (r.pendenciasNaoCriticas.length)
        toast.warning(`Pipeline sem bloqueios, ${r.pendenciasNaoCriticas.length} pendência(s).`);
      else toast.success("Pipeline validado: todas as etapas conferem.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const corrigir = useMutation({
    mutationFn: () =>
      atualizarEtapasDivergentes({ funcionarioId, importacaoId, regionalCodigo, dia: dia ?? null }),
    onSuccess: (r) => {
      aoMudarChecklist?.(r.checklist);
      consulta.refetch();
      aoAtualizar?.();
      if (!r.reprocessadas.length) toast.info("Nenhuma etapa divergente para reprocessar.");
      else toast.success(`${r.reprocessadas.length} etapa(s) reprocessada(s).`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const checklist = consulta.data?.checklist ?? [];
  const ocupado = validar.isPending || corrigir.isPending;
  const divergentes = checklist.filter((e) => e.status === "DIVERGENTE" || e.status === "ERRO");

  return (
    <Cartao>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide">Checklist do pipeline</h2>
        <div className="flex flex-wrap gap-2">
          <Botao onClick={() => validar.mutate()} disabled={ocupado}>
            {validar.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShieldCheck className="size-4" />
            )}
            Validar pipeline
          </Botao>
          <Botao
            variante="contorno"
            onClick={() => corrigir.mutate()}
            disabled={ocupado || !divergentes.length}
          >
            {corrigir.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Wrench className="size-4" />
            )}
            Atualizar etapas divergentes
          </Botao>
          <Botao variante="contorno" onClick={() => consulta.refetch()} disabled={ocupado}>
            <RefreshCw className="size-4" />
            Recarregar
          </Botao>
        </div>
      </div>

      {consulta.isPending ? (
        <p className="text-sm text-muted-foreground">Carregando checklist gravado…</p>
      ) : !checklist.length ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma validação registrada ainda. Toque em “Validar pipeline” para executar as 12
          etapas com os dados gravados.
        </p>
      ) : (
        <ul className="space-y-2">
          {checklist.map((e) => (
            <li key={e.etapa} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  {e.status === "OK" || e.status === "CORRIGIDO" ? (
                    <CheckCircle2 className="size-4 text-primary" />
                  ) : e.status === "PENDENTE" ? (
                    <RefreshCw className="size-4 text-muted-foreground" />
                  ) : (
                    <AlertTriangle className="size-4 text-destructive" />
                  )}
                  {e.ordem}. {e.rotulo}
                </p>
                <div className="flex items-center gap-2">
                  {e.critica ? <Etiqueta tom="neutro">crítica</Etiqueta> : null}
                  <Etiqueta tom={TOM[e.status]}>{e.status}</Etiqueta>
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                esperado {e.esperado} × encontrado {e.encontrado}
                {e.divergencia ? ` · diferença ${e.divergencia}` : ""} · validado em{" "}
                {dataHora(e.validadoEm)}
              </p>
              {e.motivo ? <p className="mt-1 text-xs">{e.motivo}</p> : null}
              {e.registros.length ? (
                <p className="mt-1 break-all text-[11px] text-muted-foreground">
                  Registros: {e.registros.slice(0, 20).join(", ")}
                  {e.registros.length > 20 ? ` … (+${e.registros.length - 20})` : ""}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}
