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

// ---------------------------------------------------------------- camadas por área

export type BBoxLatLon = { sul: number; oeste: number; norte: number; leste: number };

export type LinhaDer = {
  codigo: string;
  nome: string | null;
  classe: string | null;
  pista: string | null;
  extensao: number | null;
  pontos: LatLon[];
};

export type MarcoAreaDer = { codigo: string; km: number; lat: number; lon: number };

export type LimiteRegional = {
  numero: number;
  nome: string | null;
  municipios: string[];
  aneis: LatLon[][];
  bbox: BBoxLatLon;
};

/** Reduz o número de vértices mantendo o traçado (economia de dados no celular). */
function decimar(pontos: LatLon[], tolerancia: number): LatLon[] {
  if (pontos.length <= 2) return pontos;
  const saida: LatLon[] = [pontos[0]!];
  for (let i = 1; i < pontos.length - 1; i++) {
    const p = pontos[i]!;
    const ultimo = saida[saida.length - 1]!;
    if (Math.abs(p.lat - ultimo.lat) + Math.abs(p.lon - ultimo.lon) >= tolerancia) saida.push(p);
  }
  saida.push(pontos[pontos.length - 1]!);
  return saida;
}

function envelopeDer(b: BBoxLatLon) {
  const cantos = [
    paraDer({ lat: b.sul, lon: b.oeste }),
    paraDer({ lat: b.sul, lon: b.leste }),
    paraDer({ lat: b.norte, lon: b.oeste }),
    paraDer({ lat: b.norte, lon: b.leste }),
  ];
  return {
    minx: Math.min(...cantos.map((c) => c.x)),
    maxx: Math.max(...cantos.map((c) => c.x)),
    miny: Math.min(...cantos.map((c) => c.y)),
    maxy: Math.max(...cantos.map((c) => c.y)),
  };
}

function filtroEnvelope(b: BBoxLatLon) {
  const e = envelopeDer(b);
  return `<SPATIALFILTER relation="area_intersection"><ENVELOPE minx="${e.minx.toFixed(1)}" miny="${e.miny.toFixed(1)}" maxx="${e.maxx.toFixed(1)}" maxy="${e.maxy.toFixed(1)}" /></SPATIALFILTER>`;
}

function bboxDe(pontos: LatLon[]): BBoxLatLon {
  return {
    sul: Math.min(...pontos.map((p) => p.lat)),
    norte: Math.max(...pontos.map((p) => p.lat)),
    oeste: Math.min(...pontos.map((p) => p.lon)),
    leste: Math.max(...pontos.map((p) => p.lon)),
  };
}

function intersecao(a: BBoxLatLon, b: BBoxLatLon): BBoxLatLon | null {
  const r = {
    sul: Math.max(a.sul, b.sul),
    norte: Math.min(a.norte, b.norte),
    oeste: Math.max(a.oeste, b.oeste),
    leste: Math.min(a.leste, b.leste),
  };
  return r.norte > r.sul && r.leste > r.oeste ? r : null;
}

/** Limite já carregado na memória do servidor (sem ir ao DER). */
export function limiteRegionalCacheado(numero: number): LimiteRegional | null {
  return doCache<LimiteRegional>(`regional:${numero}`);
}

const limitesEmCurso = new Map<number, Promise<LimiteRegional | null>>();

/** Dispara o carregamento do limite sem bloquear a resposta atual. */
export function aquecerLimiteRegional(numero: number) {
  if (limiteRegionalCacheado(numero) || limitesEmCurso.has(numero)) return;
  const p = limiteRegional(numero)
    .catch(() => null)
    .finally(() => limitesEmCurso.delete(numero));
  limitesEmCurso.set(numero, p);
}

/**
 * Limite oficial de uma regional do DER (campo REGIONAL da camada "municipios",
 * numeração idêntica ao CGR: 2 = Itapetininga, 3 = Bauru, 13 = Rio Claro …).
 * A consulta traz ~900 KB de polígonos e leva ~15 s: fica em cache de memória.
 */
