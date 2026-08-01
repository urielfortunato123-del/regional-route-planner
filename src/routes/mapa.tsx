import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ClipboardCheck,
  Crosshair,
  Layers,
  Database,
  ShieldAlert,
  Locate,
  MapPin,
  Navigation,
  RefreshCw,
  Route as RotaIcone,
  Search,
  TriangleAlert,
} from "lucide-react";

import { AppShell, Botao, Campo, Cartao, Etiqueta, estiloEntrada } from "@/components/AppShell";
import { Identificacao } from "@/components/Identificacao";
import type {
  AreaMapa,
  CliqueRodoviaDer,
  FocoMapa,
  LinhaMapa,
  MarcadorMapa,
  MarcoDerMapa,
} from "@/components/mapa/MapaLeaflet";
import { usePerfilLocal } from "@/lib/perfil-local";
import { listarProgramacoes } from "@/lib/programacao.functions";
import { listarInspecoes, listarOcorrencias } from "@/lib/campo.functions";
import { FormularioCampo, type ContextoCampo } from "@/components/campo/FormularioCampo";
import { guardarRegistrosCampo } from "@/lib/offline/db";
import {
  acessosDoTrecho,
  gerarRotaInteligente,
  type PontoAcesso,
  type RotaCalculada,
  type TrechoProgramado,
} from "@/lib/rotas/inteligente";
import { distanciaMetros } from "@/lib/der/geo";
import {
  carregarCamadasDer,
  estimarKm,
  FONTE_DER,
  identificarPonto,
  limparCacheDer,
  linkGoogleMaps,
  linkOsm,
  linkWaze,
  localizarTrecho,
  numeroRegionalDer,
  observarContingencia,
  resumoCacheDer,
  statusServico,
  textoCoordenadas,
  URL_SERVICO_DER,
  type TrechoLocalizado,
} from "@/services/derMapService";


const MapaLeaflet = lazy(() => import("@/components/mapa/MapaLeaflet"));

