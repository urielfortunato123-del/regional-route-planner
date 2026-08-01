/**
 * Camada de integração com o mapa oficial do DER-SP (WebRota).
 *
 * Tudo o que o aplicativo sabe sobre a malha rodoviária oficial passa por aqui:
 * consulta de rodovias, marcos quilométricos, conversão rodovia + km em
 * coordenada, geometria de trechos, normalização de códigos (SP / SPA / SPM),
 * cache local e modo de contingência quando o servidor do DER está fora.
 *
 * O endereço do serviço não aparece em nenhum outro ponto do código: fica em
 * VITE_DER_MAP_SERVICE_URL (exibição) e DER_MAP_SERVICE_URL (consulta no
 * servidor), lidos em src/lib/der/der.server.ts.
 */
import {
  derBuscarRodovias,
  derCamadas,
  derGeometria,
  derMarcos,
  derMunicipio,
  derRodoviasProximas,
  derStatus,
} from "@/lib/der.functions";
import { distanciaMetros, type LatLon } from "@/lib/der/geo";

export type { LatLon };

export type Marco = { km: number; lat: number; lon: number };
export type RodoviaDer = {
  codigo: string;
  nome: string | null;
  classe: string | null;
  pista: string | null;
  extensao: number | null;
};

export type Sentido = "crescente" | "decrescente" | "qualquer";
export type Precisao = "oficial" | "interpolada" | "extrapolada";
export type FonteDado = "servico" | "cache";

export type LocalizacaoKm = {
  rodovia: string;
  rodoviaSolicitada: string;
  km: number;
  lat: number;
  lon: number;
  sentido: Sentido;
  precisao: Precisao;
  fonte: FonteDado;
  atualizadoEm: number;
  marcoAnterior: number | null;
  marcoPosterior: number | null;
  observacao: string | null;
};

export const URL_SERVICO_DER =
  (import.meta.env["VITE_DER_MAP_SERVICE_URL"] as string | undefined) ??
  "http://200.144.30.104/servlet/com.esri.esrimap.Esrimap?ServiceName=GeoWorldx";

export const FONTE_DER = "DER-SP — WebRota (ArcIMS GeoWorldx)";

// ---------------------------------------------------------------- normalização

/** "328,700" | "328.700" | "328+700" → 328.7 */
export function normalizarKm(valor: string | number | null | undefined): number | null {
  if (valor == null || valor === "") return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  const bruto = valor.trim().replace(/\s/g, "");
  const somado = bruto.match(/^(\d+)\+(\d{1,3})$/);
  if (somado) return Number(somado[1]) + Number(somado[2]!.padEnd(3, "0")) / 1000;
  const n = Number(bruto.replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export type CodigoNormalizado = {
  /** Código como existe na base do DER. */
  codigo: string;
  /** Como veio da programação. */
  original: string;
  /** Aviso quando a base oficial não tem o código exato. */
  observacao: string | null;
};

/**
 * Normaliza os códigos usados na programação para o formato da base do DER:
 * - "SP-304", "SP304"        → "SP 304"
 * - "SPA 341/304"            → "SP 341/304" (classe "Acessos" na base)
 * - "SPM 304 D" / "SPM 304E" → "SP 304" (marginais não têm eixo próprio)
 */
export function normalizarCodigoRodovia(bruto: string): CodigoNormalizado {
  const original = bruto.trim();
  const t = original
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const acesso = t.match(/^SP[AM]?\s*(\d{2,3})\s*\/\s*(\d{2,3})/);
  if (acesso) {
    return {
      codigo: `SP ${acesso[1]}/${acesso[2]}`,
      original,
      observacao: t.startsWith("SPA")
        ? "Acesso (SPA) consultado como SP na malha oficial."
        : null,
    };
  }

  const marginal = t.match(/^SPM\s*(\d{2,3})\s*([A-Z])?$/);
  if (marginal) {
    return {
      codigo: `SP ${marginal[1]}`,
      original,
      observacao: `Marginal ${original} não possui eixo próprio na base do DER; usada a rodovia SP ${marginal[1]}.`,
    };
  }

  const simples = t.match(/^(SP|BR|SPA|SPM|VIC|VCS)\s*(\d{2,3})(?:\s+([A-Z]))?$/);
  if (simples) {
    const prefixo = simples[1] === "SPA" || simples[1] === "SPM" ? "SP" : simples[1]!;
    return {
      codigo: `${prefixo} ${simples[2]}`,
      original,
      observacao:
        simples[1] === "SPA" || simples[1] === "SPM"
          ? `${original} consultada como ${prefixo} ${simples[2]} na malha oficial.`
          : null,
    };
  }

  return { codigo: t, original, observacao: null };
}

// ---------------------------------------------------------------- cache local

const PREFIXO = "der.cache.v2.";

type Envelope<T> = { valor: T; em: number };

function lerCache<T>(chave: string): Envelope<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const bruto = window.localStorage.getItem(PREFIXO + chave);
    return bruto ? (JSON.parse(bruto) as Envelope<T>) : null;
  } catch {
    return null;
  }
}

