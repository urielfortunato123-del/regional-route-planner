/**
 * Reconhecimento e normalização de regionais.
 * Usado tanto no parser (navegador) quanto nas funções de servidor.
 * Módulo puro: não importa nada do Supabase nem do DOM.
 */

export type RegionalDef = {
  codigo: string;
  numero: number;
  nome: string;
  rotulo: string;
  aliases: string[];
};

export const REGIONAIS: RegionalDef[] = [
  {
    codigo: "CGR_02_ITAPETININGA",
    numero: 2,
    nome: "Itapetininga",
    rotulo: "CGR.2 – Itapetininga",
    aliases: ["itapetininga"],
  },
  {
    codigo: "CGR_03_BAURU",
    numero: 3,
    nome: "Bauru",
    rotulo: "CGR.3 – Bauru",
    aliases: ["bauru"],
  },
  {
    codigo: "CGR_13_RIO_CLARO",
    numero: 13,
    nome: "Rio Claro",
    rotulo: "CGR.13 – Rio Claro",
    aliases: ["rio claro", "rioclaro"],
  },
];

export function regionalPorCodigo(codigo: string | null | undefined) {
  if (!codigo) return undefined;
  return REGIONAIS.find((r) => r.codigo === codigo);
}

export function rotuloRegional(codigo: string | null | undefined) {
  return regionalPorCodigo(codigo)?.rotulo ?? "Regional não confirmada";
}

/** Remove acentos, baixa caixa e colapsa espaços. */
export function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Ocorrências do código explícito da regional ("CGR.3", "CGR 03", "CGR-13").
 * Tolerante a ponto, espaço, hífen, travessão e zero à esquerda.
 */
function ocorrenciasCgr(textoNormalizado: string): Array<{ indice: number; codigo: string }> {
  const achados: Array<{ indice: number; codigo: string }> = [];
  const re = /\bc\s*\.?\s*g\s*\.?\s*r\s*\.?\s*[-–—.\s]{0,3}\s*0*(\d{1,2})\b/g;
  for (const m of textoNormalizado.matchAll(re)) {
    const encontrada = REGIONAIS.find((r) => r.numero === Number(m[1] ?? ""));
    if (encontrada) achados.push({ indice: m.index ?? 0, codigo: encontrada.codigo });
  }
  return achados;
}

/**
 * Regional da COLUNA REGIONAL de uma linha: exige o código explícito "CGR.n".
 * Nunca usa título, cabeçalho da página ou nome do gerenciamento.
 */
export function detectarRegionalNaLinha(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const t = normalizarTexto(texto);
  if (!t) return null;
  const achados = ocorrenciasCgr(t).sort((a, b) => a.indice - b.indice);
  return achados[0]?.codigo ?? null;
}

/**
 * Identifica a regional em um trecho de texto livre.
 * Aceita variações: "CGR.2 – Itapetininga", "CGR 2", "CGR.02",
 * "Itapetininga", "Regional 2", "DR-02", "C.G.R. 13".
 * O código "CGR.n" tem prioridade sobre o nome do município.
 */
export function detectarRegional(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const explicito = detectarRegionalNaLinha(texto);
  if (explicito) return explicito;

  // remove trechos de gerenciamento/título, que não representam a regional da linha
  const t = normalizarTexto(texto).replace(/gerenciamento[^\n]{0,40}/g, " ");
  if (!t) return null;

  // 1) Nome do município / apelidos textuais (o que aparecer primeiro)
  let melhor: { indice: number; codigo: string } | null = null;
  for (const r of REGIONAIS) {
    for (const alias of r.aliases) {
      const i = t.indexOf(alias);
      if (i >= 0 && (!melhor || i < melhor.indice)) melhor = { indice: i, codigo: r.codigo };
    }
  }
  if (melhor) return melhor.codigo;

  // 2) Outros códigos numéricos
  const padroes = [
    /\bd\.?\s?r\.?\s*[-–.\s]?\s*0*(\d{1,2})\b/,
    /\bregional\s*[-–.\s]?\s*0*(\d{1,2})\b/,
  ];
  for (const padrao of padroes) {
    const m = t.match(padrao);
    if (m) {
      const numero = Number(m[1] ?? "");
      const achado = REGIONAIS.find((r) => r.numero === numero);
      if (achado) return achado.codigo;
    }
  }

  return null;
}


/** Converte "302,900" / "302.900" / "KM 328+700" em número de km. */
export function parseKm(valor: string | null | undefined): number | null {
  if (!valor) return null;
  const t = String(valor).trim();
  // formato km 328+700 (metros após o "+")
  const mais = t.match(/(\d{1,4})\s*\+\s*(\d{1,3})/);
  if (mais) return Number(mais[1] ?? 0) + Number(mais[2] ?? 0) / 1000;

  const limpo = t.replace(/km/gi, "").replace(/[^\d,.-]/g, "").trim();
  if (!limpo) return null;

  // Decide qual separador é o decimal
  let numero = limpo;
  if (limpo.includes(",") && limpo.includes(".")) {
    numero = limpo.replace(/\./g, "").replace(",", ".");
  } else if (limpo.includes(",")) {
    numero = limpo.replace(",", ".");
  }
  const n = Number(numero);
  return Number.isFinite(n) ? n : null;
}

/** Normaliza rodovias: "sp304", "SP-304", "spa 341/304", "SPM 304 D". */
export function normalizarRodovia(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const t = valor.toUpperCase().replace(/\s+/g, " ").trim();
  const m = t.match(/\b(SPA|SPM|SPI|SP|BR|VIC|VCS)\s*[-.]?\s*([0-9]{2,3}(?:\s*\/\s*[0-9]{2,3})?)\s*([A-Z])?\b/);
  if (!m) return t || null;
  const sufixo = m[3] ? ` ${m[3]}` : "";
  return `${m[1]} ${(m[2] ?? "").replace(/\s*\/\s*/, "/")}${sufixo}`;
}

/** Converte datas dd/mm/aaaa, d/m/aa, aaaa-mm-dd para ISO (aaaa-mm-dd). */
export function parseData(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const t = valor.trim();
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${(iso[2] ?? "").padStart(2, "0")}-${(iso[3] ?? "").padStart(2, "0")}`;
  }
  const br = t.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (!br) return null;
  const dia = (br[1] ?? "").padStart(2, "0");
  const mes = (br[2] ?? "").padStart(2, "0");
  let ano = br[3] ?? "";
  if (ano.length === 2) ano = `20${ano}`;
  const d = Number(dia);
  const m = Number(mes);
  if (d < 1 || d > 31 || m < 1 || m > 12) return null;
  return `${ano}-${mes}-${dia}`;
}
