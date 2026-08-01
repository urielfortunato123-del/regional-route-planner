import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, FileUp, Loader2 } from "lucide-react";

import { AppShell, Botao, Cartao, Etiqueta, estiloEntrada } from "@/components/AppShell";
import { Identificacao } from "@/components/Identificacao";
import { usePerfilLocal } from "@/lib/perfil-local";
import { lerProgramacaoPdf, type RegistroExtraido, type ResultadoLeitura } from "@/lib/pdf/parser";
import { REGIONAIS, rotuloRegional } from "@/lib/regionais";
import { importarProgramacao, listarRegionais, verificarArquivo } from "@/lib/programacao.functions";

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
        content: "Cada linha do PDF é interpretada e classificada por regional antes de salvar.",
      },
    ],
  }),
  component: ImportarPagina,
});

type Modo = "novo" | "somente_novos" | "nova_versao" | "substituir";

function ImportarPagina() {
  const { perfil, carregado, salvar } = usePerfilLocal();

  const [lendo, setLendo] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoLeitura | null>(null);
  const [registros, setRegistros] = useState<RegistroExtraido[]>([]);
  const [duplicado, setDuplicado] = useState<{ jaImportado: boolean; arquivos: unknown[] } | null>(null);
  const [modo, setModo] = useState<Modo>("novo");
  const [tipoPeriodo, setTipoPeriodo] = useState("diaria");
  const [somenteRevisao, setSomenteRevisao] = useState(false);

  useQuery({ queryKey: ["regionais"], queryFn: () => listarRegionais() });

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

  const importar = useMutation({
    mutationFn: () =>
      importarProgramacao({
        data: {
          funcionarioId: perfil!.id,
          modo,
          arquivo: {
            nome: resultado!.nomeArquivo,
            hash: resultado!.hash,
            periodo:
              resultado!.periodo.inicio && resultado!.periodo.fim
                ? `${resultado!.periodo.inicio} a ${resultado!.periodo.fim}`
                : null,
            tipo_periodo: tipoPeriodo,
            total_paginas: resultado!.totalPaginas,
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
      toast.success(
        `Importação concluída: ${r.inseridos} registro(s) salvos${r.ignorados ? `, ${r.ignorados} repetido(s) ignorado(s)` : ""}.`,
      );
      setResultado(null);
      setRegistros([]);
      setDuplicado(null);
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  async function aoSelecionarArquivo(arquivo: File) {
    setLendo(true);
    setResultado(null);
    setRegistros([]);
    setDuplicado(null);
    try {
      const lido = await lerProgramacaoPdf(arquivo, (mensagem) => setProgresso(mensagem));
      setResultado(lido);
      setRegistros(lido.registros);
      const checagem = await verificarArquivo({ data: { hash: lido.hash } });
      setDuplicado(checagem);
      if (checagem.jaImportado) {
        setModo("somente_novos");
        toast.warning("Esta programação ou parte dela já foi importada.");
      }
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

  function corrigirRegional(chaveLocal: string, codigo: string) {
    setRegistros((atual) =>
      atual.map((r) =>
        r.chaveLocal === chaveLocal
          ? {
              ...r,
              regional_codigo: codigo || null,
              regional_confirmada: !!codigo,
              regional_origem: codigo ? "linha" : "nao_identificada",
              motivosRevisao: r.motivosRevisao.filter((m) => m !== "Regional não confirmada"),
              precisaRevisao: r.motivosRevisao.filter((m) => m !== "Regional não confirmada").length > 0,
            }
          : r,
      ),
    );
  }

  if (!carregado) return <div className="min-h-screen bg-background" />;
  if (!perfil) return <Identificacao aoConcluir={salvar} />;

  const listaVisivel = somenteRevisao ? registros.filter((r) => r.precisaRevisao) : registros;

  return (
    <AppShell perfil={perfil} titulo="Importar programação">
      <div className="space-y-4">
        <Cartao className="space-y-3">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-surface px-4 py-8 text-center">
            <FileUp className="size-8 text-primary" />
            <span className="font-display text-lg font-semibold">
              Importar programação em PDF
            </span>
            <span className="text-xs text-muted-foreground">
              Diária, semanal, quinzenal, mensal ou extraordinária. O arquivo é lido inteiro e
              separado por regional.
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

          <select className={estiloEntrada} value={tipoPeriodo} onChange={(e) => setTipoPeriodo(e.target.value)}>
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
        </Cartao>

        {resultado ? (
          <>
            <Cartao className="space-y-3">
              <h2 className="font-display text-lg font-semibold">Resumo da leitura</h2>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-muted-foreground">Arquivo</dt><dd className="truncate font-medium">{resultado.nomeArquivo}</dd></div>
                <div><dt className="text-muted-foreground">Páginas</dt><dd className="font-medium">{resultado.totalPaginas}</dd></div>
                <div><dt className="text-muted-foreground">Período</dt><dd className="font-medium">{resultado.periodo.inicio ? `${resultado.periodo.inicio} a ${resultado.periodo.fim}` : "não identificado"}</dd></div>
                <div><dt className="text-muted-foreground">Registros</dt><dd className="font-medium">{registros.length}</dd></div>
                <div><dt className="text-muted-foreground">Com OCR</dt><dd className="font-medium">{resultado.paginasComOcr.length ? resultado.paginasComOcr.join(", ") : "nenhuma"}</dd></div>
                <div><dt className="text-muted-foreground">Sem regional</dt><dd className="font-medium">{semRegional}</dd></div>
              </dl>

              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Registros por regional
                </p>
                {porRegional.map(([codigo, quantidade]) => (
                  <div key={codigo} className="flex items-center justify-between rounded-md bg-surface px-3 py-2 text-sm">
                    <span>{codigo === "SEM_REGIONAL" ? "Regional não confirmada" : rotuloRegional(codigo)}</span>
                    <span className="font-semibold">{quantidade} registro(s)</span>
                  </div>
                ))}
              </div>

              {comProblema > 0 ? (
                <p className="flex items-start gap-2 rounded-md bg-warning/15 px-3 py-2 text-sm text-warning-foreground">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {comProblema} registro(s) precisam de conferência. Nada é descartado
                  automaticamente — revise abaixo antes de confirmar.
                </p>
              ) : null}

              {duplicado?.jaImportado ? (
                <div className="space-y-2 rounded-md bg-destructive/10 px-3 py-2">
                  <p className="text-sm font-semibold text-destructive">
                    Esta programação ou parte dela já foi importada.
                  </p>
                  <select className={estiloEntrada} value={modo} onChange={(e) => setModo(e.target.value as Modo)}>
                    <option value="somente_novos">Importar somente novos registros</option>
                    <option value="nova_versao">Criar nova versão</option>
                    <option value="substituir">Substituir importação anterior</option>
                  </select>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Botao
                  disabled={importar.isPending || registros.length === 0}
                  onClick={() => importar.mutate()}
                >
                  {importar.isPending ? "Salvando..." : "Confirmar importação"}
                </Botao>
                <Botao variante="contorno" onClick={() => setSomenteRevisao((v) => !v)}>
                  {somenteRevisao ? "Ver todos" : `Revisar (${comProblema})`}
                </Botao>
                <Botao
                  variante="perigo"
                  onClick={() => {
                    setResultado(null);
                    setRegistros([]);
                    setDuplicado(null);
                  }}
                >
                  Cancelar
                </Botao>
              </div>
            </Cartao>

            <div className="space-y-2">
              {listaVisivel.slice(0, 300).map((r) => (
                <Cartao key={r.chaveLocal} className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display font-semibold">{r.rodovia ?? "Rodovia?"}</span>
                    <span className="text-sm text-muted-foreground">
                      {r.km_inicial ?? "?"} → {r.km_final ?? "?"}
                    </span>
                    <Etiqueta tom={r.regional_codigo ? "ok" : "erro"}>
                      {r.regional_codigo ? rotuloRegional(r.regional_codigo) : "Sem regional"}
                    </Etiqueta>
                    <Etiqueta tom="neutro">pág. {r.pagina_pdf}</Etiqueta>
                  </div>

                  <p className="line-clamp-2 text-xs text-muted-foreground">{r.linha_bruta}</p>

                  {r.motivosRevisao.length ? (
                    <p className="text-xs text-destructive">{r.motivosRevisao.join(" • ")}</p>
                  ) : null}

                  <select
                    className={estiloEntrada}
                    value={r.regional_codigo ?? ""}
                    onChange={(e) => corrigirRegional(r.chaveLocal, e.target.value)}
                  >
                    <option value="">Regional não confirmada</option>
                    {REGIONAIS.map((reg) => (
                      <option key={reg.codigo} value={reg.codigo}>
                        {reg.rotulo}
                      </option>
                    ))}
                  </select>
                </Cartao>
              ))}
              {listaVisivel.length > 300 ? (
                <p className="text-center text-xs text-muted-foreground">
                  Exibindo os 300 primeiros de {listaVisivel.length} registros.
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
