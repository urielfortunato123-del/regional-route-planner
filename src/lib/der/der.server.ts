/**
 * Cliente do serviço cartográfico oficial do DER-SP (WebRota / ArcIMS).
 *
 * O WebRota (http://200.144.30.104/website/webrota/viewer.htm) é um visualizador
 * ArcIMS. O mapa e as consultas são atendidos pelo servlet:
 *   /servlet/com.esri.esrimap.Esrimap?ServiceName=GeoWorldx
 * Consultas de feições (ArcXML GET_FEATURES) usam o mesmo servlet com
 * &CustomService=Query. Camadas relevantes:
 *   d23   → Rodovias (CODIGO, NOME, CLASSE, PISTA, EXTENSAO …) com geometria
 *   1193  → Marcos quilométricos (CODIGO, KM) com geometria de ponto
 *
 * Este módulo roda apenas no servidor: resolve o conteúdo misto (HTTP × HTTPS)
 * e a ausência de CORS do servidor do DER.
 */
import { escaparValor, erroArcxml, lerFeatures, numeroDer, type FeatureDer } from "./arcxml";
import { paraDer, type LatLon } from "./geo";

const PADRAO = "http://200.144.30.104/servlet/com.esri.esrimap.Esrimap?ServiceName=GeoWorldx";

export function urlServico(): string {
  return process.env["DER_MAP_SERVICE_URL"] || process.env["VITE_DER_MAP_SERVICE_URL"] || PADRAO;
}

const TEMPO_LIMITE = 25_000;

type Cacheado<T> = { valor: T; em: number };
const cache = new Map<string, Cacheado<unknown>>();
const VALIDADE = 1000 * 60 * 60 * 6;

function doCache<T>(chave: string): T | null {
  const item = cache.get(chave) as Cacheado<T> | undefined;
  if (!item) return null;
  if (Date.now() - item.em > VALIDADE) return null;
  return item.valor;
}

function guardar<T>(chave: string, valor: T) {
  cache.set(chave, { valor, em: Date.now() });
}

async function consultar(arcxml: string): Promise<FeatureDer[]> {
  const alvo = `${urlServico()}&CustomService=Query`;
  const controle = new AbortController();
  const tempo = setTimeout(() => controle.abort(), TEMPO_LIMITE);
  try {
    const resposta = await fetch(alvo, {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body: arcxml,
      signal: controle.signal,
    });
    if (!resposta.ok) {
      throw new Error(`Serviço DER respondeu ${resposta.status}`);
    }
    const texto = await resposta.text();
    const erro = erroArcxml(texto);
    if (erro) throw new Error(`Serviço DER: ${erro}`);
    return lerFeatures(texto);
  } finally {
    clearTimeout(tempo);
  }
}

function pedido(corpo: string, limite = 2000) {
  return `<ARCXML version="1.1"><REQUEST><GET_FEATURES outputmode="xml" geometry="true" compact="true" featurelimit="${limite}">${corpo}</GET_FEATURES></REQUEST></ARCXML>`;
}

export type RodoviaDer = {
  codigo: string;
  nome: string | null;
  classe: string | null;
  pista: string | null;
  extensao: number | null;
};

export type MarcoDer = { km: number; lat: number; lon: number };

/** Verifica se o serviço oficial está respondendo. */
export async function pingDer(): Promise<{ disponivel: boolean; detalhe: string; url: string }> {
  try {
    await consultar(
      pedido(`<LAYER id="1193" /><SPATIALQUERY subfields="CODIGO KM" where="codigo = 'SP 304' AND km = 0" />`, 1),
    );
    return { disponivel: true, detalhe: "Serviço ArcIMS GeoWorldx respondendo.", url: urlServico() };
  } catch (e) {
    return { disponivel: false, detalhe: (e as Error).message, url: urlServico() };
  }
}

