import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  CalendarRange,
  ClipboardCheck,
  Map,
  MapPinOff,
  Route as RouteIcon,
  Upload,
} from "lucide-react";

import { AppShell, Botao, Cartao, Etiqueta } from "@/components/AppShell";
import { Identificacao } from "@/components/Identificacao";
import { LocalizacaoManual } from "@/components/campo/LocalizacaoManual";
import { usePerfilLocal } from "@/lib/perfil-local";
import { agendaDoDia, type ServicoAgenda } from "@/lib/programacao.functions";
import { lerProgramacoes } from "@/lib/offline/db";
import { MENSAGEM_INICIANDO, useEstadoServidor } from "@/lib/servidor";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Início | Programação e Roteirização Regional" },
      {
        name: "description",
        content:
          "Agenda do dia com os serviços da sua regional, alertas de localização pendente e atalhos para rota e mapa.",
      },
      { property: "og:title", content: "Programação e Roteirização Regional" },
      {
        property: "og:description",
        content: "Serviços do dia filtrados pela regional do funcionário.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Inicio,
});

const ABAS = [
  { chave: "hoje", rotulo: "Hoje" },
  { chave: "amanha", rotulo: "Amanhã" },
  { chave: "proximos", rotulo: "Próximos dias" },
  { chave: "pendentes", rotulo: "Pendentes" },
  { chave: "concluidos", rotulo: "Concluídos" },
] as const;

type Aba = (typeof ABAS)[number]["chave"];

function LinhaServico({ s }: { s: ServicoAgenda }) {
  const localizado = s.latitude_inicial != null && s.longitude_inicial != null;
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-sm font-semibold">
          {s.rodovia ?? "Rodovia não informada"}
        </span>
        <span className="text-xs text-muted-foreground">
          km {s.km_inicial ?? "—"}
          {s.km_final != null && s.km_final !== s.km_inicial ? ` a ${s.km_final}` : ""}
        </span>
        <Etiqueta tom={s.status === "concluido" ? "ok" : "neutro"}>{s.status}</Etiqueta>
        {!localizado ? <Etiqueta tom="alerta">sem localização</Etiqueta> : null}
      </div>
      <p className="mt-1 text-sm text-foreground">{s.atividade ?? s.descricao ?? "—"}</p>
      <p className="text-xs text-muted-foreground">
        {[s.municipio, s.equipe, s.data_inicial].filter(Boolean).join(" · ")}
      </p>
    </div>
  );
}

