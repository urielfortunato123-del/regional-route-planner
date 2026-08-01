import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Filter, MapPin, Search } from "lucide-react";

import { AppShell, Botao, Cartao, Etiqueta, estiloEntrada } from "@/components/AppShell";
import { Identificacao } from "@/components/Identificacao";
import { usePerfilLocal } from "@/lib/perfil-local";
import { atualizarStatus, listarProgramacoes } from "@/lib/programacao.functions";
import { guardarProgramacoes, lerProgramacoes, registrarFiscalizacao } from "@/lib/offline/db";
import { enfileirar } from "@/lib/offline/sync";

export const Route = createFileRoute("/programacao/")({
  head: () => ({
    meta: [
      { title: "Programação da regional | Roteirização Regional" },
      {
        name: "description",
        content:
          "Lista dos serviços programados da sua regional, com filtros por data, rodovia, equipe, atividade e situação.",
      },
      { property: "og:title", content: "Programação da regional" },
      {
        property: "og:description",
        content: "Serviços programados filtrados pela regional do funcionário.",
      },
    ],
  }),
  component: ProgramacaoPagina,
});

const VISOES = [
  { id: "hoje", rotulo: "Hoje" },
  { id: "amanha", rotulo: "Amanhã" },
  { id: "semana", rotulo: "Esta semana" },
  { id: "todas", rotulo: "Todas" },
  { id: "concluidas", rotulo: "Concluídas" },
  { id: "pendentes", rotulo: "Pendentes" },
] as const;

type Visao = (typeof VISOES)[number]["id"];

function formatarKm(valor: number | null) {
  if (valor === null || valor === undefined) return "—";
  return `km ${Number(valor).toFixed(3).replace(".", ",")}`;
}

