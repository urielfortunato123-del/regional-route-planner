import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Crosshair,
  FileDown,
  MapPin,
  Navigation,
  Route as RouteIcon,
  Save,
  ShieldAlert,
  ClipboardCheck,
  Trash2,
  Wand2,
} from "lucide-react";

import { AppShell, Botao, Cartao, Etiqueta, estiloEntrada } from "@/components/AppShell";
import { Identificacao } from "@/components/Identificacao";
import type { LinhaMapa, MarcadorMapa } from "@/components/mapa/MapaLeaflet";
import { usePerfilLocal } from "@/lib/perfil-local";
import {
  excluirRota,
  listarProgramacoes,
  listarRotas,
  salvarCoordenadas,
  salvarRota,
} from "@/lib/programacao.functions";
import { diasDaProgramacao } from "@/lib/importacoes.functions";
import { calcularPercurso } from "@/lib/osrm.functions";
import { enfileirar } from "@/lib/offline/sync";
import { guardarPdf, guardarRotaLocal } from "@/lib/offline/db";
import { gerarPdfRota, nomeArquivoRota, type ParadaPdf } from "@/lib/rotas/pdf";
import { validarRota, textoDosProblemas, type ItemRota } from "@/lib/rotas/validacao";
import { FormularioCampo, type ContextoCampo } from "@/components/campo/FormularioCampo";
import { linkGoogleMaps, linkWaze, localizarTrecho } from "@/services/derMapService";
import { PainelGeometria } from "@/components/geometria/PainelGeometria";
import { checklistPersistido } from "@/lib/pipeline/checklist";
import { Link } from "@tanstack/react-router";

const MapaLeaflet = lazy(() => import("@/components/mapa/MapaLeaflet"));

export const Route = createFileRoute("/rota")({
  head: () => ({
    meta: [
      { title: "Rota do dia | Roteirização Regional" },
      {
        name: "description",
        content:
          "Monte a rota de campo com os serviços da sua regional: ordem sugerida por proximidade ou ordem manual, com validação e navegação.",
      },
      { property: "og:title", content: "Rota do dia" },
      {
        property: "og:description",
        content: "Sequência de atendimento por proximidade sobre a malha oficial do DER-SP.",
      },
    ],
  }),
  component: RotaPagina,
});

type Servico = {
  id: string;
  rotulo: string;
  detalhe: string;
  regionalCodigo: string | null;
  regionalConfirmada: boolean;
  lat: number | null;
  lon: number | null;
  bruto: Record<string, string | number | boolean | null>;
  aproximado: boolean;
};

type Percurso = {
  disponivel: boolean;
  motivo?: string;
  pernas: Array<{ distanciaKm: number; tempoMin: number }>;
  distanciaTotalKm: number;
  tempoTotalMin: number;
  geometria: Array<{ lat: number; lon: number }>;
};

function distanciaKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function RotaPagina() {
  const { perfil, carregado, salvar } = usePerfilLocal();
  const cliente = useQueryClient();

  const [visao, setVisao] = useState<"hoje" | "amanha" | "semana" | "dia" | "todas">("todas");
  const [dia, setDia] = useState<string>("");
  const [percurso, setPercurso] = useState<Percurso | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [ordem, setOrdem] = useState<string[]>([]);
  const [tipo, setTipo] = useState<"sugerida" | "manual">("sugerida");
  const [partida, setPartida] = useState<{ rotulo: string; lat: number; lon: number } | null>(null);
  const [origemTipo, setOrigemTipo] = useState<"gps" | "primeiro_servico" | null>(null);
  const [origemConfirmada, setOrigemConfirmada] = useState(false);
  const [localizando, setLocalizando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [formulario, setFormulario] = useState<{
    tipo: "inspecao" | "ocorrencia";
    contexto: ContextoCampo;
  } | null>(null);

  function abrirRegistro(tipo: "inspecao" | "ocorrencia", servico: Servico) {
    if (servico.lat == null || servico.lon == null) {
      toast.error("Este serviço ainda não tem posição na malha do DER.");
      return;
    }
    const bruto = servico.bruto;
    const numero = (chave: string) =>
      typeof bruto[chave] === "number" ? (bruto[chave] as number) : null;
    const texto = (chave: string) => (bruto[chave] == null ? null : String(bruto[chave]));
    setFormulario({
      tipo,
      contexto: {
        programacaoId: servico.id,
        rodovia: texto("rodovia"),
        kmInicial: numero("km_inicial"),
        kmFinal: numero("km_final"),
        atividade: texto("atividade"),
        equipe: texto("equipe"),
        contrato: texto("contrato"),
        lat: servico.lat,
        lon: servico.lon,
        rotulo: servico.rotulo,
      },
    });
  }

  const programacao = useQuery({
    queryKey: ["programacoes", perfil?.id, "rota", visao, dia],
    enabled: !!perfil?.id && (visao !== "dia" || !!dia),
    queryFn: () =>
      listarProgramacoes({ data: { funcionarioId: perfil!.id, visao, ...(dia ? { dia } : {}) } }),
  });

  const dias = useQuery({
    queryKey: ["dias-programacao", perfil?.id],
    enabled: !!perfil?.id,
    queryFn: () => diasDaProgramacao({ data: { funcionarioId: perfil!.id } }),
  });

  const rotasSalvas = useQuery({
    queryKey: ["rotas", perfil?.id],
    enabled: !!perfil?.id,
    queryFn: () => listarRotas({ data: { funcionarioId: perfil!.id } }),
  });

  const registros = (programacao.data?.registros ?? []) as unknown as Array<
    Record<string, string | number | boolean | null>
  >;

  async function localizarServicos() {
    if (!registros.length) {
      toast.info("Nenhum serviço nesta visão.");
      return;
    }
    setLocalizando(true);
    setProgresso(0);
    const achados: Servico[] = [];
    const coordenadas: Array<{
      id: string;
      latitude_inicial: number;
      longitude_inicial: number;
      latitude_final: number | null;
      longitude_final: number | null;
      localizacao_confirmada: boolean;
    }> = [];

    for (let i = 0; i < registros.length; i++) {
      const r = registros[i]!;
      const rodovia = r["rodovia"] ? String(r["rodovia"]) : "";
      let lat = typeof r["latitude_inicial"] === "number" ? (r["latitude_inicial"] as number) : null;
      let lon =
        typeof r["longitude_inicial"] === "number" ? (r["longitude_inicial"] as number) : null;
      let latFim = typeof r["latitude_final"] === "number" ? (r["latitude_final"] as number) : null;
      let lonFim = typeof r["longitude_final"] === "number" ? (r["longitude_final"] as number) : null;

      if ((lat == null || lon == null) && rodovia) {
        const trecho = await localizarTrecho(
          rodovia,
          (r["km_inicial"] as number | null) ?? "",
          (r["km_final"] as number | null) ?? null,
        );
        if (trecho) {
          lat = trecho.inicio.lat;
          lon = trecho.inicio.lon;
          latFim = trecho.fim.lat;
          lonFim = trecho.fim.lon;
          coordenadas.push({
            id: String(r["id"]),
            latitude_inicial: lat,
            longitude_inicial: lon,
            latitude_final: latFim,
            longitude_final: lonFim,
            localizacao_confirmada: trecho.precisao !== "extrapolada",
          });
        }
      }

      achados.push({
        id: String(r["id"]),
        rotulo: `${rodovia || "Rodovia?"} km ${r["km_inicial"] ?? "?"}`,
        detalhe: [r["atividade"], r["equipe"]].filter(Boolean).join(" · "),
        regionalCodigo: r["regional_codigo"] ? String(r["regional_codigo"]) : null,
        regionalConfirmada: Boolean(r["regional_confirmada"]),
        lat,
        lon,
        bruto: r,
        aproximado: r["localizacao_confirmada"] === false,
      });
      setProgresso(Math.round(((i + 1) / registros.length) * 100));
    }

    setServicos(achados);
    setSelecionados(achados.filter((s) => s.lat != null).map((s) => s.id));
    setOrdem(achados.filter((s) => s.lat != null).map((s) => s.id));
    setLocalizando(false);

    if (coordenadas.length && perfil) {
      const payload = { funcionarioId: perfil.id, itens: coordenadas };
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await enfileirar({
          regional_codigo: perfil.regional_codigo,
          tipo: "coordenadas",
          payload,
          descricao: `${coordenadas.length} coordenada(s) da malha do DER`,
        });
      } else {
        try {
          await salvarCoordenadas({ data: payload });
        } catch {
          /* posição continua disponível na tela mesmo se o envio falhar */
        }
      }
    }

    const semPosicao = achados.filter((s) => s.lat == null).length;
    toast.success(
      `${achados.length - semPosicao} serviço(s) posicionado(s) na malha do DER${
        semPosicao ? ` — ${semPosicao} sem posição` : ""
      }.`,
    );
  }

  function usarMinhaLocalizacao() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("Este aparelho não informa a localização.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPartida({
          rotulo: "Minha localização",
          lat: p.coords.latitude,
          lon: p.coords.longitude,
        });
        setOrigemTipo("gps");
        setOrigemConfirmada(false);
      },
      () => toast.error("Não foi possível obter a localização. Autorize o GPS."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  const porId = useMemo(() => new Map(servicos.map((s) => [s.id, s])), [servicos]);
  const itensOrdenados = useMemo(
    () => ordem.map((id) => porId.get(id)).filter((s): s is Servico => !!s),
    [ordem, porId],
  );

  /** Vizinho mais próximo em linha reta — usado quando o serviço de rotas não responde. */
  function ordemPorProximidade(base: Servico[], origem: { lat: number; lon: number }) {
    const restantes = [...base];
    const sequencia: Servico[] = [];
    let atual = origem;
    while (restantes.length) {
      let melhor = 0;
      let menor = Number.POSITIVE_INFINITY;
      restantes.forEach((s, i) => {
        const d = distanciaKm(atual, { lat: s.lat!, lon: s.lon! });
        if (d < menor) {
          menor = d;
          melhor = i;
        }
      });
      const escolhido = restantes.splice(melhor, 1)[0]!;
      sequencia.push(escolhido);
      atual = { lat: escolhido.lat!, lon: escolhido.lon! };
    }
    return sequencia;
  }

  /** Distâncias e tempos pela malha viária (OSRM). `otimizar` reordena as paradas. */
  async function calcularNaMalha(ids: string[], otimizar: boolean) {
    if (!partida) {
      toast.error("Defina o ponto de partida antes de calcular a rota.");
      return;
    }
    const base = ids
      .map((id) => porId.get(id))
      .filter((s): s is Servico => !!s && s.lat != null && s.lon != null);
    if (!base.length) {
      toast.error("Nenhum serviço com posição válida para montar a rota.");
      return;
    }
    setCalculando(true);
    try {
      const resposta = await calcularPercurso({
        data: {
          pontos: [
            { lat: partida.lat, lon: partida.lon },
            ...base.map((s) => ({ lat: s.lat!, lon: s.lon! })),
          ],
          otimizar,
        },
      });

      if (resposta.disponivel) {
        const sequencia = otimizar
          ? resposta.ordem
              .filter((i) => i > 0)
              .map((i) => base[i - 1])
              .filter((s): s is Servico => !!s)
          : base;
        setOrdem(sequencia.map((s) => s.id));
        setPercurso({
          disponivel: true,
          pernas: resposta.pernas,
          distanciaTotalKm: resposta.distanciaTotalKm,
          tempoTotalMin: resposta.tempoTotalMin,
          geometria: resposta.geometria,
        });
        setTipo(otimizar ? "sugerida" : tipo);
        toast.success(
          `Rota calculada pela malha viária: ${resposta.distanciaTotalKm.toFixed(1)} km.`,
        );
        return;
      }

      const sequencia = otimizar
        ? ordemPorProximidade(base, { lat: partida.lat, lon: partida.lon })
        : base;
      setOrdem(sequencia.map((s) => s.id));
      setPercurso({
        disponivel: false,
        motivo: resposta.motivo ?? "Serviço de rotas indisponível.",
        pernas: [],
        distanciaTotalKm: 0,
        tempoTotalMin: 0,
        geometria: [],
      });
      if (otimizar) setTipo("sugerida");
      toast.warning("Serviço de rotas indisponível: usando distância aproximada por proximidade.");
    } catch {
      setPercurso(null);
      toast.error("Não foi possível calcular a rota agora.");
    } finally {
      setCalculando(false);
    }
  }

  function sugerirOrdem() {
    if (!partida) {
      toast.error("Escolha o ponto de partida antes de gerar a rota.");
      return;
    }
    if (!origemConfirmada) {
      toast.error("Confirme o ponto de partida para gerar a rota.");
      return;
    }
    void calcularNaMalha(selecionados, true);
  }

  function mover(id: string, direcao: -1 | 1) {
    setOrdem((atual) => {
      const i = atual.indexOf(id);
      const j = i + direcao;
      if (i < 0 || j < 0 || j >= atual.length) return atual;
      const copia = [...atual];
      copia[i] = atual[j]!;
      copia[j] = atual[i]!;
      return copia;
    });
    setTipo("manual");
    setPercurso(null);
  }

  const itensRota: ItemRota[] = itensOrdenados
    .filter((s) => selecionados.includes(s.id))
    .map((s, i) => ({
      programacaoId: s.id,
      rotulo: s.rotulo,
      regionalCodigo: s.regionalCodigo,
      regionalConfirmada: s.regionalConfirmada,
      latitude: s.lat,
      longitude: s.lon,
      ordem: i + 1,
    }));

  const problemas = perfil
    ? validarRota(
        itensRota,
        partida ? { rotulo: partida.rotulo, latitude: partida.lat, longitude: partida.lon } : null,
        perfil.regional_codigo,
      )
    : [];

  const distanciaAproximada = useMemo(() => {
    if (!partida || itensRota.length === 0) return 0;
    let total = 0;
    let atual = { lat: partida.lat, lon: partida.lon };
    for (const item of itensRota) {
      if (item.latitude == null || item.longitude == null) continue;
      total += distanciaKm(atual, { lat: item.latitude, lon: item.longitude });
      atual = { lat: item.latitude, lon: item.longitude };
    }
    return total;
  }, [itensRota, partida]);

  const percursoReal = !!percurso?.disponivel;
  const distanciaTotal = percursoReal ? percurso!.distanciaTotalKm : distanciaAproximada;
  const tempoTotal = percursoReal
    ? percurso!.tempoTotalMin
    : Math.round((distanciaAproximada / 50) * 60) + itensRota.length * 20;

  const gravarRota = useMutation({
    mutationFn: async () => {
      const payload = {
        funcionarioId: perfil!.id,
        tipo,
        data: new Date().toISOString().slice(0, 10),
        pontoInicial: partida
          ? { rotulo: partida.rotulo, latitude: partida.lat, longitude: partida.lon }
          : null,
        origemTipo,
        algoritmo: tipo === "sugerida" ? "vizinho_mais_proximo_osrm" : "manual",
        distanciaTotal: Number(distanciaTotal.toFixed(2)),
        tempoEstimado: tempoTotal,
        situacao: "ativa" as const,
        itens: itensRota.map((i, idx) => ({
          programacaoId: i.programacaoId,
          ordem: i.ordem,
          rotulo: i.rotulo,
          latitude: i.latitude!,
          longitude: i.longitude!,
          distanciaAnterior: percurso?.pernas[idx]?.distanciaKm ?? null,
          tempoAnterior: percurso?.pernas[idx]?.tempoMin ?? null,
        })),
      };
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await enfileirar({
          regional_codigo: perfil!.regional_codigo,
          tipo: "rota",
          payload,
          descricao: `Rota com ${itensRota.length} parada(s)`,
        });
        await guardarRotaLocal(perfil!.regional_codigo, {
          id: `local-${Date.now()}`,
          ...payload,
          pendente: true,
        });
        return { offline: true } as const;
      }
      await salvarRota({ data: payload as never });
      return { offline: false } as const;
    },
    onSuccess: (r) => {
      toast.success(
        r.offline ? "Rota salva no aparelho — envio quando houver conexão." : "Rota salva.",
      );
      cliente.invalidateQueries({ queryKey: ["rotas"] });
      cliente.invalidateQueries({ queryKey: ["programacoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const apagarRota = useMutation({
    mutationFn: (rotaId: string) => excluirRota({ data: { funcionarioId: perfil!.id, rotaId } }),
    onSuccess: () => {
      toast.success("Rota excluída.");
      cliente.invalidateQueries({ queryKey: ["rotas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function exportarPdf() {
    if (!perfil || !itensRota.length) {
      toast.error("Monte a rota antes de exportar.");
      return;
    }
    const paradas: ParadaPdf[] = itensRota.map((item, idx) => {
      const s = porId.get(item.programacaoId);
      const b = s?.bruto ?? {};
      const texto = (chave: string) => (b[chave] == null ? "-" : String(b[chave]));
      return {
        ordem: idx + 1,
        rodovia: texto("rodovia"),
        kmInicial: texto("km_inicial"),
        kmFinal: texto("km_final"),
        atividade: texto("atividade"),
        descricao: texto("descricao"),
        equipe: texto("equipe"),
        contrato: texto("contrato"),
        observacao: texto("observacao"),
        distanciaKm: percurso?.pernas[idx]?.distanciaKm ?? null,
        tempoMin: percurso?.pernas[idx]?.tempoMin ?? null,
        status: texto("status"),
        lat: item.latitude,
        lon: item.longitude,
        aproximado: !!s?.aproximado,
      };
    });

    const rodovias = new Set(paradas.map((p) => p.rodovia).filter((r) => r !== "-"));
    const extensao = paradas.reduce((soma, p) => {
      const a = Number(String(p.kmInicial).replace(",", "."));
      const b = Number(String(p.kmFinal).replace(",", "."));
      return Number.isFinite(a) && Number.isFinite(b) ? soma + Math.abs(b - a) : soma;
    }, 0);

    const dados = {
      funcionario: perfil.nome,
      regionalCodigo: perfil.regional_codigo,
      regionalRotulo: perfil.regional_rotulo,
      dataRota: dia || new Date().toISOString().slice(0, 10),
      pontoInicial: partida,
      distanciaTotalKm: distanciaTotal,
      tempoTotalMin: tempoTotal,
      percursoReal,
      paradas,
      resumo: {
        rodovias: rodovias.size,
        servicos: paradas.length,
        extensaoKm: extensao,
        pendentes: paradas.filter((p) => p.status !== "concluido").length,
        concluidos: paradas.filter((p) => p.status === "concluido").length,
      },
      origem: {
        arquivo: String(registros[0]?.["nome_arquivo"] ?? "programação importada em PDF"),
        importacaoId: registros[0]?.["importacao_id"] ? String(registros[0]["importacao_id"]) : null,
        processadoEm: null,
        versao: null,
      },
    };

    const blob = gerarPdfRota(dados);
    const nome = nomeArquivoRota(dados);
    await guardarPdf(perfil.regional_codigo, nome, blob);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = nome;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast.success("Rota exportada em PDF e guardada no aparelho.");
  }

  if (!carregado) return <div className="min-h-screen bg-background" />;
  if (!perfil) return <Identificacao aoConcluir={salvar} />;

  const marcadores: MarcadorMapa[] = [
    ...(partida
      ? [
          {
            id: "partida",
            lat: partida.lat,
            lon: partida.lon,
            rotulo: partida.rotulo,
            cor: "#0f766e",
          },
        ]
      : []),
    ...itensRota.map((i, idx) => ({
      id: i.programacaoId,
      lat: i.latitude!,
      lon: i.longitude!,
      rotulo: i.rotulo,
      numero: idx + 1,
      cor: "#b45309",
    })),
  ];

  const linhas: LinhaMapa[] = percurso?.geometria.length
    ? [{ id: "rota-real", pontos: percurso.geometria, cor: "#b45309", tracejada: false }]
    : partida
    ? [
        {
          id: "rota",
          pontos: [
            { lat: partida.lat, lon: partida.lon },
            ...itensRota
              .filter((i) => i.latitude != null)
              .map((i) => ({ lat: i.latitude!, lon: i.longitude! })),
          ],
          cor: "#b45309",
          tracejada: true,
        },
      ]
    : [];

  const bloqueio = useQuery({
    queryKey: ["bloqueio-pipeline", perfil?.id],
    enabled: Boolean(perfil?.id),
    queryFn: () => checklistPersistido({ funcionarioId: perfil!.id, importacaoId: null }),
  });

  const posicionados = servicos.filter((s) => s.lat != null).length;
  const semPosicao = servicos.length - posicionados;
  const etapas = [
    { rotulo: "PDF importado", ok: registros.length > 0 },
    { rotulo: "Serviços confirmados", ok: registros.length > 0 },
    { rotulo: "Serviços posicionados", ok: servicos.length > 0 && posicionados > 0 },
    { rotulo: "Ponto inicial definido", ok: !!partida },
    { rotulo: "Rota pronta", ok: !!partida && ordem.length > 0 },
  ];

  const criticas = bloqueio.data?.criticasDivergentes ?? [];
  const pendenciasLeves = bloqueio.data?.pendenciasNaoCriticas ?? [];
  const rotaBloqueada = criticas.length > 0;

  return (
    <AppShell perfil={perfil} titulo="Rota do dia">
      <div className="space-y-4">
        {rotaBloqueada ? (
          <Cartao className="space-y-2 border-destructive/50 bg-destructive/10">
            <p className="flex items-center gap-2 text-sm font-bold text-destructive">
              <ShieldAlert className="size-4" /> Rota bloqueada: o pipeline está divergente
            </p>
            <ul className="space-y-1 text-xs">
              {criticas.map((e) => (
                <li key={e.etapa}>
                  <strong>{e.rotulo}</strong> — {e.status}: esperado {e.esperado} × encontrado{" "}
                  {e.encontrado}. {e.motivo ?? ""}
                </li>
              ))}
            </ul>
            <p className="text-xs">
              Corrija as etapas na auditoria da importação e valide o pipeline novamente antes de
              gerar ou recalcular a rota.
            </p>
            <Link to="/importacoes" className="text-sm font-semibold text-primary">
              Abrir auditoria das importações
            </Link>
          </Cartao>
        ) : pendenciasLeves.length ? (
          <Cartao className="space-y-1 border-warning/60 bg-warning/10">
            <p className="text-sm font-semibold">Rota parcial permitida</p>
            <p className="text-xs">
              {pendenciasLeves.map((e) => e.motivo ?? e.rotulo).join(" · ")} Os serviços já
              localizados podem ser roteirizados normalmente.
            </p>
          </Cartao>
        ) : null}

        <PainelGeometria compacto />
        <Cartao className="space-y-3">
          <select
            className={estiloEntrada}
            value={visao}
            onChange={(e) => setVisao(e.target.value as typeof visao)}
          >
            <option value="hoje">Serviços de hoje</option>
            <option value="amanha">Serviços de amanhã</option>
            <option value="semana">Próximos 7 dias</option>
            <option value="todas">Todos os serviços da regional</option>
            <option value="dia">Dia escolhido</option>
          </select>

          <Botao
            className="w-full"
            onClick={() => void localizarServicos()}
            disabled={localizando || registros.length === 0}
          >
            <MapPin className="size-4" />
            {localizando ? `Posicionando serviços… ${progresso}%` : "Posicionar serviços"}
          </Botao>

          {localizando ? (
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progresso}%` }}
              />
            </div>
          ) : null}

          {servicos.length ? (
            <p className="text-xs text-muted-foreground">
              {posicionados} de {servicos.length} serviço(s) localizados (
              {Math.round((posicionados / servicos.length) * 100)}%)
              {semPosicao ? ` · ${semPosicao} continuam sem posição` : ""}.
            </p>
          ) : null}

          <ul className="grid gap-1 text-xs">
            {etapas.map((e) => (
              <li
                key={e.rotulo}
                className={`flex items-center gap-2 rounded-md px-2 py-1 font-semibold ${
                  e.ok ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                }`}
              >
                <span>{e.ok ? "✔" : "○"}</span>
                {e.rotulo}
              </li>
            ))}
          </ul>

          <p className="text-xs text-muted-foreground">
            Só entram na rota serviços da {perfil.regional_rotulo} com regional confirmada e posição
            válida na malha oficial do DER-SP.
          </p>


          <div className="space-y-1">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <CalendarDays className="size-4" /> Dias com programação
            </p>
            {(dias.data?.dias ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum dia com programação confirmada na sua regional.
              </p>
            ) : null}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {(dias.data?.dias ?? []).map((d) => (
                <button
                  key={d.data}
                  type="button"
                  onClick={() => {
                    setDia(d.data);
                    setVisao("dia");
                    setServicos([]);
                    setPercurso(null);
                  }}
                  className={`min-w-[9.5rem] shrink-0 rounded-lg border p-2 text-left text-xs ${
                    dia === d.data && visao === "dia"
                      ? "border-primary bg-primary/10"
                      : "border-border bg-surface"
                  }`}
                >
                  <span className="block font-display text-sm font-bold">
                    {new Date(`${d.data}T12:00:00`).toLocaleDateString("pt-BR", {
                      weekday: "short",
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </span>
                  <span className="block text-muted-foreground">
                    {d.servicos} serviço(s) · {d.rodovias} rodovia(s)
                  </span>
                  <span className="block text-muted-foreground">
                    {d.extensaoKm.toFixed(1)} km · {d.pendentes} pendente(s)
                  </span>
                  {d.semLocalizacao ? (
                    <span className="block text-destructive">
                      {d.semLocalizacao} sem posição
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        </Cartao>

        <Cartao className="space-y-3">
          <p className="text-sm font-semibold">Ponto de partida</p>
          <div className="flex flex-wrap gap-2">
            <Botao variante="contorno" onClick={usarMinhaLocalizacao}>
              <Crosshair className="size-4" /> Minha localização
            </Botao>
            {servicos.filter((s) => s.lat != null).length ? (
              <Botao
                variante="contorno"
                onClick={() => {
                  const primeiro = servicos.find((s) => s.lat != null)!;
                  setPartida({ rotulo: primeiro.rotulo, lat: primeiro.lat!, lon: primeiro.lon! });
                  setOrigemTipo("primeiro_servico");
                  setOrigemConfirmada(false);
                }}
              >
                <MapPin className="size-4" /> Primeiro serviço
              </Botao>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {partida
              ? `${partida.rotulo} — ${partida.lat.toFixed(5)}, ${partida.lon.toFixed(5)}`
              : "Nenhum ponto de partida definido."}
          </p>
          {partida ? (
            <label className="flex items-start gap-2 rounded-lg border border-border bg-surface p-3 text-xs">
              <input
                type="checkbox"
                className="mt-0.5 size-4"
                checked={origemConfirmada}
                onChange={(e) => setOrigemConfirmada(e.target.checked)}
              />
              <span>
                Confirmo que a rota deve começar em{" "}
                <strong>
                  {partida.rotulo} ({origemTipo === "gps" ? "GPS do aparelho" : "primeiro serviço"})
                </strong>
                . Sem essa confirmação a rota não é gerada.
              </span>
            </label>
          ) : null}
        </Cartao>

        {servicos.length ? (
          <>
            <Cartao className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Botao onClick={sugerirOrdem} variante="destaque" disabled={rotaBloqueada}>
                  <Wand2 className="size-4" /> Gerar rota sugerida
                </Botao>
                <Etiqueta tom={tipo === "sugerida" ? "destaque" : "neutro"}>
                  {tipo === "sugerida" ? "Ordem sugerida" : "Ordem manual"}
                </Etiqueta>
                <Etiqueta tom="neutro">{distanciaTotal.toFixed(1)} km</Etiqueta>
                <Etiqueta tom="neutro">
                  {Math.floor(tempoTotal / 60)}h{String(tempoTotal % 60).padStart(2, "0")}
                </Etiqueta>
                <Etiqueta tom="neutro">{itensRota.length} parada(s)</Etiqueta>
                <Etiqueta tom={percursoReal ? "ok" : "alerta"}>
                  {percursoReal ? "distância pela estrada" : "distância aproximada"}
                </Etiqueta>
              </div>

              <div className="flex flex-wrap gap-2">
                <Botao
                  variante="contorno"
                  disabled={calculando || rotaBloqueada}
                  onClick={() => void calcularNaMalha(ordem.filter((id) => selecionados.includes(id)), false)}
                >
                  {calculando ? "Calculando..." : "Recalcular pela estrada"}
                </Botao>
                <Botao variante="contorno" onClick={() => void exportarPdf()}>
                  <FileDown className="size-4" /> Exportar rota em PDF
                </Botao>
              </div>

              {percurso && !percurso.disponivel ? (
                <p className="rounded-md bg-warning/15 px-3 py-2 text-xs text-warning-foreground">
                  {percurso.motivo} As distâncias mostradas são aproximadas em linha reta.
                </p>
              ) : null}

              {problemas.length ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                  {problemas.map((p) => (
                    <p key={p.codigo}>
                      {p.mensagem}
                      {p.registros.length ? ` (${p.registros.slice(0, 4).join("; ")})` : ""}
                    </p>
                  ))}
                </div>
              ) : null}

              <Botao
                className="w-full"
                disabled={problemas.length > 0 || rotaBloqueada || gravarRota.isPending}
                onClick={() => {
                  if (rotaBloqueada) {
                    toast.error("Pipeline divergente: corrija a auditoria antes de salvar a rota.");
                    return;
                  }
                  if (problemas.length) {
                    toast.error(textoDosProblemas(problemas));
                    return;
                  }
                  gravarRota.mutate();
                }}
              >
                <Save className="size-4" /> Salvar rota
              </Botao>
            </Cartao>

            <Suspense fallback={<Cartao>Carregando mapa...</Cartao>}>
              <MapaLeaflet marcadores={marcadores} linhas={linhas} altura="45vh" />
            </Suspense>

            <div className="space-y-2">
              {servicos.map((s) => {
                const posicao = ordem.indexOf(s.id);
                const marcado = selecionados.includes(s.id);
                return (
                  <Cartao key={s.id} className="space-y-2">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 size-4 accent-[var(--color-primary)]"
                        checked={marcado}
                        disabled={s.lat == null}
                        onChange={(e) => {
                          setSelecionados((v) =>
                            e.target.checked ? [...v, s.id] : v.filter((x) => x !== s.id),
                          );
                          setOrdem((v) =>
                            e.target.checked ? (v.includes(s.id) ? v : [...v, s.id]) : v.filter((x) => x !== s.id),
                          );
                          setTipo("manual");
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-base font-semibold">
                          {marcado && posicao >= 0 ? `${posicao + 1}. ` : ""}
                          {s.rotulo}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{s.detalhe}</p>
                        {s.lat == null ? (
                          <Etiqueta tom="erro">Sem posição — corrija na revisão</Etiqueta>
                        ) : null}
                      </div>
                      {marcado && s.lat != null ? (
                        <div className="flex flex-col gap-1">
                          <button
                            aria-label="Subir"
                            className="rounded-md border border-border p-1"
                            onClick={() => mover(s.id, -1)}
                          >
                            <ArrowUp className="size-4" />
                          </button>
                          <button
                            aria-label="Descer"
                            className="rounded-md border border-border p-1"
                            onClick={() => mover(s.id, 1)}
                          >
                            <ArrowDown className="size-4" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {s.lat != null ? (
                      <div className="flex flex-wrap gap-2 text-xs">
                        <a
                          className="rounded-md border border-border px-2 py-1 font-semibold"
                          href={linkGoogleMaps({ lat: s.lat, lon: s.lon! })}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Navigation className="mr-1 inline size-3" /> Google Maps
                        </a>
                        <a
                          className="rounded-md border border-border px-2 py-1 font-semibold"
                          href={linkWaze({ lat: s.lat, lon: s.lon! })}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Waze
                        </a>
                        <button
                          className="rounded-md border border-border px-2 py-1 font-semibold"
                          onClick={() => abrirRegistro("inspecao", s)}
                        >
                          <ClipboardCheck className="mr-1 inline size-3" /> Inspeção
                        </button>
                        <button
                          className="rounded-md border border-border px-2 py-1 font-semibold"
                          onClick={() => abrirRegistro("ocorrencia", s)}
                        >
                          <ShieldAlert className="mr-1 inline size-3" /> Ocorrência
                        </button>
                      </div>
                    ) : null}
                  </Cartao>
                );
              })}
            </div>
          </>
        ) : (
          <Cartao className="text-center text-sm text-muted-foreground">
            Toque em “Posicionar serviços”, no cartão acima, para localizar a programação na
            malha oficial do DER-SP e liberar a geração da rota.

          </Cartao>
        )}

        <Cartao className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <RouteIcon className="size-4" /> Rotas salvas da regional
          </p>
          {(rotasSalvas.data?.rotas ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma rota salva ainda.</p>
          ) : null}
          {(rotasSalvas.data?.rotas ?? []).map((r) => (
            <div key={r.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">
                  {new Date(`${r.data}T12:00:00`).toLocaleDateString("pt-BR")}
                </span>
                <Etiqueta tom={r.tipo === "sugerida" ? "destaque" : "neutro"}>{r.tipo}</Etiqueta>
                <Etiqueta tom="neutro">{r.rota_itens?.length ?? 0} parada(s)</Etiqueta>
                {r.distancia_total ? (
                  <Etiqueta tom="neutro">{Number(r.distancia_total).toFixed(1)} km</Etiqueta>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {r.usuario_nome} ·{" "}
                {(r.rota_itens ?? [])
                  .slice()
                  .sort((a, b) => a.ordem - b.ordem)
                  .map((i) => i.rotulo)
                  .join(" → ")}
              </p>
              <Botao
                variante="perigo"
                className="mt-2"
                onClick={() => {
                  if (window.confirm("Excluir esta rota?")) apagarRota.mutate(r.id);
                }}
              >
                <Trash2 className="size-4" /> Excluir
              </Botao>
            </div>
          ))}
        </Cartao>
      </div>

      {formulario ? (
        <FormularioCampo
          tipo={formulario.tipo}
          contexto={formulario.contexto}
          funcionarioId={perfil.id}
          regionalCodigo={perfil.regional_codigo}
          aoFechar={() => setFormulario(null)}
          aoSalvar={() => cliente.invalidateQueries({ queryKey: ["inspecoes"] })}
        />
      ) : null}
    </AppShell>
  );
}