export const Route = createFileRoute("/mapa")({
  head: () => ({
    meta: [
      { title: "Mapa rodoviário DER-SP | Roteirização Regional" },
      {
        name: "description",
        content:
          "Localize trechos por rodovia e km com a malha oficial do DER-SP, veja a programação da sua regional no mapa e monte a rota do dia.",
      },
      { property: "og:title", content: "Mapa rodoviário DER-SP" },
      {
        property: "og:description",
        content:
          "Referência quilométrica oficial do DER-SP sobre OpenStreetMap, com programação da regional e roteiro do dia.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MapaPagina,
});

const CORES_STATUS: Record<string, string> = {
  pendente: "#dc2626",
  em_rota: "#f59e0b",
  em_execucao: "#2563eb",
  concluido: "#16a34a",
};

type ServicoLocalizado = TrechoProgramado;

const CORES_OCORRENCIA: Record<string, string> = {
  baixa: "#0891b2",
  media: "#d97706",
  alta: "#dc2626",
  emergencial: "#7f1d1d",
};

function usePosicao() {
  const [posicao, setPosicao] = useState<{ lat: number; lon: number; precisao?: number } | null>(
    null,
  );
  const [seguindo, setSeguindo] = useState(false);
  const observador = useRef<number | null>(null);

  const parar = useCallback(() => {
    if (observador.current != null) navigator.geolocation.clearWatch(observador.current);
    observador.current = null;
    setSeguindo(false);
  }, []);

  const iniciar = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("Este aparelho não permite localização.");
      return;
    }
    setSeguindo(true);
    observador.current = navigator.geolocation.watchPosition(
      (p) =>
        setPosicao({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          precisao: p.coords.accuracy,
        }),
      (e) => {
        toast.error(`Localização indisponível: ${e.message}`);
        parar();
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
  }, [parar]);

  useEffect(() => () => parar(), [parar]);
  return { posicao, seguindo, iniciar, parar };
}

function MapaPagina() {
  const { perfil, carregado, salvar } = usePerfilLocal();

  const [visao, setVisao] = useState<"hoje" | "amanha" | "semana">("hoje");
  const [rodoviaBusca, setRodoviaBusca] = useState("");
  const [kmInicial, setKmInicial] = useState("");
  const [kmFinal, setKmFinal] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultadoBusca, setResultadoBusca] = useState<TrechoLocalizado | null>(null);
  const [foco, setFoco] = useState<FocoMapa | null>(null);
  const [servicos, setServicos] = useState<ServicoLocalizado[]>([]);
  const [semLocalizacao, setSemLocalizacao] = useState<string[]>([]);
  const [localizando, setLocalizando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [rota, setRota] = useState<RotaCalculada | null>(null);
  const [gerandoRota, setGerandoRota] = useState(false);
  const [acessos, setAcessos] = useState<Record<string, PontoAcesso>>({});
  const [servicoAberto, setServicoAberto] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<{
    tipo: "inspecao" | "ocorrencia";
    contexto: ContextoCampo;
  } | null>(null);
  const [verTrechos, setVerTrechos] = useState(true);
  const [verConcluidos, setVerConcluidos] = useState(true);
  const [verInspecoes, setVerInspecoes] = useState(true);
  const [verOcorrencias, setVerOcorrencias] = useState(true);
  const [verRota, setVerRota] = useState(true);
  const [contingencia, setContingencia] = useState(false);
  const [pontoClicado, setPontoClicado] = useState<{
    lat: number;
    lon: number;
    texto: string;
  } | null>(null);
  // ---- camadas técnicas do DER-SP
  const [area, setArea] = useState<AreaMapa | null>(null);
  const [areaConsulta, setAreaConsulta] = useState<AreaMapa | null>(null);
  const [verMalha, setVerMalha] = useState(true);
  const [verMarcos, setVerMarcos] = useState(true);
  const [verLimite, setVerLimite] = useState(true);
  const [rodoviaDer, setRodoviaDer] = useState<
    (CliqueRodoviaDer & { km: number | null; precisaoKm: string | null }) | null
  >(null);
  const [marcoDer, setMarcoDer] = useState<MarcoDerMapa | null>(null);
  const [paradas, setParadas] = useState<
    Array<{ id: string; rotulo: string; lat: number; lon: number }>
  >([]);

  const { posicao, seguindo, iniciar, parar } = usePosicao();
  const cliente = useQueryClient();

  useEffect(() => {
    const cancelar = observarContingencia(setContingencia);
    return () => {
      cancelar();
    };
  }, []);

  // espera o mapa parar de mover antes de pedir as camadas ao DER
  useEffect(() => {
    if (!area) return;
    const t = setTimeout(() => setAreaConsulta(area), 450);
    return () => clearTimeout(t);
  }, [area]);

  const zoom = areaConsulta?.zoom ?? 0;
  const marcosVisiveis = verMarcos && zoom >= 12;
  const chaveArea = areaConsulta
    ? [
        areaConsulta.bbox.sul.toFixed(2),
        areaConsulta.bbox.oeste.toFixed(2),
        areaConsulta.bbox.norte.toFixed(2),
        areaConsulta.bbox.leste.toFixed(2),
      ].join(",")
    : "";

  const camadas = useQuery({
    queryKey: ["der-camadas", perfil?.regional_codigo, chaveArea, marcosVisiveis],
    enabled: Boolean(areaConsulta) && zoom >= 9,
    staleTime: 5 * 60_000,
    queryFn: () =>
      carregarCamadasDer({
        bbox: areaConsulta!.bbox,
        regionalCodigo: perfil?.regional_codigo ?? null,
        marcos: marcosVisiveis,
      }),
  });

  const status = useQuery({
    queryKey: ["der-status"],
    queryFn: () => statusServico(),
    staleTime: 60_000,
  });

  const aoClicarRodoviaDer = useCallback(async (c: CliqueRodoviaDer) => {
    setMarcoDer(null);
    setRodoviaDer({ ...c, km: null, precisaoKm: null });
    const km = await estimarKm(c.rodovia.codigo, { lat: c.lat, lon: c.lon });
    setRodoviaDer({ ...c, km: km?.km ?? null, precisaoKm: km?.precisao ?? null });
  }, []);

  const aoClicarMarcoDer = useCallback((m: MarcoDerMapa) => {
    setRodoviaDer(null);
    setMarcoDer(m);
  }, []);

  function adicionarParada(rotulo: string, lat: number, lon: number) {
    setParadas((atual) => [...atual, { id: `${Date.now()}`, rotulo, lat, lon }]);
    toast.success(`${rotulo} adicionado à rota.`);
  }


  const programacao = useQuery({
    queryKey: ["mapa-programacoes", perfil?.id, visao],
    enabled: Boolean(perfil?.id),
    queryFn: () =>
      listarProgramacoes({
        data: { funcionarioId: perfil!.id, visao, somenteMeus: false },
      }),
  });

  const registros = programacao.data?.registros ?? [];

  const inspecoes = useQuery({
    queryKey: ["inspecoes", perfil?.id],
    enabled: Boolean(perfil?.id),
    queryFn: () => listarInspecoes({ data: { funcionarioId: perfil!.id } }),
  });

  const ocorrencias = useQuery({
    queryKey: ["ocorrencias", perfil?.id],
    enabled: Boolean(perfil?.id),
    queryFn: () => listarOcorrencias({ data: { funcionarioId: perfil!.id } }),
  });

  // guarda os registros de campo no aparelho para consulta offline
  useEffect(() => {
    if (!perfil) return;
    if (inspecoes.data?.inspecoes?.length) {
      void guardarRegistrosCampo(
        perfil.regional_codigo,
        "inspecao",
        inspecoes.data.inspecoes as unknown as Array<Record<string, unknown>>,
      );
    }
    if (ocorrencias.data?.ocorrencias?.length) {
      void guardarRegistrosCampo(
        perfil.regional_codigo,
        "ocorrencia",
        ocorrencias.data.ocorrencias as unknown as Array<Record<string, unknown>>,
      );
    }
  }, [perfil, inspecoes.data, ocorrencias.data]);

  const listaInspecoes = (inspecoes.data?.inspecoes ?? []) as unknown as Array<
    Record<string, string | number | null>
  >;
  const listaOcorrencias = (ocorrencias.data?.ocorrencias ?? []) as unknown as Array<
    Record<string, string | number | boolean | null>
  >;

  const localizarProgramacao = useCallback(async () => {
    if (registros.length === 0) {
      toast.info("Nenhum serviço nesta visão para localizar.");
      return;
    }
    setLocalizando(true);
    setProgresso(0);
    const encontrados: ServicoLocalizado[] = [];
    const faltando: string[] = [];
    for (let i = 0; i < registros.length; i++) {
      const r = registros[i]!;
      const campo = (k: string) => (r as unknown as Record<string, string | number | null>)[k];
      const trecho = campo("rodovia")
        ? await localizarTrecho(String(campo("rodovia")), campo("km_inicial") ?? "", campo("km_final"))
        : null;
      if (trecho) {
        encontrados.push({
          id: String(campo("id")),
          rotulo: `${campo("rodovia")} • km ${String(campo("km_inicial") ?? "—").replace(".", ",")}`,
          detalhe: [campo("atividade"), campo("equipe"), campo("descricao")].filter(Boolean).join(" — ").slice(0, 180),
          status: String(campo("status") ?? "pendente"),
          regionalCodigo: campo("regional_codigo") ? String(campo("regional_codigo")) : null,
          regionalConfirmada: Boolean(campo("regional_confirmada")),
          trecho,
        });
      } else {
        faltando.push(`${campo("rodovia") ?? "sem rodovia"} km ${campo("km_inicial") ?? "—"}`);
      }
      setProgresso(Math.round(((i + 1) / registros.length) * 100));
    }
    setServicos(encontrados);
    setSemLocalizacao(faltando);
    setLocalizando(false);
    if (encontrados[0]) {
      setFoco({
        lat: encontrados[0].trecho.inicio.lat,
        lon: encontrados[0].trecho.inicio.lon,
        zoom: 11,
        chave: `prog-${Date.now()}`,
      });
    }
    toast.success(
      `${encontrados.length} serviço(s) posicionados na malha oficial${faltando.length ? ` — ${faltando.length} sem referência de km` : ""}.`,
    );
  }, [registros]);

  async function buscarTrecho() {
    if (!rodoviaBusca.trim() || !kmInicial.trim()) {
      toast.error("Informe a rodovia e o km inicial.");
      return;
    }
    setBuscando(true);
    const trecho = await localizarTrecho(rodoviaBusca, kmInicial, kmFinal || kmInicial);
    setBuscando(false);
    if (!trecho) {
      toast.error(
        "Não foi possível localizar. Confira o código da rodovia e o km, ou tente novamente quando o serviço do DER responder.",
      );
      return;
    }
    setResultadoBusca(trecho);
    setFoco({
      lat: trecho.inicio.lat,
      lon: trecho.inicio.lon,
      zoom: 14,
      chave: `busca-${Date.now()}`,
    });
  }

  async function ondeEstou() {
    if (!posicao) {
      iniciar();
      toast.info("Buscando sua localização…");
      return;
    }
    setFoco({ lat: posicao.lat, lon: posicao.lon, zoom: 15, chave: `gps-${Date.now()}` });
    const ponto = await identificarPonto(posicao, 800);
    if (!ponto) {
      toast.info("Nenhuma rodovia oficial encontrada perto de você.");
      return;
    }
    toast.success(
      `${ponto.rodovia.codigo}${ponto.km != null ? ` • km ${ponto.km.toFixed(3).replace(".", ",")}` : ""} (${Math.round(ponto.distanciaMetros)} m)`,
    );
  }

  const aoClicarMapa = useCallback(async (p: { lat: number; lon: number }) => {
    setPontoClicado({ ...p, texto: "identificando…" });
    const ponto = await identificarPonto(p, 600);
    setPontoClicado({
      ...p,
      texto: ponto
        ? `${ponto.rodovia.codigo}${ponto.km != null ? ` • km ${ponto.km.toFixed(3).replace(".", ",")}` : ""} — ${Math.round(ponto.distanciaMetros)} m do eixo`
        : "Nenhuma rodovia oficial próxima deste ponto.",
    });
  }, []);

  function alternarSelecao(id: string) {
    setSelecionados((atual) =>
      atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id],
    );
  }

  /**
   * Rota inteligente: parte da posição atual (GPS), escolhe o ponto de acesso
   * de cada trecho e mede o percurso pela malha viária (OSRM). Só entram
   * serviços da regional do funcionário.
   */
  async function gerarRota() {
    if (!perfil) return;
    const base = servicos.filter((s) => selecionados.includes(s.id));
    const alvo = (base.length > 0 ? base : servicos).filter(
      (s) => s.regionalCodigo === perfil.regional_codigo,
    );
    if (alvo.length < 1) {
      toast.error("Selecione ao menos um serviço posicionado da sua regional.");
      return;
    }
    const origem = posicao ?? {
      lat: alvo[0]!.trecho.inicio.lat,
      lon: alvo[0]!.trecho.inicio.lon,
    };
    setGerandoRota(true);
    try {
      const calculada = await gerarRotaInteligente({
        itens: alvo,
        origem: { lat: origem.lat, lon: origem.lon },
        acessosFixos: Object.fromEntries(
          Object.entries(acessos).map(([id, a]) => [
            id,
            { itemId: id, tipo: a.tipo, lat: a.lat, lon: a.lon, km: a.km, rotulo: a.rotulo },
          ]),
        ),
        otimizarOrdem: true,
      });
      setRota(calculada);
      toast.success(
        calculada.pelaEstrada
          ? `Rota sugerida: ${calculada.paradas.length} trecho(s), ${calculada.distanciaTotalKm.toFixed(1)} km pela estrada.`
          : `Rota sugerida com distância aproximada — ${calculada.motivo ?? "serviço de rotas indisponível"}.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar a rota.");
    } finally {
      setGerandoRota(false);
    }
  }

  function escolherAcesso(item: ServicoLocalizado, acesso: PontoAcesso) {
    setAcessos((a) => ({ ...a, [item.id]: acesso }));
    setFoco({ lat: acesso.lat, lon: acesso.lon, zoom: 16, chave: `acesso-${item.id}-${Date.now()}` });
    toast.success(`Acesso definido: ${acesso.rotulo}`);
  }

  function abrirFormulario(tipo: "inspecao" | "ocorrencia", item?: ServicoLocalizado) {
    const acesso = item ? acessos[item.id] : null;
    const ponto = item
      ? (acesso ?? { lat: item.trecho.inicio.lat, lon: item.trecho.inicio.lon })
      : (pontoClicado ?? posicao);
    if (!ponto) {
      toast.error("Toque em um ponto do mapa ou ative o GPS para registrar.");
      return;
    }
    setFormulario({
      tipo,
      contexto: {
        programacaoId: item?.id ?? null,
        rodovia: item?.trecho.rodoviaSolicitada ?? rodoviaDer?.rodovia.codigo ?? null,
        kmInicial: item?.trecho.kmInicial ?? rodoviaDer?.km ?? marcoDer?.km ?? null,
        kmFinal: item?.trecho.kmFinal ?? null,
        atividade: item?.detalhe.split(" — ")[0] ?? null,
        equipe: null,
        contrato: null,
        lat: ponto.lat,
        lon: ponto.lon,
        rotulo: item
          ? item.rotulo
          : `Ponto ${ponto.lat.toFixed(5)}, ${ponto.lon.toFixed(5)}`,
      },
    });
  }

  const marcadores = useMemo<MarcadorMapa[]>(() => {
    const lista: MarcadorMapa[] = servicos.map((s) => {
      const ordem = rota?.findIndex((r) => r.id === s.id) ?? -1;
      return {
        id: s.id,
        lat: s.trecho.inicio.lat,
        lon: s.trecho.inicio.lon,
        rotulo: s.rotulo,
        detalhe: s.detalhe,
        cor: CORES_STATUS[s.status] ?? "#dc2626",
        ...(ordem >= 0 ? { numero: ordem + 1 } : {}),
        destacado: selecionados.includes(s.id),
      };
    });
    if (resultadoBusca) {
      lista.push({
        id: "busca",
        lat: resultadoBusca.inicio.lat,
        lon: resultadoBusca.inicio.lon,
        rotulo: `${resultadoBusca.rodovia} • km ${resultadoBusca.kmInicial.toFixed(3).replace(".", ",")}`,
        detalhe: `Referência ${resultadoBusca.precisao} do DER-SP`,
        cor: "#7c3aed",
        destacado: true,
      });
    }
    if (pontoClicado) {
      lista.push({
        id: "clique",
        lat: pontoClicado.lat,
        lon: pontoClicado.lon,
        rotulo: "Ponto consultado",
        detalhe: pontoClicado.texto,
        cor: "#0f172a",
      });
    }
    return lista;
  }, [servicos, rota, selecionados, resultadoBusca, pontoClicado]);

  const linhas = useMemo<LinhaMapa[]>(() => {
    const saida: LinhaMapa[] = servicos
      .filter((s) => s.trecho.linha.length > 1)
      .map((s) => ({
        id: `t-${s.id}`,
        pontos: s.trecho.linha,
        cor: CORES_STATUS[s.status] ?? "#dc2626",
      }));
    if (resultadoBusca && resultadoBusca.linha.length > 1) {
      saida.push({ id: "t-busca", pontos: resultadoBusca.linha, cor: "#7c3aed" });
    }
    if (rota && rota.length > 1) {
      saida.push({
        id: "rota",
        pontos: rota.map((r) => ({ lat: r.trecho.inicio.lat, lon: r.trecho.inicio.lon })),
        cor: "#0ea5e9",
        tracejada: true,
      });
    }
    return saida;
  }, [servicos, resultadoBusca, rota]);

  const camadasIndisponiveis =
    Boolean(areaConsulta) && !camadas.isLoading && (camadas.isError || camadas.data == null);

  const cache = resumoCacheDer();

  if (!carregado) return null;
  if (!perfil) return <Identificacao aoConcluir={salvar} />;

  return (
    <AppShell perfil={perfil} titulo="Mapa rodoviário">
      <div className="space-y-4">
        {contingencia || status.data?.disponivel === false ? (
          <Cartao className="border-warning/60 bg-warning/10">
            <div className="flex gap-3">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning-foreground" />
              <div className="text-sm">
                <p className="font-semibold">Modo de contingência</p>
                <p className="text-muted-foreground">
                  O serviço oficial do DER-SP não respondeu. O mapa continua funcionando com a base
                  de marcos já baixada neste aparelho ({cache.itens} conjunto(s) em cache
                  {cache.atualizadoEm
                    ? `, atualizado em ${new Date(cache.atualizadoEm).toLocaleString("pt-BR")}`
                    : ""}
                  ). Rodovias nunca consultadas ficam indisponíveis até o serviço voltar.
                </p>
              </div>
            </div>
          </Cartao>
        ) : null}

        <Cartao className="space-y-3">
          <div className="flex items-center gap-2">
            <Search className="size-4 text-primary" />
            <h2 className="font-display text-base font-semibold">Localizar por rodovia e km</h2>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Campo rotulo="Rodovia">
              <input
                className={estiloEntrada}
                value={rodoviaBusca}
                onChange={(e) => setRodoviaBusca(e.target.value)}
                placeholder="SP 304"
                inputMode="text"
                autoCapitalize="characters"
              />
            </Campo>
            <Campo rotulo="Km inicial">
              <input
                className={estiloEntrada}
                value={kmInicial}
                onChange={(e) => setKmInicial(e.target.value)}
                placeholder="328,700"
                inputMode="decimal"
              />
            </Campo>
            <Campo rotulo="Km final">
              <input
                className={estiloEntrada}
                value={kmFinal}
                onChange={(e) => setKmFinal(e.target.value)}
                placeholder="330"
                inputMode="decimal"
              />
            </Campo>
          </div>
          <div className="flex flex-wrap gap-2">
            <Botao onClick={buscarTrecho} disabled={buscando}>
              <MapPin className="size-4" />
              {buscando ? "Consultando DER…" : "Localizar trecho"}
            </Botao>
            <Botao variante="contorno" onClick={ondeEstou}>
              <Crosshair className="size-4" />
              Onde estou
            </Botao>
            <Botao variante="contorno" onClick={seguindo ? parar : iniciar}>
              <Locate className="size-4" />
              {seguindo ? "Parar GPS" : "Seguir GPS"}
            </Botao>
          </div>

          {resultadoBusca ? (
            <div className="rounded-lg border border-border bg-surface p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{resultadoBusca.rodovia}</strong>
                <Etiqueta tom={resultadoBusca.precisao === "oficial" ? "ok" : "alerta"}>
                  referência {resultadoBusca.precisao}
                </Etiqueta>
                <Etiqueta tom={resultadoBusca.fonte === "servico" ? "neutro" : "alerta"}>
                  {resultadoBusca.fonte === "servico" ? "serviço DER" : "cache local"}
                </Etiqueta>
              </div>
              <p className="mt-1 text-muted-foreground">
                km {resultadoBusca.kmInicial.toFixed(3).replace(".", ",")} a{" "}
                {resultadoBusca.kmFinal.toFixed(3).replace(".", ",")} — extensão aproximada{" "}
                {resultadoBusca.extensaoKm.toFixed(2).replace(".", ",")} km
              </p>
              <p className="text-muted-foreground">
                Coordenadas: {textoCoordenadas(resultadoBusca.inicio)}
              </p>
              {resultadoBusca.observacao ? (
                <p className="mt-1 text-warning-foreground">{resultadoBusca.observacao}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold text-primary">
                <a href={linkGoogleMaps(resultadoBusca.inicio)} target="_blank" rel="noreferrer">
                  Google Maps
                </a>
                <a href={linkWaze(resultadoBusca.inicio)} target="_blank" rel="noreferrer">
                  Waze
                </a>
                <a href={linkOsm(resultadoBusca.inicio)} target="_blank" rel="noreferrer">
                  OpenStreetMap
                </a>
              </div>
            </div>
          ) : null}
        </Cartao>

        <Cartao className="space-y-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Layers className="size-4 text-primary" />
            <h2 className="font-display text-base font-semibold">Camadas do mapa</h2>
            {camadas.isFetching ? (
              <span className="text-xs text-muted-foreground">carregando camadas DER…</span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            {[
              { on: verMalha, set: setVerMalha, texto: "Malha rodoviária DER" },
              { on: verMarcos, set: setVerMarcos, texto: "Marcos quilométricos DER" },
              { on: verLimite, set: setVerLimite, texto: "Limite da regional DER" },
            ].map((c) => (
              <button
                key={c.texto}
                onClick={() => c.set(!c.on)}
                aria-pressed={c.on}
                className={`rounded-md border px-2.5 py-1 ${
                  c.on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted text-muted-foreground"
                }`}
              >
                {c.on ? "✓ " : ""}
                {c.texto}
              </button>
            ))}
          </div>
          {verMarcos && zoom < 12 ? (
            <p className="text-[11px] text-muted-foreground">
              Aproxime o mapa (zoom 12 ou mais) para exibir os marcos quilométricos oficiais.
            </p>
          ) : null}
        </Cartao>

        <Cartao className="p-0">
          <Suspense
            fallback={
              <div className="flex h-[60vh] items-center justify-center text-sm text-muted-foreground">
                Carregando mapa…
              </div>
            }
          >
            <MapaLeaflet
              marcadores={marcadores}
              linhas={linhas}
              posicaoUsuario={posicao}
              foco={foco}
              aoClicar={aoClicarMapa}
              aoSelecionar={alternarSelecao}
              derRodovias={camadas.data?.rodovias ?? []}
              derMarcos={camadas.data?.marcos ?? []}
              derLimite={camadas.data?.limite?.aneis ?? []}
              mostrarDerRodovias={verMalha}
              mostrarDerMarcos={marcosVisiveis}
              mostrarDerLimite={verLimite}
              aoMover={setArea}
              aoClicarRodoviaDer={aoClicarRodoviaDer}
              aoClicarMarcoDer={aoClicarMarcoDer}
            />
          </Suspense>

          {/* Identificação visual da fonte dos dados */}
          <div className="space-y-1 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            <p>
              <strong className="text-foreground">Mapa-base:</strong> OpenStreetMap
            </p>
            <p>
              <strong className="text-foreground">Dados rodoviários:</strong>{" "}
              {camadasIndisponiveis ? (
                <span className="font-semibold text-destructive">DER-SP: indisponíveis</span>
              ) : (
                <>
                  DER-SP{" "}
                  <span className="text-muted-foreground">
                    (malha d23, marcos km 1193, regionais municipios — ArcIMS GeoWorldx)
                  </span>
                </>
              )}
            </p>
            <p>
              <strong className="text-foreground">Última atualização:</strong>{" "}
              {camadas.data?.obtidoEm
                ? new Date(camadas.data.obtidoEm).toLocaleString("pt-BR")
                : "—"}
              {camadas.data?.fonte === "cache" ? " (base salva no aparelho)" : ""}
            </p>
            <p>
              Rodovias, marcos e limites carregados somente da regional{" "}
              {perfil.regional_rotulo}
              {camadas.data?.limite?.nome ? ` (DER: ${camadas.data.limite.nome})` : ""}.
            </p>
          </div>
        </Cartao>

        {camadasIndisponiveis ? (
          <Cartao className="border-destructive/60 bg-destructive/10 text-sm">
            <p className="font-semibold">
              Não foi possível carregar os dados rodoviários do DER.
            </p>
          </Cartao>
        ) : null}
        {camadas.data?.fonte === "cache" ? (
          <Cartao className="border-warning/60 bg-warning/10 text-sm">
            <p className="font-semibold">Camadas DER indisponíveis. Exibindo última base salva.</p>
            <p className="text-muted-foreground">
              Salva em {new Date(camadas.data.obtidoEm).toLocaleString("pt-BR")}.
            </p>
          </Cartao>
        ) : null}
        {camadas.data?.aviso ? (
          <Cartao className="border-warning/60 bg-warning/10 text-sm">{camadas.data.aviso}</Cartao>
        ) : null}

        {rodoviaDer ? (
          <Cartao className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-base">{rodoviaDer.rodovia.codigo}</strong>
              <Etiqueta tom="neutro">{rodoviaDer.rodovia.classe ?? "classe não informada"}</Etiqueta>
              <Etiqueta tom={camadas.data?.fonte === "servico" ? "ok" : "alerta"}>
                {camadas.data?.fonte === "servico" ? "camada DER-SP" : "cache local"}
              </Etiqueta>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <div>
                <dt className="font-semibold text-foreground">Nome oficial</dt>
                <dd>{rodoviaDer.rodovia.nome || "—"}</dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Regional</dt>
                <dd>{camadas.data?.limite?.nome ?? perfil.regional_rotulo}</dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Km aproximado</dt>
                <dd>
                  {rodoviaDer.km != null
                    ? `${rodoviaDer.km.toFixed(3).replace(".", ",")} (${rodoviaDer.precisaoKm})`
                    : "calculando…"}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Tipo de pista</dt>
                <dd>{rodoviaDer.rodovia.pista || "—"}</dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Sentido</dt>
                <dd>
                  {(rodoviaDer.rodovia.pista ?? "").toLowerCase().includes("dupl")
                    ? "crescente e decrescente (pista dupla)"
                    : "pista única (ambos os sentidos)"}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Coordenadas</dt>
                <dd>{textoCoordenadas(rodoviaDer)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="font-semibold text-foreground">Fonte</dt>
                <dd>{FONTE_DER}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2">
              <Botao
                variante="contorno"
                onClick={() =>
                  adicionarParada(
                    `${rodoviaDer.rodovia.codigo}${rodoviaDer.km != null ? ` km ${rodoviaDer.km.toFixed(3).replace(".", ",")}` : ""}`,
                    rodoviaDer.lat,
                    rodoviaDer.lon,
                  )
                }
              >
                Adicionar à rota
              </Botao>
              <Botao
                variante="contorno"
                onClick={() => {
                  setRodoviaBusca(rodoviaDer.rodovia.codigo);
                  if (rodoviaDer.km != null)
                    setKmInicial(rodoviaDer.km.toFixed(3).replace(".", ","));
                  toast.success("Definido como início do trecho.");
                }}
              >
                Definir como início
              </Botao>
              <Botao
                variante="contorno"
                onClick={() => {
                  setRodoviaBusca(rodoviaDer.rodovia.codigo);
                  if (rodoviaDer.km != null) setKmFinal(rodoviaDer.km.toFixed(3).replace(".", ","));
                  toast.success("Definido como fim do trecho.");
                }}
              >
                Definir como fim
              </Botao>
              <a
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-xs font-semibold text-primary"
                href={linkGoogleMaps(rodoviaDer)}
                target="_blank"
                rel="noreferrer"
              >
                <Navigation className="size-4" /> Navegar até aqui
              </a>
            </div>
          </Cartao>
        ) : null}

        {marcoDer ? (
          <Cartao className="space-y-1 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-base">
                {marcoDer.codigo} • km {String(marcoDer.km).replace(".", ",")}
              </strong>
              <Etiqueta tom="ok">marco oficial DER-SP</Etiqueta>
            </div>
            <p className="text-muted-foreground">
              Regional: {camadas.data?.limite?.nome ?? perfil.regional_rotulo} • Coordenadas:{" "}
              {textoCoordenadas(marcoDer)}
            </p>
            <p className="text-muted-foreground">
              Sentido: referência de pista única/ambos os sentidos • Precisão: posição oficial da
              camada de marcos (1193) • Fonte: {FONTE_DER}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Botao
                variante="contorno"
                onClick={() =>
                  adicionarParada(
                    `${marcoDer.codigo} km ${String(marcoDer.km).replace(".", ",")}`,
                    marcoDer.lat,
                    marcoDer.lon,
                  )
                }
              >
                Adicionar à rota
              </Botao>
              <a
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-xs font-semibold text-primary"
                href={linkGoogleMaps(marcoDer)}
                target="_blank"
                rel="noreferrer"
              >
                <Navigation className="size-4" /> Navegar até aqui
              </a>
            </div>
          </Cartao>
        ) : null}

        {paradas.length ? (
          <Cartao className="space-y-2 text-sm">
            <h2 className="font-display text-base font-semibold">Paradas marcadas no mapa DER</h2>
            <ul className="divide-y divide-border">
              {paradas.map((p, i) => (
                <li key={p.id} className="flex items-center gap-2 py-1.5">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <span className="flex-1">{p.rotulo}</span>
                  <a href={linkWaze(p)} target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary">
                    Navegar
                  </a>
                  <button
                    className="text-xs text-muted-foreground"
                    onClick={() => setParadas((a) => a.filter((x) => x.id !== p.id))}
                  >
                    remover
                  </button>
                </li>
              ))}
            </ul>
          </Cartao>
        ) : null}

        {pontoClicado ? (
          <Cartao className="text-sm">
            <p className="font-semibold">Ponto consultado</p>
            <p className="text-muted-foreground">{pontoClicado.texto}</p>
            <p className="text-muted-foreground">{textoCoordenadas(pontoClicado)}</p>
          </Cartao>
        ) : null}


        <Cartao className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-base font-semibold">Programação no mapa</h2>
            <div className="flex gap-1">
              {(["hoje", "amanha", "semana"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setVisao(v)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                    visao === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {v === "hoje" ? "Hoje" : v === "amanha" ? "Amanhã" : "Semana"}
                </button>
              ))}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {registros.length} serviço(s) da regional {perfil.regional_rotulo} nesta visão.
          </p>
          <div className="flex flex-wrap gap-2">
            <Botao onClick={localizarProgramacao} disabled={localizando}>
              <RefreshCw className={`size-4 ${localizando ? "animate-spin" : ""}`} />
              {localizando ? `Localizando… ${progresso}%` : "Posicionar no mapa"}
            </Botao>
            <Botao variante="destaque" onClick={gerarRota} disabled={servicos.length < 2}>
              <RotaIcone className="size-4" />
              Gerar roteiro
            </Botao>
          </div>

          {semLocalizacao.length ? (
            <p className="text-xs text-warning-foreground">
              Sem referência oficial de km: {semLocalizacao.slice(0, 6).join(" • ")}
              {semLocalizacao.length > 6 ? ` e mais ${semLocalizacao.length - 6}` : ""}.
            </p>
          ) : null}

          <ul className="divide-y divide-border">
            {servicos.map((s) => (
              <li key={s.id} className="flex items-start gap-3 py-2">
                <input
                  type="checkbox"
                  className="mt-1 size-4"
                  checked={selecionados.includes(s.id)}
                  onChange={() => alternarSelecao(s.id)}
                />
                <button
                  className="flex-1 text-left"
                  onClick={() =>
                    setFoco({
                      lat: s.trecho.inicio.lat,
                      lon: s.trecho.inicio.lon,
                      zoom: 15,
                      chave: `s-${s.id}-${Date.now()}`,
                    })
                  }
                >
                  <p className="text-sm font-semibold">{s.rotulo}</p>
                  <p className="text-xs text-muted-foreground">{s.detalhe || "—"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {textoCoordenadas(s.trecho.inicio)} • referência {s.trecho.precisao}
                  </p>
                </button>
                <a
                  href={linkGoogleMaps(s.trecho.inicio)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 text-primary"
                  aria-label={`Navegar até ${s.rotulo}`}
                >
                  <Navigation className="size-4" />
                </a>
              </li>
            ))}
          </ul>
        </Cartao>

        {rota ? (
          <Cartao className="space-y-2">
            <h2 className="font-display text-base font-semibold">Roteiro sugerido</h2>
            <ol className="space-y-2">
              {rota.map((s, i) => (
                <li key={s.id} className="flex items-center gap-3 text-sm">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <span className="flex-1">{s.rotulo}</span>
                  <a
                    href={linkWaze(s.trecho.inicio)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-primary"
                  >
                    Navegar
                  </a>
                </li>
              ))}
            </ol>
            <p className="text-xs text-muted-foreground">
              Ordem por proximidade a partir da sua posição atual (ou do primeiro serviço, se o GPS
              estiver desligado). Você pode selecionar apenas alguns serviços e gerar de novo.
            </p>
          </Cartao>
        ) : null}

        <Cartao className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Database className="size-4 text-primary" />
            <h2 className="font-display text-base font-semibold">Serviço oficial do DER-SP</h2>
          </div>
          <p className="text-muted-foreground">
            {status.isLoading
              ? "Verificando…"
              : status.data?.disponivel
                ? "Serviço respondendo normalmente."
                : `Indisponível: ${status.data?.detalhe ?? "sem resposta"}`}
          </p>
          <p className="text-xs text-muted-foreground">
            {cache.itens} conjunto(s) de dados salvos no aparelho
            {cache.atualizadoEm
              ? ` — último em ${new Date(cache.atualizadoEm).toLocaleString("pt-BR")}`
              : ""}
            .
          </p>
          <div className="flex gap-2">
            <Botao variante="contorno" onClick={() => status.refetch()}>
              <RefreshCw className="size-4" />
              Testar conexão
            </Botao>
            <Botao
              variante="contorno"
              onClick={() => {
                limparCacheDer();
                toast.success("Cache da malha rodoviária limpo.");
              }}
            >
              Limpar cache
            </Botao>
          </div>
        </Cartao>
      </div>
    </AppShell>
  );
}
