import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Copy, FileDown, Loader2, Pencil, RotateCcw, Trash2 } from "lucide-react";

import { AppShell, Botao, Cartao, Etiqueta, estiloEntrada } from "@/components/AppShell";
import { AcoesImportacao } from "@/components/importacoes/AcoesImportacao";
import { Identificacao } from "@/components/Identificacao";
import { usePerfilLocal } from "@/lib/perfil-local";
import { REGIONAIS, rotuloRegional } from "@/lib/regionais";
import {
  acaoRegistroImportacao,
  confirmarImportacao,
  duplicarImportacao,
  editarRegistroImportacao,
  obterImportacao,
  urlPdfImportacao,
} from "@/lib/importacoes.functions";

export const Route = createFileRoute("/importacoes/$id")({
  head: () => ({
    meta: [
      { title: "Conferência da importação | Roteirização Regional" },
      {
        name: "description",
        content:
          "Confira linha a linha o que foi lido do PDF, corrija o que for necessário e só então libere para a programação.",
      },
      { property: "og:title", content: "Conferência da importação" },
      {
        property: "og:description",
        content: "Registros ficam em conferência até a aprovação manual, agrupados por regional.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConferenciaPagina,
});

type Registro = {
  id: string;
  regional_codigo: string | null;
  equipe: string | null;
  funcionario: string | null;
  categoria: string | null;
  contrato: string | null;
  atividade: string | null;
  rodovia: string | null;
  km_inicial: number | null;
  km_final: number | null;
  descricao: string | null;
  data_inicial: string | null;
  data_final: string | null;
  medicao: string | null;
  observacao: string | null;
  pagina_pdf: number;
  texto_original: string | null;
  duplicado: boolean | null;
  status_validacao: string;
  motivos: string[] | null;
  programacao_id?: string | null;

  foi_corrigido: boolean | null;
};

const CAMPOS: Array<{ chave: keyof Registro; rotulo: string; tipo?: "numero" | "data" }> = [
  { chave: "equipe", rotulo: "Equipe" },
  { chave: "funcionario", rotulo: "Funcionário" },
  { chave: "categoria", rotulo: "Categoria" },
  { chave: "contrato", rotulo: "Contrato" },
  { chave: "atividade", rotulo: "Atividade" },
  { chave: "rodovia", rotulo: "Rodovia" },
  { chave: "km_inicial", rotulo: "Km inicial", tipo: "numero" },
  { chave: "km_final", rotulo: "Km final", tipo: "numero" },
  { chave: "data_inicial", rotulo: "Data inicial", tipo: "data" },
  { chave: "data_final", rotulo: "Data final", tipo: "data" },
  { chave: "descricao", rotulo: "Descrição" },
  { chave: "medicao", rotulo: "Medição" },
  { chave: "observacao", rotulo: "Observação" },
];

function ConferenciaPagina() {
  const { id } = Route.useParams();
  const { perfil, carregado, salvar } = usePerfilLocal();
  const navegar = useNavigate();
  const fila = useQueryClient();
  const [filtro, setFiltro] = useState<"todos" | "revisar" | "valido" | "duplicado" | "rejeitado">("todos");
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Partial<Registro>>({});

  const consulta = useQuery({
    queryKey: ["importacao", id, perfil?.id],
    enabled: !!perfil,
    queryFn: () => obterImportacao({ data: { funcionarioId: perfil!.id, importacaoId: id } }),
  });

  const registros = (consulta.data?.registros ?? []) as unknown as Registro[];
  const importacao = consulta.data?.importacao as
    | {
        id: string;
        nome_arquivo: string;
        status: string;
        versao: number | null;
        periodo_inicio: string | null;
        periodo_fim: string | null;
        criado_em: string;
        usuario_nome: string | null;
        caminho_arquivo: string | null;
      }
    | undefined;

  const recarregar = () => void fila.invalidateQueries({ queryKey: ["importacao", id] });

  const salvarCampos = useMutation({
    mutationFn: (dados: { registroId: string; campos: Record<string, unknown> }) =>
      editarRegistroImportacao({
        data: { funcionarioId: perfil!.id, registroId: dados.registroId, campos: dados.campos },
      }),
    onSuccess: () => {
      toast.success("Linha atualizada.");
      setEditando(null);
      setRascunho({});
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const acao = useMutation({
    mutationFn: (dados: { registroId: string; acao: "confirmar" | "revisar" | "excluir" | "restaurar" }) =>
      acaoRegistroImportacao({ data: { funcionarioId: perfil!.id, ...dados } }),
    onSuccess: () => recarregar(),
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmar = useMutation({
    mutationFn: () =>
      confirmarImportacao({
        data: { funcionarioId: perfil!.id, importacaoId: id, somenteValidos: false },
      }),
    onSuccess: (r) => {
      toast.success(
        `${r.inseridos} serviço(s) salvos na programação${r.incompletos ? ` (${r.incompletos} ainda precisam de ajuste)` : ""}${r.pendentes ? `; ${r.pendentes} sem regional continuam em conferência` : ""}.`,
      );
      recarregar();
      void fila.invalidateQueries();
      if (r.inseridos > 0) void navegar({ to: "/programacao" });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const novaVersao = useMutation({
    mutationFn: () => duplicarImportacao({ data: { funcionarioId: perfil!.id, importacaoId: id } }),
    onSuccess: (r) => {
      toast.success(
        `Nova versão ${r.versao} criada${r.rotasAfetadas ? ` — ${r.rotasAfetadas} rota(s) usam a versão anterior` : ""}.`,
      );
      void navegar({ to: "/importacoes/$id", params: { id: r.importacaoId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const abrirPdf = useMutation({
    mutationFn: () => urlPdfImportacao({ data: { funcionarioId: perfil!.id, importacaoId: id } }),
    onSuccess: (r) => {
      if (r.url) window.open(r.url, "_blank", "noopener");
      else toast.error("O PDF original não está guardado nesta importação.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const grupos = useMemo(() => {
    const filtrados = registros.filter((r) => {
      if (filtro === "todos") return r.status_validacao !== "rejeitado";
      if (filtro === "duplicado") return !!r.duplicado;
      if (filtro === "valido") return r.status_validacao === "valido" || r.status_validacao === "confirmado";
      if (filtro === "rejeitado") return r.status_validacao === "rejeitado";
      return r.status_validacao === "revisar" || r.status_validacao === "pendente";
    });
    const mapa = new Map<string, Registro[]>();
    for (const r of filtrados) {
      const chave = r.regional_codigo ?? "SEM_REGIONAL";
      mapa.set(chave, [...(mapa.get(chave) ?? []), r]);
    }
    return [...mapa.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [registros, filtro]);

  const emConferencia = registros.filter(
    (r) => r.status_validacao === "revisar" || r.status_validacao === "pendente",
  ).length;
  const validos = registros.filter((r) => r.status_validacao === "valido").length;
  const jaConfirmados = registros.filter((r) => r.status_validacao === "confirmado").length;
  const aSalvar = registros.filter(
    (r) => r.status_validacao !== "rejeitado" && !r.programacao_id && !!r.regional_codigo,
  ).length;


  if (!carregado) return <div className="min-h-screen bg-background" />;
  if (!perfil) return <Identificacao aoConcluir={salvar} />;

  return (
    <AppShell perfil={perfil} titulo="Conferência do PDF">
      <div className="space-y-4">
        {consulta.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando conferência...
          </p>
        ) : null}

        {importacao ? (
          <Cartao className="space-y-2">
            <h2 className="font-display text-lg font-semibold">{importacao.nome_arquivo}</h2>
            <p className="text-xs text-muted-foreground">
              Importado em {new Date(importacao.criado_em).toLocaleString("pt-BR")}
              {importacao.usuario_nome ? ` por ${importacao.usuario_nome}` : ""} · versão{" "}
              {importacao.versao ?? 1} · situação {importacao.status.replace(/_/g, " ")}
            </p>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-md bg-surface px-2 py-2">
                <p className="font-display text-xl font-bold">{validos}</p>
                <p className="text-xs text-muted-foreground">prontos</p>
              </div>
              <div className="rounded-md bg-surface px-2 py-2">
                <p className="font-display text-xl font-bold">{emConferencia}</p>
                <p className="text-xs text-muted-foreground">em conferência</p>
              </div>
              <div className="rounded-md bg-surface px-2 py-2">
                <p className="font-display text-xl font-bold">{jaConfirmados}</p>
                <p className="text-xs text-muted-foreground">já na programação</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Botao disabled={confirmar.isPending || validos === 0} onClick={() => confirmar.mutate()}>
                <CheckCircle2 className="size-4" />
                {confirmar.isPending ? "Liberando..." : `Confirmar ${validos} linha(s)`}
              </Botao>
              <Botao variante="contorno" onClick={() => abrirPdf.mutate()}>
                <FileDown className="size-4" /> Ver PDF original
              </Botao>
              <Botao variante="contorno" onClick={() => novaVersao.mutate()}>
                <Copy className="size-4" /> Nova versão para editar
              </Botao>
              <Link to="/importacoes">
                <Botao variante="contorno">Histórico</Botao>
              </Link>
            </div>
            <AcoesImportacao
              funcionarioId={perfil.id}
              importacaoId={id}
              nomeArquivo={importacao.nome_arquivo}
              temPdf={importacao.caminho_arquivo != null}
              mostrarConferir={false}
            />

            {emConferencia > 0 ? (
              <p className="flex items-start gap-2 rounded-md bg-warning/15 px-3 py-2 text-xs text-warning-foreground">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                Só as linhas prontas entram na programação. As linhas em conferência continuam aqui
                até você corrigir ou excluir.
              </p>
            ) : null}
          </Cartao>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {(
            [
              ["todos", "Todas"],
              ["revisar", `Em conferência (${emConferencia})`],
              ["valido", "Prontas"],
              ["duplicado", "Repetidas"],
              ["rejeitado", "Excluídas"],
            ] as const
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setFiltro(valor)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                filtro === valor ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        {grupos.map(([codigo, lista]) => (
          <section key={codigo} className="space-y-2">
            <h3 className="font-display text-base font-semibold">
              {codigo === "SEM_REGIONAL" ? "Regional não identificada" : rotuloRegional(codigo)}{" "}
              <span className="text-sm font-normal text-muted-foreground">({lista.length})</span>
            </h3>

            {lista.map((r) => {
              const emEdicao = editando === r.id;
              return (
                <Cartao key={r.id} className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display font-semibold">{r.rodovia ?? "Rodovia?"}</span>
                    <span className="text-sm text-muted-foreground">
                      km {r.km_inicial ?? "?"} → {r.km_final ?? "?"}
                    </span>
                    <Etiqueta
                      tom={
                        r.status_validacao === "valido" || r.status_validacao === "confirmado"
                          ? "ok"
                          : r.status_validacao === "rejeitado"
                            ? "neutro"
                            : "alerta"
                      }
                    >
                      {r.status_validacao === "confirmado"
                        ? "na programação"
                        : r.status_validacao === "valido"
                          ? "pronta"
                          : r.status_validacao === "rejeitado"
                            ? "excluída"
                            : "em conferência"}
                    </Etiqueta>
                    {r.duplicado ? <Etiqueta tom="erro">repetida</Etiqueta> : null}
                    {r.foi_corrigido ? <Etiqueta tom="neutro">corrigida</Etiqueta> : null}
                    <Etiqueta tom="neutro">pág. {r.pagina_pdf}</Etiqueta>
                  </div>

                  <p className="text-sm">{r.atividade ?? "Atividade não identificada"}</p>
                  {r.descricao ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{r.descricao}</p>
                  ) : null}
                  {r.motivos?.length ? (
                    <p className="text-xs text-destructive">{r.motivos.join(" • ")}</p>
                  ) : null}
                  <p className="line-clamp-2 text-[11px] text-muted-foreground">{r.texto_original}</p>

                  {emEdicao ? (
                    <div className="space-y-2 rounded-md bg-surface p-2">
                      <select
                        className={estiloEntrada}
                        value={(rascunho.regional_codigo ?? r.regional_codigo ?? "") as string}
                        onChange={(e) =>
                          setRascunho((v) => ({ ...v, regional_codigo: e.target.value || null }))
                        }
                      >
                        <option value="">Regional não identificada</option>
                        {REGIONAIS.map((reg) => (
                          <option key={reg.codigo} value={reg.codigo}>
                            {reg.rotulo}
                          </option>
                        ))}
                      </select>

                      {CAMPOS.map((campo) => (
                        <label key={campo.chave as string} className="block text-xs">
                          <span className="text-muted-foreground">{campo.rotulo}</span>
                          <input
                            className={estiloEntrada}
                            type={campo.tipo === "data" ? "date" : campo.tipo === "numero" ? "number" : "text"}
                            step={campo.tipo === "numero" ? "0.001" : undefined}
                            value={
                              (rascunho[campo.chave] ?? r[campo.chave] ?? "") as string | number
                            }
                            onChange={(e) =>
                              setRascunho((v) => ({
                                ...v,
                                [campo.chave]:
                                  campo.tipo === "numero"
                                    ? e.target.value === ""
                                      ? null
                                      : Number(e.target.value)
                                    : e.target.value || null,
                              }))
                            }
                          />
                        </label>
                      ))}

                      <div className="flex gap-2">
                        <Botao
                          disabled={salvarCampos.isPending}
                          onClick={() =>
                            salvarCampos.mutate({ registroId: r.id, campos: rascunho as Record<string, unknown> })
                          }
                        >
                          Salvar correções
                        </Botao>
                        <Botao
                          variante="contorno"
                          onClick={() => {
                            setEditando(null);
                            setRascunho({});
                          }}
                        >
                          Fechar
                        </Botao>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Botao
                        variante="contorno"
                        onClick={() => {
                          setEditando(r.id);
                          setRascunho({});
                        }}
                      >
                        <Pencil className="size-4" /> Corrigir
                      </Botao>
                      {r.status_validacao === "rejeitado" ? (
                        <Botao
                          variante="contorno"
                          onClick={() => acao.mutate({ registroId: r.id, acao: "restaurar" })}
                        >
                          <RotateCcw className="size-4" /> Restaurar
                        </Botao>
                      ) : (
                        <>
                          {r.status_validacao !== "confirmado" ? (
                            <Botao onClick={() => acao.mutate({ registroId: r.id, acao: "confirmar" })}>
                              <CheckCircle2 className="size-4" /> Marcar pronta
                            </Botao>
                          ) : null}
                          <Botao
                            variante="perigo"
                            onClick={() => acao.mutate({ registroId: r.id, acao: "excluir" })}
                          >
                            <Trash2 className="size-4" /> Excluir
                          </Botao>
                        </>
                      )}
                    </div>
                  )}
                </Cartao>
              );
            })}
          </section>
        ))}

        {!consulta.isLoading && grupos.length === 0 ? (
          <Cartao>
            <p className="text-sm text-muted-foreground">Nenhuma linha neste filtro.</p>
          </Cartao>
        ) : null}
      </div>
    </AppShell>
  );
}