function gravarCache<T>(chave: string, valor: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIXO + chave, JSON.stringify({ valor, em: Date.now() }));
  } catch {
    /* armazenamento cheio: o cache é opcional */
  }
}

export function limparCacheDer() {
  if (typeof window === "undefined") return;
  for (const chave of Object.keys(window.localStorage)) {
    if (chave.startsWith(PREFIXO)) window.localStorage.removeItem(chave);
  }
}

export function resumoCacheDer() {
  if (typeof window === "undefined") return { itens: 0, atualizadoEm: null as number | null };
  let itens = 0;
  let atualizadoEm: number | null = null;
  for (const chave of Object.keys(window.localStorage)) {
    if (!chave.startsWith(PREFIXO)) continue;
    itens += 1;
    const env = lerCache<unknown>(chave.slice(PREFIXO.length));
    if (env && (atualizadoEm == null || env.em > atualizadoEm)) atualizadoEm = env.em;
  }
  return { itens, atualizadoEm };
}

// ---------------------------------------------------------------- estado offline

let offline = false;
const ouvintes = new Set<(offline: boolean) => void>();

export function servicoEmContingencia() {
  return offline;
}

export function observarContingencia(fn: (offline: boolean) => void) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

function marcarEstado(novo: boolean) {
  if (offline === novo) return;
  offline = novo;
  for (const fn of ouvintes) fn(novo);
}

/**
 * Tenta o serviço oficial; em caso de falha usa a última base válida salva.
 * Nunca inventa dados: sem serviço e sem cache, devolve null.
 */
async function comContingencia<T>(
  chave: string,
  buscar: () => Promise<T>,
): Promise<{ valor: T; fonte: FonteDado; em: number } | null> {
  try {
    const valor = await buscar();
    gravarCache(chave, valor);
    marcarEstado(false);
    return { valor, fonte: "servico", em: Date.now() };
  } catch {
    marcarEstado(true);
    const guardado = lerCache<T>(chave);
    if (!guardado) return null;
    return { valor: guardado.valor, fonte: "cache", em: guardado.em };
  }
}

// ---------------------------------------------------------------- consultas

export async function statusServico() {
  try {
    const r = await derStatus();
    marcarEstado(!r.disponivel);
    return { ...r, cache: resumoCacheDer() };
  } catch (e) {
    marcarEstado(true);
    return {
      disponivel: false,
      detalhe: (e as Error).message,
      url: URL_SERVICO_DER,
      cache: resumoCacheDer(),
    };
  }
}

export async function consultarRodovias(termo: string): Promise<RodoviaDer[]> {
  const limpo = termo.trim().toUpperCase();
  if (limpo.length < 2) return [];
  const r = await comContingencia(`rodovias:${limpo}`, () =>
    derBuscarRodovias({ data: { termo: limpo } }),
  );
  return r?.valor ?? [];
}

export async function consultarMarcos(
  codigo: string,
): Promise<{ marcos: Marco[]; fonte: FonteDado; em: number } | null> {
  const r = await comContingencia(`marcos:${codigo}`, async () => {
    const resposta = await derMarcos({ data: { codigo } });
    return resposta.marcos as Marco[];
  });
  if (!r) return null;
  return { marcos: r.valor, fonte: r.fonte, em: r.em };
}

