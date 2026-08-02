/**
 * Teste de contingência: simula o servidor oficial do DER-SP fora do ar e
 * confere que nenhum serviço é perdido, removido ou duplicado.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, WifiOff } from "lucide-react";

import { Botao, Cartao, Etiqueta } from "@/components/AppShell";
import { listarSimulacoesDer } from "@/lib/pipeline.functions";
import { simularQuedaDoDer } from "@/lib/pipeline/simulacao-der";
import type { FalhaSimuladaDer } from "@/services/derMapService";

const OPCOES: Array<{ valor: FalhaSimuladaDer; rotulo: string }> = [
  { valor: "indisponivel", rotulo: "Servidor fora do ar" },
  { valor: "http_403", rotulo: "Bloqueio HTTP 403" },
  { valor: "timeout", rotulo: "Tempo esgotado" },
];

const dataHora = (v?: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

export function SimulacaoDer({
  funcionarioId,
  importacaoId,
  aoConcluir,
}: {
  funcionarioId: string;
  importacaoId: string | null;
  aoConcluir?: () => void;
}) {
  const [tipo, setTipo] = useState<FalhaSimuladaDer>("indisponivel");

  const historico = useQuery({
    queryKey: ["simulacoes-der", importacaoId, funcionarioId],
    queryFn: () => listarSimulacoesDer({ data: { funcionarioId, importacaoId } }),
  });

  const simular = useMutation({
    mutationFn: () => simularQuedaDoDer({ funcionarioId, importacaoId, tipoFalha: tipo }),
    onSuccess: (r) => {
      historico.refetch();
      aoConcluir?.();
      if (r.resultado === "reprovado") toast.error(r.observacoes);
      else if (r.resultado === "aprovado_com_avisos") toast.warning(r.observacoes);
      else toast.success(r.observacoes);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ultimo = simular.data;
  const lista = historico.data?.simulacoes ?? [];

  return (
    <Cartao>
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">
        Teste de contingência do DER-SP
      </h2>
      <p className="text-xs text-muted-foreground">
        Bloqueia as consultas ao servidor oficial por alguns instantes e verifica se o aplicativo
        continua funcionando com a base local. Nada é apagado: a localização não é gravada durante
        o teste.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as FalhaSimuladaDer)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        >
          {OPCOES.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>
        <Botao onClick={() => simular.mutate()} disabled={simular.isPending}>
          {simular.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <WifiOff className="size-4" />
          )}
          Simular falha do DER
        </Botao>
      </div>

      {ultimo ? (
        <div className="mt-3 rounded-lg border border-border bg-surface p-3 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            {ultimo.resultado === "reprovado" ? (
              <AlertTriangle className="size-4 text-destructive" />
            ) : (
              <CheckCircle2 className="size-4 text-primary" />
            )}
            {ultimo.resultado.replace(/_/g, " ")}
          </p>
          <p className="text-xs text-muted-foreground">{ultimo.observacoes}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Serviços antes {ultimo.totalAntes} × depois {ultimo.totalDepois} · já localizados{" "}
            {ultimo.jaLocalizados} · atendidos pela base local {ultimo.localizadosFallback} ·
            aguardando {ultimo.aguardando} · com erro {ultimo.comErro} · removidos{" "}
            {ultimo.removidos.length} · duplicados {ultimo.duplicados.length}
          </p>
        </div>
      ) : null}

      {lista.length ? (
        <ul className="mt-3 space-y-1">
          {lista.slice(0, 8).map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs"
            >
              <span>
                {dataHora(s.concluido_em)} · {s.tipo_falha}
              </span>
              <Etiqueta tom={s.resultado === "reprovado" ? "erro" : s.resultado === "aprovado" ? "ok" : "alerta"}>
                {s.resultado.replace(/_/g, " ")}
              </Etiqueta>
            </li>
          ))}
        </ul>
      ) : null}
    </Cartao>
  );
}
