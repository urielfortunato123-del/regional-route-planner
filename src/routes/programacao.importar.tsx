import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, FileUp, History, Loader2 } from "lucide-react";

import { AppShell, Botao, Cartao, estiloEntrada } from "@/components/AppShell";
import { Identificacao } from "@/components/Identificacao";
import { usePerfilLocal } from "@/lib/perfil-local";
import { lerProgramacaoPdf, type ResultadoLeitura } from "@/lib/pdf/parser";
import { rotuloRegional } from "@/lib/regionais";
import { criarImportacao, verificarHashImportacao } from "@/lib/importacoes.functions";

export const Route = createFileRoute("/programacao/importar")({
  head: () => ({
    meta: [
      { title: "Importar programação em PDF | Roteirização Regional" },
      {
        name: "description",
        content:
          "Leitura completa do PDF de programação, separação automática por regional e conferência antes de confirmar a importação.",
      },
      { property: "og:title", content: "Importar programação em PDF" },
      {
        property: "og:description",
        content: "Cada linha do PDF é interpretada e fica em conferência até você aprovar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImportarPagina,
});

type Duplicidade = {
  jaImportado: boolean;
  importacoes: Array<{
    id: string;
    nome_arquivo: string;
    status: string;
    versao: number;
    criado_em: string;
    total_registros: number;
    usuario_nome: string | null;
  }>;
};

async function arquivoParaBase64(arquivo: File) {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  let binario = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binario);
}

function ImportarPagina() {
  const { perfil, carregado, salvar } = usePerfilLocal();
  const navegar = useNavigate();

  const [lendo, setLendo] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoLeitura | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [duplicidade, setDuplicidade] = useState<Duplicidade | null>(null);
  const [tipoPeriodo, setTipoPeriodo] = useState("semanal");

  const registros = resultado?.registros ?? [];

  const porRegional = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const r of registros) {
      const chave = r.regional_codigo ?? "SEM_REGIONAL";
      mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
    }
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }, [registros]);

  const comProblema = registros.filter((r) => r.precisaRevisao).length;
  const semRegional = registros.filter((r) => !r.regional_codigo).length;

  const enviar = useMutation({
    mutationFn: () =>
      criarImportacao({
        data: {
          funcionarioId: perfil!.id,
          arquivo: {
            nome: resultado!.nomeArquivo,
            hash: resultado!.hash,
            periodo_inicio: resultado!.periodo.inicio,
            periodo_fim: resultado!.periodo.fim,
            tipo_periodo: tipoPeriodo,
            total_paginas: resultado!.totalPaginas,
            conteudo_base64: base64,
          },
          registros: registros.map((r) => ({
            regional_codigo: r.regional_codigo,
            regional_confirmada: r.regional_confirmada,
            regional_origem: r.regional_origem,
            equipe: r.equipe,
            funcionario: r.funcionario,
            categoria: r.categoria,
            contrato: r.contrato,
            atividade: r.atividade,
            rodovia: r.rodovia,
            km_inicial: r.km_inicial,
            km_final: r.km_final,
            descricao: r.descricao,
            data_inicial: r.data_inicial,
            data_final: r.data_final,
            medicao: r.medicao,
            observacao: r.observacao,
            pagina_pdf: r.pagina_pdf,
            linha_bruta: r.linha_bruta,
          })),
        },
      }),
    onSuccess: (r) => {
      toast.success(`PDF processado: ${r.total} linha(s) em conferência.`);
      void navegar({ to: "/importacoes/$id", params: { id: r.importacaoId } });
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  async function aoSelecionarArquivo(arquivo: File) {
    setLendo(true);
    setResultado(null);
    setBase64(null);
    setDuplicidade(null);
    try {
      const lido = await lerProgramacaoPdf(arquivo, (mensagem) => setProgresso(mensagem));
      setResultado(lido);
      setProgresso("Guardando o arquivo original...");
      setBase64(arquivo.size < 12_000_000 ? await arquivoParaBase64(arquivo) : null);
      const checagem = (await verificarHashImportacao({
        data: { hash: lido.hash },
      })) as Duplicidade;
      setDuplicidade(checagem);
      if (checagem.jaImportado) toast.warning("Este mesmo PDF já foi processado antes.");
      if (lido.registros.length === 0) {
        toast.error("Nenhuma linha de programação foi reconhecida neste PDF.");
      }
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao ler o PDF.");
    } finally {
      setLendo(false);
      setProgresso(null);
    }
  }

  if (!carregado) return <div className="min-h-screen bg-background" />;
  if (!perfil) return <Identificacao aoConcluir={salvar} />;

  return (
    <AppShell perfil={perfil} titulo="Importar programação">
      <div className="space-y-4">
        <Cartao className="space-y-3">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-surface px-4 py-8 text-center">
            <FileUp className="size-8 text-primary" />
            <span className="font-display text-lg font-semibold">Escolher PDF da programação</span>
            <span className="text-xs text-muted-foreground">
              Diária, semanal, quinzenal, mensal ou extraordinária. O arquivo é lido inteiro, fica
              guardado no sistema e nada entra na programação antes da sua conferência.
            </span>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                if (arquivo) void aoSelecionarArquivo(arquivo);
                e.target.value = "";
              }}
            />
          </label>

          <select
            className={estiloEntrada}
            value={tipoPeriodo}
            onChange={(e) => setTipoPeriodo(e.target.value)}
          >
            <option value="diaria">Programação diária</option>
            <option value="semanal">Programação semanal</option>
            <option value="quinzenal">Programação quinzenal</option>
            <option value="mensal">Programação mensal</option>
            <option value="extraordinaria">Programação extraordinária</option>
          </select>

          {lendo ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {progresso ?? "Lendo o arquivo..."}
            </p>
          ) : null}

          <Botao variante="contorno" onClick={() => void navegar({ to: "/importacoes" })}>
            <History className="size-4" /> Histórico de importações
          </Botao>
        </Cartao>

        {resultado ? (
          <Cartao className="space-y-3">
            <h2 className="font-display text-lg font-semibold">Resumo da leitura</h2>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Arquivo</dt>
                <dd className="truncate font-medium">{resultado.nomeArquivo}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Páginas</dt>
                <dd className="font-medium">{resultado.totalPaginas}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Período</dt>
                <dd className="font-medium">
                  {resultado.periodo.inicio
                    ? `${resultado.periodo.inicio} a ${resultado.periodo.fim}`
                    : "não identificado"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Linhas lidas</dt>
                <dd className="font-medium">{registros.length}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Páginas com OCR</dt>
                <dd className="font-medium">
                  {resultado.paginasComOcr.length ? resultado.paginasComOcr.join(", ") : "nenhuma"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Sem regional</dt>
                <dd className="font-medium">{semRegional}</dd>
              </div>
            </dl>

            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Linhas por regional
              </p>
              {porRegional.map(([codigo, quantidade]) => (
                <div
                  key={codigo}
                  className="flex items-center justify-between rounded-md bg-surface px-3 py-2 text-sm"
                >
                  <span>
                    {codigo === "SEM_REGIONAL" ? "Regional não identificada" : rotuloRegional(codigo)}
                  </span>
                  <span className="font-semibold">{quantidade} linha(s)</span>
                </div>
              ))}
            </div>

            <details className="rounded-md border border-border">
              <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
                Diagnóstico da leitura ({resultado.diagnostico.length} linha(s))
              </summary>
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-surface">
                    <tr>
                      <th className="px-2 py-1">Pág.</th>
                      <th className="px-2 py-1">Linha</th>
                      <th className="px-2 py-1">Texto original</th>
                      <th className="px-2 py-1">Regional</th>
                      <th className="px-2 py-1">Status</th>
                      <th className="px-2 py-1">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.diagnostico.map((d, i) => (
                      <tr key={`${d.pagina}-${d.linha}-${i}`} className="border-t border-border/60 align-top">
                        <td className="px-2 py-1">{d.pagina}</td>
                        <td className="px-2 py-1">{d.linha}</td>
                        <td className="max-w-[18rem] px-2 py-1">{d.texto}</td>
                        <td className="px-2 py-1">{d.regional ? rotuloRegional(d.regional) : "—"}</td>
                        <td className="px-2 py-1 font-semibold">
                          {d.status === "aceita"
                            ? "Aceita"
                            : d.status === "conferencia"
                              ? "Em conferência"
                              : "Ignorada"}
                        </td>
                        <td className="max-w-[14rem] px-2 py-1 text-muted-foreground">{d.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>



            {comProblema > 0 ? (
              <p className="flex items-start gap-2 rounded-md bg-warning/15 px-3 py-2 text-sm text-warning-foreground">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {comProblema} linha(s) vão para a lista "Em conferência". Nada é descartado: você
                corrige na próxima tela.
              </p>
            ) : null}

            {duplicidade?.jaImportado ? (
              <div className="space-y-2 rounded-md bg-destructive/10 px-3 py-2 text-sm">
                <p className="font-semibold text-destructive">Este PDF já foi importado antes.</p>
                {duplicidade.importacoes.slice(0, 3).map((i) => (
                  <p key={i.id} className="text-xs text-muted-foreground">
                    versão {i.versao} · {i.status.replace(/_/g, " ")} ·{" "}
                    {new Date(i.criado_em).toLocaleString("pt-BR")} · {i.total_registros} linha(s)
                  </p>
                ))}
                <p className="text-xs">
                  Se continuar, o sistema cria uma nova versão e mantém a anterior no histórico.
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Botao
                disabled={enviar.isPending || registros.length === 0}
                onClick={() => enviar.mutate()}
              >
                {enviar.isPending ? "Processando..." : "Processar e conferir"}
              </Botao>
              <Botao
                variante="perigo"
                onClick={() => {
                  setResultado(null);
                  setBase64(null);
                  setDuplicidade(null);
                }}
              >
                Cancelar
              </Botao>
            </div>
          </Cartao>
        ) : null}
      </div>
    </AppShell>
  );
}