function Inicio() {
  const { perfil, carregado, salvar } = usePerfilLocal();
  const [aba, setAba] = useState<Aba>("hoje");
  const [corrigindo, setCorrigindo] = useState<string | null>(null);

  const agenda = useQuery({
    queryKey: ["agenda", perfil?.id],
    queryFn: () => agendaDoDia({ data: { funcionarioId: perfil!.id } }),
    enabled: !!perfil?.id,
  });

  const { iniciando, estado, tentarNovamente } = useEstadoServidor();
  const [cacheLocal, setCacheLocal] = useState<ServicoAgenda[]>([]);

  // Dados guardados no aparelho aparecem na hora, sem esperar o servidor.
  useEffect(() => {
    if (!perfil) return;
    void lerProgramacoes(perfil.regional_codigo).then((r) =>
      setCacheLocal(r as unknown as ServicoAgenda[]),
    );
  }, [perfil]);

  if (!carregado) return <div className="min-h-screen bg-background" />;
  if (!perfil) return <Identificacao aoConcluir={salvar} />;

  const semServidor = !agenda.data && (agenda.isError || iniciando || estado === "offline");
  const resumo = agenda.data?.resumoDia;
  const lista: ServicoAgenda[] = agenda.data
    ? agenda.data[aba]
    : semServidor
      ? cacheLocal
      : [];
  const semLocalizacao = agenda.data?.naoLocalizados ?? [];

  return (
    <AppShell perfil={perfil} titulo={`Olá, ${perfil.nome.split(" ")[0]}`}>
      <div className="space-y-4">
        <Cartao>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Programação de hoje · {perfil.regional_rotulo}
          </p>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            <div className="rounded-lg bg-surface p-3">
              <p className="font-display text-2xl font-semibold">{resumo?.total ?? 0}</p>
              <p className="text-[11px] text-muted-foreground">Serviços</p>
            </div>
            <div className="rounded-lg bg-warning/15 p-3">
              <p className="font-display text-2xl font-semibold text-warning-foreground">
                {resumo?.ativos ?? 0}
              </p>
              <p className="text-[11px] text-muted-foreground">Em aberto</p>
            </div>
            <div className="rounded-lg bg-success/15 p-3">
              <p className="font-display text-2xl font-semibold text-success">
                {resumo?.concluidos ?? 0}
              </p>
              <p className="text-[11px] text-muted-foreground">Concluídos</p>
            </div>
            <div className="rounded-lg bg-surface p-3">
              <p className="font-display text-2xl font-semibold">{resumo?.naRota ?? 0}</p>
              <p className="text-[11px] text-muted-foreground">Na rota</p>
            </div>
          </div>
          {semServidor ? (
            <div className="mt-3 space-y-2 rounded-lg bg-surface p-3">
              <p className="text-xs text-muted-foreground">
                {estado === "offline"
                  ? "Sem conexão. Mostrando a programação guardada no aparelho — você pode registrar observações, status e fotos; tudo entra na fila de envio."
                  : MENSAGEM_INICIANDO}
              </p>
              <p className="text-xs text-muted-foreground">
                {cacheLocal.length} serviço(s) disponíveis offline.
              </p>
              <Botao
                variante="contorno"
                onClick={() => {
                  tentarNovamente();
                  void agenda.refetch();
                }}
              >
                Tentar novamente
              </Botao>
            </div>
          ) : agenda.isLoading ? (
            <p className="mt-3 text-xs text-muted-foreground">Carregando agenda...</p>
          ) : null}
        </Cartao>

        {semLocalizacao.length > 0 ? (
          <Cartao className="space-y-3 border-warning">
            <div className="flex items-center gap-2">
              <MapPinOff className="size-4 text-warning-foreground" />
              <p className="text-sm font-semibold">
                {semLocalizacao.length} serviço(s) ainda sem localização
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Eles ficam fora da rota até serem localizados. Confirme a rodovia e o km, ou marque o
              ponto pelo GPS.
            </p>
            <div className="space-y-2">
              {semLocalizacao.slice(0, 8).map((s) => (
                <div key={s.id} className="space-y-2">
                  <button
                    className="w-full rounded-lg border border-border bg-surface p-3 text-left"
                    onClick={() => setCorrigindo(corrigindo === s.id ? null : s.id)}
                  >
                    <span className="text-sm font-semibold">
                      {s.rodovia ?? "Rodovia não informada"} · km {s.km_inicial ?? "—"}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {s.atividade ?? s.descricao ?? "Serviço programado"}
                    </span>
                  </button>
                  {corrigindo === s.id ? (
                    <LocalizacaoManual
                      perfil={perfil}
                      servico={s}
                      aoSalvar={() => {
                        setCorrigindo(null);
                        agenda.refetch();
                      }}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </Cartao>
        ) : null}

        <Cartao className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {ABAS.map((a) => (
              <button
                key={a.chave}
                onClick={() => setAba(a.chave)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  aba === a.chave
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-surface text-muted-foreground"
                }`}
              >
                {a.rotulo} (
              {agenda.data ? agenda.data[a.chave].length : semServidor ? cacheLocal.length : 0})
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {lista.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum serviço nesta lista.</p>
            ) : (
              lista.slice(0, 20).map((s) => <LinhaServico key={s.id} s={s} />)
            )}
          </div>
        </Cartao>

        <div className="grid gap-3 sm:grid-cols-2">
          <Link to="/programacao">
            <Botao className="w-full justify-start" variante="primario">
              <CalendarRange className="size-5" /> Ver programação completa
            </Botao>
          </Link>
          <Link to="/rota">
            <Botao className="w-full justify-start" variante="contorno">
              <RouteIcon className="size-5" /> Montar rota do dia
            </Botao>
          </Link>
          <Link to="/mapa">
            <Botao className="w-full justify-start" variante="contorno">
              <Map className="size-5" /> Abrir mapa
            </Botao>
          </Link>
          <Link to="/programacao/revisar">
            <Botao className="w-full justify-start" variante="contorno">
              <ClipboardCheck className="size-5" /> Revisar dados da programação
            </Botao>
          </Link>
          <Link to="/programacao/importar">
            <Botao className="w-full justify-start sm:col-span-2" variante="destaque">
              <Upload className="size-5" /> Importar programação em PDF
            </Botao>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
