/**
 * Cliente do OSRM público (open source, sem chave e sem custo).
 * Serviço "trip" = melhor sequência pelo percurso rodoviário real;
 * serviço "route" = distância e tempo respeitando a ordem informada.
 */
export type PontoPercurso = { lat: number; lon: number };

export type Percurso = {
  disponivel: boolean;
  motivo?: string;
  ordem: number[]; // índices dos pontos informados, na sequência final
  pernas: Array<{ distanciaKm: number; tempoMin: number }>;
  distanciaTotalKm: number;
  tempoTotalMin: number;
  geometria: Array<{ lat: number; lon: number }>;
};

const BASE = "https://router.project-osrm.org";

function vazio(motivo: string, quantidade: number): Percurso {
  return {
    disponivel: false,
    motivo,
    ordem: Array.from({ length: quantidade }, (_, i) => i),
    pernas: [],
    distanciaTotalKm: 0,
    tempoTotalMin: 0,
    geometria: [],
  };
}

export async function consultarOsrm(
  pontos: PontoPercurso[],
  otimizar: boolean,
): Promise<Percurso> {
  const coords = pontos.map((p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  const servico = otimizar ? "trip" : "route";
  const extras = otimizar ? "&source=first&roundtrip=false" : "";
  const url = `${BASE}/${servico}/v1/driving/${coords}?overview=simplified&geometries=geojson&steps=false${extras}`;

  try {
    const controlador = new AbortController();
    const tempo = setTimeout(() => controlador.abort(), 20_000);
    const resposta = await fetch(url, { signal: controlador.signal });
    clearTimeout(tempo);
    if (!resposta.ok) return vazio(`Serviço de rotas indisponível (${resposta.status})`, pontos.length);

    const json = (await resposta.json()) as {
      code?: string;
      trips?: Array<{ distance: number; duration: number; legs: Array<{ distance: number; duration: number }>; geometry?: { coordinates: [number, number][] } }>;
      routes?: Array<{ distance: number; duration: number; legs: Array<{ distance: number; duration: number }>; geometry?: { coordinates: [number, number][] } }>;
      waypoints?: Array<{ waypoint_index?: number; trips_index?: number }>;
    };
    if (json.code !== "Ok") return vazio("Serviço de rotas não conseguiu traçar o percurso.", pontos.length);

    const viagem = (otimizar ? json.trips?.[0] : json.routes?.[0]) ?? null;
    if (!viagem) return vazio("Percurso não retornado pelo serviço de rotas.", pontos.length);

    let ordem = Array.from({ length: pontos.length }, (_, i) => i);
    if (otimizar && json.waypoints) {
      ordem = json.waypoints
        .map((w, indice) => ({ indice, posicao: w.waypoint_index ?? indice }))
        .sort((a, b) => a.posicao - b.posicao)
        .map((w) => w.indice);
    }

    const pernas = (viagem.legs ?? []).map((l) => ({
      distanciaKm: Number((l.distance / 1000).toFixed(2)),
      tempoMin: Math.round(l.duration / 60),
    }));

    return {
      disponivel: true,
      ordem,
      pernas,
      distanciaTotalKm: Number((viagem.distance / 1000).toFixed(2)),
      tempoTotalMin: Math.round(viagem.duration / 60),
      geometria: (viagem.geometry?.coordinates ?? []).map(([lon, lat]) => ({ lat, lon })),
    };
  } catch (erro) {
    return vazio(
      erro instanceof Error ? `Serviço de rotas fora do ar: ${erro.message}` : "Serviço de rotas fora do ar.",
      pontos.length,
    );
  }
}