export async function consultarGeometria(
  codigo: string,
): Promise<{ linhas: LatLon[][]; fonte: FonteDado; em: number } | null> {
  const r = await comContingencia(`geom:${codigo}`, async () => {
    const resposta = await derGeometria({ data: { codigo } });
    return resposta.linhas as LatLon[][];
  });
  if (!r) return null;
  return { linhas: r.valor, fonte: r.fonte, em: r.em };
}

export async function consultarMunicipio(ponto: LatLon): Promise<string | null> {
  try {
    const r = await derMunicipio({ data: { lat: ponto.lat, lon: ponto.lon } });
    return r.municipio;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- rodovia + km → coordenada

/** Converte rodovia + km em coordenada usando os marcos oficiais do DER. */
export async function localizarKm(
  rodoviaBruta: string,
  kmBruto: string | number,
  sentido: Sentido = "qualquer",
): Promise<LocalizacaoKm | null> {
  const { codigo, original, observacao } = normalizarCodigoRodovia(rodoviaBruta);
  const km = normalizarKm(kmBruto);
  if (km == null) return null;

  const base = await consultarMarcos(codigo);
  if (!base || base.marcos.length === 0) return null;

  const marcos = base.marcos;
  const exato = marcos.find((m) => Math.abs(m.km - km) < 0.0005);
  if (exato) {
    return {
      rodovia: codigo,
      rodoviaSolicitada: original,
      km,
      lat: exato.lat,
      lon: exato.lon,
      sentido,
      precisao: "oficial",
      fonte: base.fonte,
      atualizadoEm: base.em,
      marcoAnterior: exato.km,
      marcoPosterior: exato.km,
      observacao,
    };
  }

  let anterior: Marco | null = null;
  let posterior: Marco | null = null;
  for (const m of marcos) {
    if (m.km <= km) anterior = m;
    if (m.km >= km) {
      posterior = m;
      break;
    }
  }

  if (anterior && posterior && posterior.km > anterior.km) {
    const t = (km - anterior.km) / (posterior.km - anterior.km);
    return {
      rodovia: codigo,
      rodoviaSolicitada: original,
      km,
      lat: anterior.lat + (posterior.lat - anterior.lat) * t,
      lon: anterior.lon + (posterior.lon - anterior.lon) * t,
      sentido,
      precisao: "interpolada",
      fonte: base.fonte,
      atualizadoEm: base.em,
      marcoAnterior: anterior.km,
      marcoPosterior: posterior.km,
      observacao,
    };
  }

  const extremo = anterior ?? posterior;
  if (!extremo) return null;
  return {
    rodovia: codigo,
    rodoviaSolicitada: original,
    km,
    lat: extremo.lat,
    lon: extremo.lon,
    sentido,
    precisao: "extrapolada",
    fonte: base.fonte,
    atualizadoEm: base.em,
    marcoAnterior: anterior?.km ?? null,
    marcoPosterior: posterior?.km ?? null,
    observacao:
      observacao ??
      `O km ${km.toFixed(3)} está fora da faixa de marcos da ${codigo} (${marcos[0]!.km} a ${marcos[marcos.length - 1]!.km}). Mostrado o marco mais próximo.`,
  };
}

export type TrechoLocalizado = {
  rodovia: string;
  rodoviaSolicitada: string;
  kmInicial: number;
  kmFinal: number;
  inicio: LocalizacaoKm;
  fim: LocalizacaoKm;
  linha: LatLon[];
  extensaoKm: number;
  precisao: Precisao;
  fonte: FonteDado;
  atualizadoEm: number;
  observacao: string | null;
};

/** Converte rodovia + km inicial + km final na geometria do trecho programado. */
export async function localizarTrecho(
  rodoviaBruta: string,
  kmInicialBruto: string | number,
  kmFinalBruto: string | number | null | undefined,
  sentido: Sentido = "qualquer",
): Promise<TrechoLocalizado | null> {
  const kmA = normalizarKm(kmInicialBruto);
  const kmB = normalizarKm(kmFinalBruto ?? kmInicialBruto);
  if (kmA == null || kmB == null) return null;

  const inicio = await localizarKm(rodoviaBruta, kmA, sentido);
  const fim = await localizarKm(rodoviaBruta, kmB, sentido);
  if (!inicio || !fim) return null;

  const base = await consultarMarcos(inicio.rodovia);
  const menor = Math.min(kmA, kmB);
  const maior = Math.max(kmA, kmB);
  const intermediarios = (base?.marcos ?? []).filter((m) => m.km > menor && m.km < maior);
  const linha: LatLon[] = [
    { lat: inicio.lat, lon: inicio.lon },
    ...intermediarios.map((m) => ({ lat: m.lat, lon: m.lon })),
    { lat: fim.lat, lon: fim.lon },
  ];
  if (kmB < kmA) linha.reverse();

  let extensao = 0;
  for (let i = 1; i < linha.length; i++) extensao += distanciaMetros(linha[i - 1]!, linha[i]!);

  const precisao: Precisao =
    inicio.precisao === "oficial" && fim.precisao === "oficial"
      ? "oficial"
      : inicio.precisao === "extrapolada" || fim.precisao === "extrapolada"
        ? "extrapolada"
        : "interpolada";

  return {
    rodovia: inicio.rodovia,
    rodoviaSolicitada: inicio.rodoviaSolicitada,
    kmInicial: kmA,
    kmFinal: kmB,
    inicio,
    fim,
    linha,
    extensaoKm: extensao / 1000,
    precisao,
    fonte: inicio.fonte,
    atualizadoEm: inicio.atualizadoEm,
    observacao: inicio.observacao,
  };
}

// ---------------------------------------------------------------- clique no mapa

export type PontoIdentificado = {
  rodovia: RodoviaDer;
  lat: number;
  lon: number;
  distanciaMetros: number;
  km: number | null;
  precisaoKm: Precisao | null;
};

function projetarNoSegmento(p: LatLon, a: LatLon, b: LatLon): { ponto: LatLon; t: number } {
  const cos = Math.cos((p.lat * Math.PI) / 180);
  const ax = a.lon * cos;
  const ay = a.lat;
  const bx = b.lon * cos;
  const by = b.lat;
  const px = p.lon * cos;
  const py = p.lat;
  const dx = bx - ax;
  const dy = by - ay;
  const den = dx * dx + dy * dy;
  const t = den === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / den));
  return { ponto: { lat: ay + dy * t, lon: (ax + dx * t) / cos }, t };
}