export async function limiteRegional(numero: number): Promise<LimiteRegional | null> {
  const chave = `regional:${numero}`;
  const guardado = doCache<LimiteRegional>(chave);
  if (guardado) return guardado;
  const emCurso = limitesEmCurso.get(numero);
  if (emCurso) return emCurso;


  const feicoes = await consultar(
    pedido(
      `<LAYER id="municipios" /><SPATIALQUERY subfields="REGIONAL REGIO_NOME MUNICIPIO #SHAPE#" where="regional = ${Math.round(numero)}" />`,
      300,
    ),
  );
  if (feicoes.length === 0) return null;

  const aneis: LatLon[][] = [];
  const municipios: string[] = [];
  let nome: string | null = null;
  for (const f of feicoes) {
    nome = nome ?? f.campos["REGIO_NOME"] ?? null;
    if (f.campos["MUNICIPIO"]) municipios.push(f.campos["MUNICIPIO"]!);
    for (const anel of f.aneis) {
      const reduzido = decimar(anel, 0.01);
      if (reduzido.length > 3) aneis.push(reduzido);
    }
  }
  const todos = aneis.flat();
  if (todos.length === 0) return null;

  const limite: LimiteRegional = {
    numero,
    nome,
    municipios: municipios.sort(),
    aneis,
    bbox: bboxDe(todos),
  };
  guardar(chave, limite);
  return limite;
}

export type CamadasArea = {
  rodovias: LinhaDer[];
  marcos: MarcoAreaDer[];
  limite: LimiteRegional | null;
  bboxConsultado: BBoxLatLon | null;
  truncado: boolean;
  obtidoEm: number;
  aviso: string | null;
};

/**
 * Camadas técnicas do DER-SP dentro da área visível, já recortadas pela
 * regional do funcionário (nada de outras regionais é transferido).
 */
export async function camadasNaArea(opcoes: {
  bbox: BBoxLatLon;
  regional?: number | null;
  marcos?: boolean;
}): Promise<CamadasArea> {
  // O limite da regional é pesado (~15 s). Não bloqueia o desenho da malha:
  // usa o que já está em cache e aquece em segundo plano para a próxima consulta.
  let limite: LimiteRegional | null = null;
  if (opcoes.regional) {
    limite = limiteRegionalCacheado(opcoes.regional);
    if (!limite) aquecerLimiteRegional(opcoes.regional);
  }


  const pedidoRodovias = consultar(
    pedido(
      `<LAYER id="d23" /><SPATIALQUERY subfields="CODIGO NOME CLASSE PISTA EXTENSAO #SHAPE#">${filtroEnvelope(opcoes.bbox)}</SPATIALQUERY>`,
      500,
    ),
  );
  const pedidoMarcos: Promise<FeatureDer[]> = opcoes.marcos
    ? consultar(
        pedido(
          `<LAYER id="1193" /><SPATIALQUERY subfields="CODIGO KM #SHAPE#">${filtroEnvelope(opcoes.bbox)}</SPATIALQUERY>`,
          800,
        ),
      )
    : Promise.resolve([]);


  const [feicoes, pontos] = await Promise.all([pedidoRodovias, pedidoMarcos]);


  const area = limite ? intersecao(opcoes.bbox, limite.bbox) : opcoes.bbox;
  const dentro = (p: LatLon) =>
    !area || (p.lat >= area.sul && p.lat <= area.norte && p.lon >= area.oeste && p.lon <= area.leste);

  const rodovias: LinhaDer[] = [];
  for (const f of feicoes) {
    for (const linha of f.linhas) {
      // recorte pela regional: nada de outras regionais sai do servidor
      if (area && !linha.some(dentro)) continue;
      rodovias.push({
        codigo: f.campos["CODIGO"] ?? "",
        nome: f.campos["NOME"] || null,
        classe: f.campos["CLASSE"] || null,
        pista: f.campos["PISTA"] || null,
        extensao: numeroDer(f.campos["EXTENSAO"]),
        pontos: decimar(linha, 0.00008),
      });
    }
  }

  const marcos: MarcoAreaDer[] = pontos.flatMap((f) => {
    const km = numeroDer(f.campos["KM"]);
    const p = f.pontos[0];
    if (km == null || !p || !dentro(p)) return [];
    return [{ codigo: f.campos["CODIGO"] ?? "", km, lat: p.lat, lon: p.lon }];
  });

  return {
    limite,
    obtidoEm: Date.now(),
    rodovias,
    marcos,
    bboxConsultado: area,
    truncado: feicoes.length >= 500,
    aviso:
      limite && !area
        ? "A área exibida está fora da regional. Aproxime o mapa da sua regional."
        : !limite && opcoes.regional
          ? "Limite oficial da regional ainda carregando no serviço do DER. A malha e os marcos já são oficiais."
          : null,
  };

}