function ProgramacaoPagina() {
  const { perfil, carregado, salvar } = usePerfilLocal();
  const cliente = useQueryClient();

  const [visao, setVisao] = useState<Visao>("hoje");
  const [somenteMeus, setSomenteMeus] = useState(false);
  const [busca, setBusca] = useState("");
  const [rodovia, setRodovia] = useState("");
  const [equipe, setEquipe] = useState("");
  const [atividade, setAtividade] = useState("");
  const [contrato, setContrato] = useState("");
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  const consulta = useQuery({
    queryKey: [
      "programacoes",
      perfil?.id,
      visao,
      somenteMeus,
      busca,
      rodovia,
      equipe,
      atividade,
      contrato,
    ],
    enabled: !!perfil?.id,
    queryFn: () =>
      listarProgramacoes({
        data: {
          funcionarioId: perfil!.id,
          visao,
          somenteMeus,
          ...(busca ? { busca } : {}),
          ...(rodovia ? { rodovia } : {}),
          ...(equipe ? { equipe } : {}),
          ...(atividade ? { atividade } : {}),
          ...(contrato ? { contrato } : {}),
        },
      }),
  });

  const mudarStatus = useMutation({
    mutationFn: async (v: {
      id: string;
      status: "concluido" | "na_rota" | "pendente";
      assumir?: boolean;
    }) => {
      const payload = {
        funcionarioId: perfil!.id,
        programacaoId: v.id,
        status: v.status,
        assumir: v.assumir ?? false,
      };
      await registrarFiscalizacao({
        regional_codigo: perfil!.regional_codigo,
        programacao_id: v.id,
        status: v.status,
        observacao: null,
        latitude: null,
        longitude: null,
        criadoEm: Date.now(),
        sincronizado: 0,
      });
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await enfileirar({
          regional_codigo: perfil!.regional_codigo,
          tipo: "status",
          payload,
          descricao: `Situação: ${v.status}`,
        });
        return;
      }
      await atualizarStatus({ data: payload });
    },
    onSuccess: () => {
      toast.success("Situação atualizada.");
      cliente.invalidateQueries({ queryKey: ["programacoes"] });
      cliente.invalidateQueries({ queryKey: ["resumo"] });
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  const [cache, setCache] = useState<Array<Record<string, never>>>([]);

  // Espelho local: a lista continua visível em campo, sem sinal.
  useEffect(() => {
    if (!perfil) return;
    if (consulta.data?.registros) {
      void guardarProgramacoes(
        perfil.regional_codigo,
        consulta.data.registros as unknown as Array<Record<string, unknown>>,
      );
    } else if (consulta.isError) {
      void lerProgramacoes(perfil.regional_codigo).then((r) =>
        setCache(r as unknown as Array<Record<string, never>>),
      );
    }
  }, [consulta.data, consulta.isError, perfil]);

  if (!carregado) return <div className="min-h-screen bg-background" />;
  if (!perfil) return <Identificacao aoConcluir={salvar} />;

  const registros = consulta.data?.registros ?? (cache as unknown as never[]);

  return (
    <AppShell perfil={perfil} titulo="Programação">
      <div className="space-y-4">
        <div className="-mx-4 overflow-x-auto px-4">
          <div className="flex gap-2">
            {VISOES.map((v) => (
              <button
                key={v.id}
                onClick={() => setVisao(v.id)}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  visao === v.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface text-muted-foreground"
                }`}
              >
                {v.rotulo}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className={`${estiloEntrada} pl-9`}
              placeholder="Buscar rodovia, atividade, descrição..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <Botao variante="contorno" onClick={() => setFiltrosAbertos((v) => !v)}>
            <Filter className="size-4" />
          </Botao>
        </div>

        {filtrosAbertos ? (
          <Cartao className="grid gap-3 sm:grid-cols-2">
            <input className={estiloEntrada} placeholder="Rodovia" value={rodovia} onChange={(e) => setRodovia(e.target.value)} />
            <input className={estiloEntrada} placeholder="Equipe" value={equipe} onChange={(e) => setEquipe(e.target.value)} />
            <input className={estiloEntrada} placeholder="Atividade" value={atividade} onChange={(e) => setAtividade(e.target.value)} />
            <input className={estiloEntrada} placeholder="Contrato" value={contrato} onChange={(e) => setContrato(e.target.value)} />
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-primary)]"
                checked={somenteMeus}
                onChange={(e) => setSomenteMeus(e.target.checked)}
              />
              Minha programação
            </label>
          </Cartao>
        ) : null}

        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {consulta.isFetching
            ? "Carregando..."
            : `${registros.length} serviço(s) — ${perfil.regional_rotulo}`}
        </p>

        {!consulta.isFetching && registros.length === 0 ? (
          <Cartao className="text-center text-sm text-muted-foreground">
            Nenhum serviço encontrado para este filtro.
          </Cartao>
        ) : null}

        <div className="space-y-3">
          {registros.map((r) => (
            <Cartao key={r.id} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-lg font-semibold">{r.rodovia ?? "Rodovia não informada"}</span>
                <Etiqueta tom={r.status === "concluido" ? "ok" : r.status === "pendente" ? "neutro" : "destaque"}>
                  {r.status.replace(/_/g, " ")}
                </Etiqueta>
                {!r.regional_confirmada ? <Etiqueta tom="erro">Regional não confirmada</Etiqueta> : null}
              </div>

              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="size-4" />
                {formatarKm(r.km_inicial)} ao {formatarKm(r.km_final)}
              </p>

              {r.descricao ? <p className="text-sm">{r.descricao}</p> : null}

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {r.atividade ? <span>Atividade: {r.atividade}</span> : null}
                {r.equipe ? <span>Equipe: {r.equipe}</span> : null}
                {r.funcionario ? <span>Resp.: {r.funcionario}</span> : null}
                {r.contrato ? <span>Contrato: {r.contrato}</span> : null}
                {r.data_inicial ? (
                  <span>
                    Data: {r.data_inicial.split("-").reverse().join("/")}
                    {r.data_final && r.data_final !== r.data_inicial
                      ? ` a ${r.data_final.split("-").reverse().join("/")}`
                      : ""}
                  </span>
                ) : null}
                {r.medicao ? <span>Medição: {r.medicao}</span> : null}
                {r.pagina_pdf ? <span>PDF pág. {r.pagina_pdf}</span> : null}
              </div>

              {r.assumido_por ? (
                <p className="rounded-md bg-warning/15 px-2 py-1 text-xs text-warning-foreground">
                  Serviço assumido por {r.assumido_por}
                  {r.assumido_em ? ` às ${new Date(r.assumido_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2 pt-1">
                <Botao
                  variante="contorno"
                  className="h-9 min-h-9 text-xs"
                  disabled={mudarStatus.isPending}
                  onClick={() => mudarStatus.mutate({ id: r.id, status: "na_rota", assumir: true })}
                >
                  Adicionar à rota
                </Botao>
                <Botao
                  variante={r.status === "concluido" ? "secundario" : "primario"}
                  className="h-9 min-h-9 text-xs"
                  disabled={mudarStatus.isPending}
                  onClick={() =>
                    mudarStatus.mutate({
                      id: r.id,
                      status: r.status === "concluido" ? "pendente" : "concluido",
                      assumir: true,
                    })
                  }
                >
                  <CheckCircle2 className="size-4" />
                  {r.status === "concluido" ? "Reabrir" : "Concluir"}
                </Botao>
              </div>
            </Cartao>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