/** Identifica a rodovia mais próxima de um clique e estima o km do ponto. */
export async function identificarPonto(
  ponto: LatLon,
  raioMetros = 500,
): Promise<PontoIdentificado | null> {
  let candidatas: Array<RodoviaDer & { linhas: LatLon[][] }>;
  try {
    candidatas = await derRodoviasProximas({
      data: { lat: ponto.lat, lon: ponto.lon, raioMetros },
    });
    marcarEstado(false);
  } catch {
    marcarEstado(true);
    return null;
  }

  let melhor: { rodovia: RodoviaDer; ponto: LatLon; dist: number } | null = null;
  for (const c of candidatas) {
    for (const linha of c.linhas) {
      for (let i = 1; i < linha.length; i++) {
        const { ponto: proj } = projetarNoSegmento(ponto, linha[i - 1]!, linha[i]!);
        const d = distanciaMetros(ponto, proj);
        if (!melhor || d < melhor.dist) {
          melhor = {
            rodovia: {
              codigo: c.codigo,
              nome: c.nome,
              classe: c.classe,
              pista: c.pista,
              extensao: c.extensao,
            },
            ponto: proj,
            dist: d,
          };
        }
      }
    }
  }
  if (!melhor) return null;

  const km = await estimarKm(melhor.rodovia.codigo, melhor.ponto);
  return {
    rodovia: melhor.rodovia,
    lat: melhor.ponto.lat,
    lon: melhor.ponto.lon,
    distanciaMetros: melhor.dist,
    km: km?.km ?? null,
    precisaoKm: km?.precisao ?? null,
  };
}