/** Busca rodovias pelo código ou trecho do código (camada d23). */
export async function buscarRodovias(termo: string): Promise<RodoviaDer[]> {
  const limpo = escaparValor(termo).toUpperCase();
  if (limpo.length < 2) return [];
  const chave = `rodovias:${limpo}`;
  const guardado = doCache<RodoviaDer[]>(chave);
  if (guardado) return guardado;

  const feicoes = await consultar(
    `<ARCXML version="1.1"><REQUEST><GET_FEATURES outputmode="xml" geometry="false" compact="true" featurelimit="400"><LAYER id="d23" /><SPATIALQUERY subfields="CODIGO NOME CLASSE PISTA EXTENSAO" where="codigo LIKE '${limpo}%'" /></GET_FEATURES></REQUEST></ARCXML>`,
  );

  const mapa = new Map<string, RodoviaDer>();
  for (const f of feicoes) {
    const codigo = f.campos["CODIGO"];
    if (!codigo || mapa.has(codigo)) continue;
    mapa.set(codigo, {
      codigo,
      nome: f.campos["NOME"] || null,
      classe: f.campos["CLASSE"] || null,
      pista: f.campos["PISTA"] || null,
      extensao: numeroDer(f.campos["EXTENSAO"]),
    });
  }
  const lista = [...mapa.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
  guardar(chave, lista);
  return lista;
}

/** Marcos quilométricos oficiais de uma rodovia, ordenados por km. */
export async function marcosDaRodovia(codigo: string): Promise<MarcoDer[]> {
  const limpo = escaparValor(codigo).toUpperCase();
  const chave = `marcos:${limpo}`;
  const guardado = doCache<MarcoDer[]>(chave);
  if (guardado) return guardado;

  const feicoes = await consultar(
    pedido(`<LAYER id="1193" /><SPATIALQUERY subfields="#ALL#" where="codigo = '${limpo}'" />`, 4000),
  );
  const marcos: MarcoDer[] = [];
  for (const f of feicoes) {
    const km = numeroDer(f.campos["KM"]);
    const ponto = f.pontos[0];
    if (km == null || !ponto) continue;
    marcos.push({ km, lat: ponto.lat, lon: ponto.lon });
  }
  marcos.sort((a, b) => a.km - b.km);
  guardar(chave, marcos);
  return marcos;
}

/** Geometria (eixo) de uma rodovia, em segmentos de lat/lon. */
export async function geometriaDaRodovia(codigo: string): Promise<LatLon[][]> {
  const limpo = escaparValor(codigo).toUpperCase();
  const chave = `geom:${limpo}`;
  const guardado = doCache<LatLon[][]>(chave);
  if (guardado) return guardado;

  const feicoes = await consultar(
    pedido(`<LAYER id="d23" /><SPATIALQUERY subfields="#ALL#" where="codigo = '${limpo}'" />`, 800),
  );
  const linhas = feicoes.flatMap((f) => f.linhas);
  guardar(chave, linhas);
  return linhas;
}

/** Rodovias próximas de um ponto (clique no mapa). */
export async function rodoviasProximas(
  ponto: LatLon,
  raioMetros: number,
): Promise<Array<RodoviaDer & { linhas: LatLon[][] }>> {
  const centro = paraDer(ponto);
  const env = {
    minx: centro.x - raioMetros,
    maxx: centro.x + raioMetros,
    miny: centro.y - raioMetros,
    maxy: centro.y + raioMetros,
  };
  const feicoes = await consultar(
    pedido(
      `<LAYER id="d23" /><SPATIALQUERY subfields="#ALL#"><SPATIALFILTER relation="area_intersection"><ENVELOPE minx="${env.minx.toFixed(1)}" miny="${env.miny.toFixed(1)}" maxx="${env.maxx.toFixed(1)}" maxy="${env.maxy.toFixed(1)}" /></SPATIALFILTER></SPATIALQUERY>`,
      60,
    ),
  );
  return feicoes.map((f) => ({
    codigo: f.campos["CODIGO"] ?? "",
    nome: f.campos["NOME"] || null,
    classe: f.campos["CLASSE"] || null,
    pista: f.campos["PISTA"] || null,
    extensao: numeroDer(f.campos["EXTENSAO"]),
    linhas: f.linhas,
  }));
}

/** Municípios que contêm um ponto (camada municipios). */
export async function municipioDoPonto(ponto: LatLon): Promise<string | null> {
  const centro = paraDer(ponto);
  try {
    const feicoes = await consultar(
      pedido(
        `<LAYER id="municipios" /><SPATIALQUERY subfields="#ALL#"><SPATIALFILTER relation="area_intersection"><ENVELOPE minx="${(centro.x - 60).toFixed(1)}" miny="${(centro.y - 60).toFixed(1)}" maxx="${(centro.x + 60).toFixed(1)}" maxy="${(centro.y + 60).toFixed(1)}" /></SPATIALFILTER></SPATIALQUERY>`,
        3,
      ),
    );
    const campos = feicoes[0]?.campos ?? {};
    const nome =
      campos["NOME"] ?? campos["NOME_MUNIC"] ?? campos["MUNICIPIO"] ?? campos["NM_MUNICIP"] ?? null;
    return nome ? String(nome) : null;
  } catch {
    return null;
  }
}
