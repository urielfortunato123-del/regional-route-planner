import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MapPin,
  PlugZap,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { AppShell, Botao, Cartao, Etiqueta } from "@/components/AppShell";
import { Identificacao } from "@/components/Identificacao";
import { usePerfilLocal } from "@/lib/perfil-local";
import { auditarImportacao } from "@/lib/auditoria.functions";
import {
  testarPersistenciaOffline,
  validatePipelineConsistency,
  type ResultadoConsistencia,
  type ResultadoTesteOffline,
} from "@/lib/pipeline/consistencia";
import { processPendingGeometries } from "@/lib/geometria/job";
import { rotuloStatusGeometria } from "@/lib/geometria/status";

export const Route = createFileRoute("/importacoes/auditoria/$id")({
  head: () => ({
    meta: [
      { title: "Auditoria da importação | Roteirização Regional" },
      {
        name: "description",
        content:
          "Acompanhe o caminho de cada serviço do PDF até a rota: linhas lidas, gravadas, localizadas e exibidas em cada tela.",
      },
      { property: "og:title", content: "Auditoria da importação" },
      {
        property: "og:description",
        content: "Diagnóstico registro a registro do pipeline de programação e roteirização.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuditoriaPagina,
});

const dataHora = (valor?: string | null) =>
  valor ? new Date(valor).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

function Numero({ rotulo, valor, alerta }: { rotulo: string; valor: number; alerta?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className={`text-2xl font-bold ${alerta ? "text-destructive" : "text-foreground"}`}>
        {valor}
      </p>
    </div>
  );
}

function AuditoriaPagina() {
  const { id } = Route.useParams();
  const { perfil, carregado, salvar } = usePerfilLocal();
  const [consistencia, setConsistencia] = useState<ResultadoConsistencia | null>(null);
  const [offline, setOffline] = useState<ResultadoTesteOffline | null>(null);
  const [filtro, setFiltro] = useState<"todos" | "bloqueados" | "sem_geometria">("todos");

  const auditoria = useQuery({
    queryKey: ["auditoria", id, perfil?.id],
    enabled: Boolean(perfil?.id),
    queryFn: () => auditarImportacao({ data: { funcionarioId: perfil!.id, importacaoId: id } }),
  });

  const validar = useMutation({
    mutationFn: () =>
      validatePipelineConsistency({
        funcionarioId: perfil!.id,
        importacaoId: id,
        regionalCodigo: perfil!.regional_codigo,
        registrar: true,
      }),
    onSuccess: (r) => {
      setConsistencia(r);
      auditoria.refetch();
      if (r.divergencias.length) toast.warning(`${r.divergencias.length} divergência(s) encontrada(s).`);
      else toast.success("Pipeline consistente: nenhum serviço se perdeu.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const teste = useMutation({
    mutationFn: () => testarPersistenciaOffline({ regionalCodigo: perfil!.regional_codigo }),
    onSuccess: (r) => {
      setOffline(r);
      if (r.status === "reprovado") toast.error(`${r.naoRecuperados.length} serviço(s) não voltaram após reabrir.`);
      else toast.success("Dados recuperados do aparelho sem reler o PDF.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const geometria = useMutation({
    mutationFn: () => processPendingGeometries({ funcionarioId: perfil!.id, importacaoId: id }),
    onSuccess: (r) => {
      toast.success(`${r.concluidos} localizado(s), ${r.comErro} pendente(s) de revisão.`);
      auditoria.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const registros = useMemo(() => {
    const lista = auditoria.data?.registros ?? [];
    if (filtro === "bloqueados") return lista.filter((r) => !r.elegivel_rota);
    if (filtro === "sem_geometria") return lista.filter((r) => r.latitude_inicial == null);
    return lista;
  }, [auditoria.data, filtro]);

  if (!carregado) return null;
  if (!perfil) return <Identificacao aoConcluir={salvar} />;

  const etapas = auditoria.data?.etapas;
  const importacao = auditoria.data?.importacao;

  return (
    <AppShell perfil={perfil} titulo="Auditoria da importação">
      <div className="space-y-4 pb-24">
        <Cartao>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">{importacao?.nome_arquivo ?? "Importação"}</p>
              <p className="text-xs text-muted-foreground">
                Versão da programação {importacao?.programacao_versao ?? 1} · lida em{" "}
                {dataHora(importacao?.criado_em)} · confirmada em {dataHora(importacao?.confirmado_em)}
              </p>
              <p className="text-xs text-muted-foreground">
                Última validação: {dataHora(importacao?.ultima_validacao_em)}
              </p>
            </div>
            <Link to="/importacoes/$id" params={{ id }} className="text-sm font-semibold text-primary">
              Abrir conferência
            </Link>
          </div>
        </Cartao>

        <Cartao>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide">Caminho dos serviços</h2>
          {auditoria.isPending ? (
            <p className="text-sm text-muted-foreground">Carregando contagens do banco…</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Numero rotulo="Páginas do PDF" valor={etapas?.paginasPdf ?? 0} />
              <Numero rotulo="Linhas lidas" valor={etapas?.linhasBrutas ?? 0} />
              <Numero rotulo="Em conferência" valor={etapas?.linhasConferencia ?? 0} />
              <Numero rotulo="Rejeitadas" valor={etapas?.linhasRejeitadas ?? 0} alerta={(etapas?.linhasRejeitadas ?? 0) > 0} />
              <Numero rotulo="Gravadas no banco" valor={etapas?.registrosSalvos ?? 0} />
              <Numero rotulo="Da sua regional" valor={etapas?.servicosRegionalAtual ?? 0} />
              <Numero rotulo="Na Programação" valor={etapas?.exibidosProgramacao ?? 0} />
              <Numero rotulo="No Mapa" valor={etapas?.exibidosMapa ?? 0} />
              <Numero rotulo="Com geometria" valor={etapas?.comGeometria ?? 0} />
              <Numero
                rotulo="Aguardando localização"
                valor={etapas?.aguardandoLocalizacao ?? 0}
                alerta={(etapas?.aguardandoLocalizacao ?? 0) > 0}
              />
              <Numero rotulo="Elegíveis para rota" valor={etapas?.elegiveisRota ?? 0} />
              <Numero rotulo="Concluídos" valor={etapas?.concluidos ?? 0} />
            </div>
          )}

          {auditoria.data?.porRegional.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {auditoria.data.porRegional.map((r) => (
                <Etiqueta key={r.codigo} tom={r.codigo === perfil.regional_codigo ? "ok" : "neutro"}>
                  {r.codigo}: {r.total}
                </Etiqueta>
              ))}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Botao onClick={() => validar.mutate()} disabled={validar.isPending}>
              {validar.isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              Validar pipeline
            </Botao>
            <Botao variante="contorno" onClick={() => geometria.mutate()} disabled={geometria.isPending}>
              {geometria.isPending ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
              Localizar pendentes
            </Botao>
            <Botao variante="contorno" onClick={() => teste.mutate()} disabled={teste.isPending}>
              {teste.isPending ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
              Testar persistência offline
            </Botao>
            <Botao variante="contorno" onClick={() => auditoria.refetch()}>
              <RefreshCw className="size-4" />
              Atualizar
            </Botao>
          </div>
        </Cartao>

        {consistencia ? (
          <Cartao>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">Resultado da validação</h2>
            {consistencia.divergencias.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-foreground">
                <CheckCircle2 className="size-4 text-primary" />
                Todos os {consistencia.totalRegional} serviços da regional estão gravados, salvos no aparelho e
                visíveis nas telas.
              </p>
            ) : (
              <ul className="space-y-2">
                {consistencia.divergencias.map((d, i) => (
                  <li key={i} className="rounded-lg border border-border bg-surface p-3 text-sm">
                    <p className="flex items-center gap-2 font-semibold">
                      <AlertTriangle className="size-4 text-destructive" />
                      {d.etapa}: {d.esperado} esperados × {d.encontrado} encontrados ({d.diferenca} de diferença)
                    </p>
                    <p className="text-xs text-muted-foreground">{d.detalhe}</p>
                    {d.registros.length ? (
                      <p className="mt-1 break-all text-[11px] text-muted-foreground">
                        Registros: {d.registros.join(", ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Salvos no aparelho: {consistencia.totalLocal} · rotas locais: {consistencia.rotasLocais} · validado em{" "}
              {dataHora(consistencia.validadoEm)}
            </p>
          </Cartao>
        ) : null}

        {offline ? (
          <Cartao>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">Teste de persistência offline</h2>
            <p className="text-sm">
              {offline.status === "aprovado"
                ? "Aprovado: tudo voltou do aparelho, sem reler o PDF."
                : offline.status === "aprovado_com_avisos"
                  ? "Aprovado com avisos."
                  : "Reprovado: houve perda de dados ao reabrir."}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Numero rotulo="Programação (antes/depois)" valor={offline.depois.programacao} alerta={offline.antes.programacao !== offline.depois.programacao} />
              <Numero rotulo="Mapa" valor={offline.depois.mapa} alerta={offline.antes.mapa !== offline.depois.mapa} />
              <Numero rotulo="Rota" valor={offline.depois.rota} alerta={offline.antes.rota !== offline.depois.rota} />
              <Numero rotulo="Geometrias salvas" valor={offline.geometriasSalvas} />
            </div>
            {offline.divergencias.length ? (
              <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                {offline.divergencias.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">
              Executado em {dataHora(offline.executadoEm)} · {offline.duracaoMs} ms
            </p>
          </Cartao>
        ) : null}

        <Cartao>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide">Diagnóstico por registro</h2>
            <div className="flex gap-2">
              {(
                [
                  ["todos", "Todos"],
                  ["bloqueados", "Fora da rota"],
                  ["sem_geometria", "Sem coordenada"],
                ] as const
              ).map(([valor, rotulo]) => (
                <button
                  key={valor}
                  onClick={() => setFiltro(valor)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold ${
                    filtro === valor ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground"
                  }`}
                >
                  {rotulo}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="p-2">Pág</th>
                  <th className="p-2">Serviço</th>
                  <th className="p-2">Regional</th>
                  <th className="p-2">Persistência</th>
                  <th className="p-2">Geometria</th>
                  <th className="p-2">Programação</th>
                  <th className="p-2">Mapa</th>
                  <th className="p-2">Rota</th>
                  <th className="p-2">Motivo</th>
                  <th className="p-2">Atualizado</th>
                </tr>
              </thead>
              <tbody>
                {registros.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="p-2">{r.pagina_pdf ?? "—"}</td>
                    <td className="p-2">
                      <p className="font-semibold">
                        {r.rodovia ?? "—"} km {r.km_inicial ?? "—"}
                        {r.km_final != null ? ` a ${r.km_final}` : ""}
                      </p>
                      <p className="line-clamp-2 text-muted-foreground">{r.texto_original ?? ""}</p>
                    </td>
                    <td className="p-2">{r.regional_codigo ?? "não identificada"}</td>
                    <td className="p-2">
                      {r.status_persistencia === "persistido" ? "Gravado" : "Em conferência"}
                    </td>
                    <td className="p-2">{rotuloStatusGeometria(r.status_geometria)}</td>
                    <td className="p-2">{r.na_programacao ? "Sim" : "Não"}</td>
                    <td className="p-2">{r.no_mapa ? "Sim" : "Não"}</td>
                    <td className="p-2">{r.elegivel_rota ? "Sim" : "Não"}</td>
                    <td className="p-2 text-muted-foreground">{r.motivo_bloqueio ?? "—"}</td>
                    <td className="p-2 text-muted-foreground">{dataHora(r.atualizado_em)}</td>
                  </tr>
                ))}
                {registros.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-4 text-center text-muted-foreground">
                      Nenhum registro nesse filtro.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Cartao>
      </div>
    </AppShell>
  );
}