/** Estima o km de um ponto a partir dos marcos oficiais da rodovia. */
export async function estimarKm(
  codigo: string,
  ponto: LatLon,
): Promise<{ km: number; precisao: Precisao } | null> {
  const base = await consultarMarcos(codigo);
  if (!base || base.marcos.length === 0) return null;

  let melhor: { marco: Marco; d: number } | null = null;
  for (const m of base.marcos) {
    const d = distanciaMetros(ponto, m);
    if (!melhor || d < melhor.d) melhor = { marco: m, d };
  }
  if (!melhor) return null;

  const idx = base.marcos.indexOf(melhor.marco);
  const vizinhos = [base.marcos[idx - 1], base.marcos[idx + 1]].filter(Boolean) as Marco[];
  let resultado = { km: melhor.marco.km, precisao: "oficial" as Precisao };
  for (const v of vizinhos) {
    const { t } = projetarNoSegmento(ponto, melhor.marco, v);
    if (t > 0 && t < 1) {
      resultado = {
        km: melhor.marco.km + (v.km - melhor.marco.km) * t,
        precisao: "interpolada",
      };
      break;
    }
  }
  return resultado;
}

// ---------------------------------------------------------------- navegação externa

export function linkGoogleMaps(p: LatLon) {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
}

export function linkWaze(p: LatLon) {
  return `https://waze.com/ul?ll=${p.lat.toFixed(6)},${p.lon.toFixed(6)}&navigate=yes`;
}

export function linkOsm(p: LatLon) {
  return `https://www.openstreetmap.org/?mlat=${p.lat.toFixed(6)}&mlon=${p.lon.toFixed(6)}#map=16/${p.lat.toFixed(5)}/${p.lon.toFixed(5)}`;
}

export function textoCoordenadas(p: LatLon) {
  return `${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`;
}

// ---------------------------------------------------------------- camadas técnicas DER

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

export type LimiteRegionalDer = {
  numero: number;
  nome: string | null;
  municipios: string[];
  aneis: LatLon[][];
  bbox: BBoxLatLon;
};

export type CamadasDer = {
  rodovias: LinhaDer[];
  marcos: MarcoAreaDer[];
  limite: LimiteRegionalDer | null;
  bboxConsultado: BBoxLatLon | null;
  truncado: boolean;
  obtidoEm: number;
  aviso: string | null;
  fonte: FonteDado;
};

/** "CGR_03_BAURU" → 3 (mesma numeração das regionais na base do DER). */
export function numeroRegionalDer(codigo: string | null | undefined): number | null {
  if (!codigo) return null;
  const m = codigo.match(/CGR[_.\s-]*(\d{1,2})/i);
  return m ? Number(m[1]) : null;
}

function chaveArea(b: BBoxLatLon, regional: number | null, marcos: boolean) {
  const r = (n: number) => n.toFixed(2);
  return `camadas:${regional ?? "todas"}:${marcos ? "m" : "s"}:${r(b.sul)},${r(b.oeste)},${r(b.norte)},${r(b.leste)}`;
}

/**
 * Carrega as camadas oficiais (malha rodoviária, marcos quilométricos e limite
 * da regional) da área visível. Sem serviço, devolve a última base salva —
 * nunca substitui pelos dados do mapa-base.
 */
export async function carregarCamadasDer(opcoes: {
  bbox: BBoxLatLon;
  regionalCodigo?: string | null;
  marcos?: boolean;
}): Promise<CamadasDer | null> {
  const regional = numeroRegionalDer(opcoes.regionalCodigo);
  const marcos = opcoes.marcos ?? false;
  const chave = chaveArea(opcoes.bbox, regional, marcos);
  const r = await comContingencia(chave, async () =>
    derCamadas({
      data: {
        sul: opcoes.bbox.sul,
        norte: opcoes.bbox.norte,
        oeste: opcoes.bbox.oeste,
        leste: opcoes.bbox.leste,
        regional,
        marcos,
      },
    }),
  );
  if (!r) return null;
  const v = r.valor as unknown as Omit<CamadasDer, "fonte">;
  return { ...v, obtidoEm: r.em, fonte: r.fonte };
}
