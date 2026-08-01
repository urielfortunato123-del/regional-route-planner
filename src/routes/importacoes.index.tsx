import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { FileText, Loader2 } from "lucide-react";

import { AppShell, Botao, Cartao, Etiqueta, estiloEntrada } from "@/components/AppShell";
import { Identificacao } from "@/components/Identificacao";
import { usePerfilLocal } from "@/lib/perfil-local";
import { rotuloRegional } from "@/lib/regionais";
import { listarImportacoes } from "@/lib/importacoes.functions";
import { guardarImportacoes, lerImportacoes } from "@/lib/offline/db";

export const Route = createFileRoute("/importacoes/")({
  head: () => ({
    meta: [
      { title: "Histórico de importações | Roteirização Regional" },
      {
        name: "description",
        content:
          "Todas as programações em PDF já processadas, com data, período, regionais, versões e situação da conferência.",
      },
      { property: "og:title", content: "Histórico de importações" },
      {
        property: "og:description",
        content: "Consulte, reabra ou crie uma nova versão de qualquer programação importada.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoricoPagina,
});

const SITUACOES: Record<string, { rotulo: string; tom: "ok" | "alerta" | "erro" | "neutro" }> = {
  em_conferencia: { rotulo: "Em conferência", tom: "alerta" },
  confirmado: { rotulo: "Confirmado", tom: "ok" },
  parcialmente_confirmado: { rotulo: "Parcial", tom: "alerta" },
  com_erros: { rotulo: "Com erros", tom: "erro" },
  cancelado: { rotulo: "Cancelado", tom: "neutro" },
};

type Importacao = {
  id: string;
  nome_arquivo: string;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  status: string;
  usuario_nome: string | null;
  regionais_encontradas: string[] | null;
  total_registros: number | null;
  total_erros: number | null;
  total_duplicados: number | null;
  versao: number | null;
  criado_em: string;
  confirmado_em: string | null;
};

function data(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR");
}

function HistoricoPagina() {
  const { perfil, carregado, salvar } = usePerfilLocal();
  const [status, setStatus] = useState("");
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [offline, setOffline] = useState<Importacao[] | null>(null);

  const consulta = useQuery({
    queryKey: ["importacoes", perfil?.id, status, nomeArquivo, de, ate],
    enabled: !!perfil,
    queryFn: () =>
      listarImportacoes({
        data: {
          funcionarioId: perfil!.id,
          ...(status ? { status } : {}),
          ...(nomeArquivo ? { nomeArquivo } : {}),
          ...(de ? { de } : {}),
          ...(ate ? { ate } : {}),
        },
      }),
  });

  const lista = (consulta.data?.importacoes ?? []) as Importacao[];

  useEffect(() => {
    if (!perfil) return;
    if (lista.length) {
      void guardarImportacoes(perfil.regional_codigo, lista as unknown as Array<Record<string, unknown>>);
      return;
    }
    if (consulta.isError) {
      void lerImportacoes(perfil.regional_codigo).then((linhas) =>
        setOffline(linhas.map((l) => l.dados as unknown as Importacao)),
      );
    }
  }, [perfil, lista, consulta.isError]);

  if (!carregado) return <div className="min-h-screen bg-background" />;
  if (!perfil) return <Identificacao aoConcluir={salvar} />;

  const exibidas = lista.length ? lista : (offline ?? []);

  return (
    <AppShell perfil={perfil} titulo="Histórico de importações">
      <div className="space-y-4">
        <Cartao className="grid grid-cols-2 gap-2">
          <select className={estiloEntrada} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todas as situações</option>
            {Object.entries(SITUACOES).map(([valor, s]) => (
              <option key={valor} value={valor}>
                {s.rotulo}
              </option>
            ))}
          </select>
          <input
            className={estiloEntrada}
            placeholder="Nome do arquivo"
            value={nomeArquivo}
            onChange={(e) => setNomeArquivo(e.target.value)}
          />
          <input type="date" className={estiloEntrada} value={de} onChange={(e) => setDe(e.target.value)} />
          <input type="date" className={estiloEntrada} value={ate} onChange={(e) => setAte(e.target.value)} />
          <div className="col-span-2">
            <Link to="/programacao/importar">
              <Botao variante="contorno">
                <FileText className="size-4" /> Importar novo PDF
              </Botao>
            </Link>
          </div>
        </Cartao>

        {consulta.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando histórico...
          </p>
        ) : null}

        {offline && !lista.length ? (
          <p className="rounded-md bg-warning/15 px-3 py-2 text-sm text-warning-foreground">
            Sem conexão: mostrando o histórico guardado no aparelho.
          </p>
        ) : null}

        {exibidas.map((i) => {
          const situacao = SITUACOES[i.status] ?? { rotulo: i.status, tom: "neutro" as const };
          return (
            <Link key={i.id} to="/importacoes/$id" params={{ id: i.id }} className="block">
              <Cartao className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display font-semibold">{i.nome_arquivo}</span>
                  <Etiqueta tom={situacao.tom}>{situacao.rotulo}</Etiqueta>
                  {i.versao && i.versao > 1 ? <Etiqueta tom="neutro">versão {i.versao}</Etiqueta> : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  Importado em {new Date(i.criado_em).toLocaleString("pt-BR")}
                  {i.usuario_nome ? ` por ${i.usuario_nome}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  Período: {data(i.periodo_inicio)} a {data(i.periodo_fim)}
                </p>
                <p className="text-sm">
                  {i.total_registros ?? 0} linha(s) · {i.total_erros ?? 0} em conferência ·{" "}
                  {i.total_duplicados ?? 0} repetida(s)
                </p>
                <div className="flex flex-wrap gap-1">
                  {(i.regionais_encontradas ?? []).map((codigo) => (
                    <Etiqueta key={codigo} tom="neutro">
                      {rotuloRegional(codigo)}
                    </Etiqueta>
                  ))}
                </div>
              </Cartao>
            </Link>
          );
        })}

        {!consulta.isLoading && exibidas.length === 0 ? (
          <Cartao>
            <p className="text-sm text-muted-foreground">
              Nenhuma importação encontrada com esses filtros.
            </p>
          </Cartao>
        ) : null}
      </div>
    </AppShell>
  );
}
