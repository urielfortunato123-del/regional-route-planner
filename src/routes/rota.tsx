import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Crosshair,
  MapPin,
  Navigation,
  Route as RouteIcon,
  Save,
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
import { enfileirar } from "@/lib/offline/sync";
import { guardarRotaLocal } from "@/lib/offline/db";
import { validarRota, textoDosProblemas, type ItemRota } from "@/lib/rotas/validacao";
import { linkGoogleMaps, linkWaze, localizarTrecho } from "@/services/derMapService";

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

  const [visao, setVisao] = useState<"hoje" | "amanha" | "semana">("hoje");
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [ordem, setOrdem] = useState<string[]>([]);
  const [tipo, setTipo] = useState<"sugerida" | "manual">("sugerida");
  const [partida, setPartida] = useState<{ rotulo: string; lat: number; lon: number } | null>(null);
  const [localizando, setLocalizando] = useState(false);
  const [progresso, setProgresso] = useState(0);

  const programacao = useQuery({
    queryKey: ["programacoes", perfil?.id, "rota", visao],
    enabled: !!perfil?.id,
    queryFn: () => listarProgramacoes({ data: { funcionarioId: perfil!.id, visao } }),
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
      (p) =>
        setPartida({
          rotulo: "Minha localização",
          lat: p.coords.latitude,
          lon: p.coords.longitude,
        }),
      () => toast.error("Não foi possível obter a localização. Autorize o GPS."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  const porId = useMemo(() => new Map(servicos.map((s) => [s.id, s])), [servicos]);
  const itensOrdenados = useMemo(
    () => ordem.map((id) => porId.get(id)).filter((s): s is Servico => !!s),
    [ordem, porId],
  );

  function sugerirOrdem() {
    const base = selecionados
      .map((id) => porId.get(id))
      .filter((s): s is Servico => !!s && s.lat != null && s.lon != null);
    if (!partida) {
      toast.error("Defina o ponto de partida antes de gerar a rota sugerida.");
      return;
    }
    const restantes = [...base];
    const sequencia: Servico[] = [];
    let atual = { lat: partida.lat, lon: partida.lon };
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
    setOrdem(sequencia.map((s) => s.id));
    setTipo("sugerida");
    toast.success("Ordem sugerida por proximidade.");
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

  const distanciaTotal = useMemo(() => {
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

  const gravarRota = useMutation({
    mutationFn: async () => {
      const payload = {
        funcionarioId: perfil!.id,
        tipo,
        data: new Date().toISOString().slice(0, 10),
        pontoInicial: partida
          ? { rotulo: partida.rotulo, latitude: partida.lat, longitude: partida.lon }
          : null,
        distanciaTotal: Number(distanciaTotal.toFixed(2)),
        tempoEstimado: Math.round((distanciaTotal / 50) * 60) + itensRota.length * 20,
        itens: itensRota.map((i) => ({
          programacaoId: i.programacaoId,
          ordem: i.ordem,
          rotulo: i.rotulo,
          latitude: i.latitude!,
          longitude: i.longitude!,
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

  const linhas: LinhaMapa[] = partida
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

  return (
    <AppShell perfil={perfil} titulo="Rota do dia">
      <div className="space-y-4">
        <Cartao className="space-y-3">
          <div className="flex gap-2">
            <select
              className={estiloEntrada}
              value={visao}
              onChange={(e) => setVisao(e.target.value as typeof visao)}
            >
              <option value="hoje">Serviços de hoje</option>
              <option value="amanha">Serviços de amanhã</option>
              <option value="semana">Próximos 7 dias</option>
            </select>
            <Botao onClick={() => void localizarServicos()} disabled={localizando}>
              <MapPin className="size-4" />
              {localizando ? `${progresso}%` : "Posicionar"}
            </Botao>
          </div>
          <p className="text-xs text-muted-foreground">
            Só entram na rota serviços da {perfil.regional_rotulo} com regional confirmada e posição
            válida na malha oficial do DER-SP.
          </p>
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
        </Cartao>

        {servicos.length ? (
          <>
            <Cartao className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Botao onClick={sugerirOrdem} variante="destaque">
                  <Wand2 className="size-4" /> Gerar rota sugerida
                </Botao>
                <Etiqueta tom={tipo === "sugerida" ? "destaque" : "neutro"}>
                  {tipo === "sugerida" ? "Ordem sugerida" : "Ordem manual"}
                </Etiqueta>
                <Etiqueta tom="neutro">{distanciaTotal.toFixed(1)} km</Etiqueta>
                <Etiqueta tom="neutro">{itensRota.length} parada(s)</Etiqueta>
              </div>

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
                disabled={problemas.length > 0 || gravarRota.isPending}
                onClick={() => {
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
                      </div>
                    ) : null}
                  </Cartao>
                );
              })}
            </div>
          </>
        ) : (
          <Cartao className="text-center text-sm text-muted-foreground">
            Toque em “Posicionar” para localizar os serviços da programação na malha do DER-SP.
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
    </AppShell>
  );
}
