/**
 * Leitura de PDFs de programação (executa somente no navegador).
 *
 * Fluxo: PDF completo -> todas as páginas -> todas as linhas ->
 * identificação da regional linha a linha -> registros estruturados.
 *
 * Nenhum agrupamento por página é assumido: cada linha é avaliada
 * individualmente e só herda contexto quando a própria linha não traz
 * a regional.
 */
import {
  detectarRegional,
  normalizarRodovia,
  normalizarTexto,
  parseData,
  parseKm,
} from "@/lib/regionais";

export type CampoTabela =
  | "equipe"
  | "funcionario"
  | "regional"
  | "categoria"
  | "contrato"
  | "atividade"
  | "rodovia"
  | "km_inicial"
  | "km_final"
  | "descricao"
  | "data_inicial"
  | "data_final"
  | "medicao"
  | "observacao";

export type RegistroExtraido = {
  chaveLocal: string;
  equipe: string | null;
  funcionario: string | null;
  regional_codigo: string | null;
  regional_confirmada: boolean;
  regional_origem: "linha" | "cabecalho_pagina" | "linha_anterior" | "nao_identificada";
  categoria: string | null;
  contrato: string | null;
  atividade: string | null;
  rodovia: string | null;
  km_inicial: number | null;
  km_final: number | null;
  descricao: string | null;
  data_inicial: string | null;
  data_final: string | null;
  medicao: string | null;
  observacao: string | null;
  pagina_pdf: number;
  linha_bruta: string;
  precisaRevisao: boolean;
  motivosRevisao: string[];
};

export type ResultadoLeitura = {
  nomeArquivo: string;
  hash: string;
  totalPaginas: number;
  paginasComOcr: number[];
  registros: RegistroExtraido[];
  periodo: { inicio: string | null; fim: string | null };
};

type Palavra = { texto: string; x: number; y: number; largura: number };
type Coluna = { campo: CampoTabela; inicio: number; fim: number };

const SINONIMOS: Array<{ campo: CampoTabela; termos: string[] }> = [
  { campo: "km_inicial", termos: ["km inicial", "km ini", "kminicial", "km de", "km inicio", "inicio km"] },
  { campo: "km_final", termos: ["km final", "km fim", "kmfinal", "km ate", "fim km"] },
  { campo: "data_inicial", termos: ["data inicial", "data inicio", "data de inicio", "dt inicial", "data"] },
  { campo: "data_final", termos: ["data final", "data fim", "dt final", "data termino"] },
  { campo: "equipe", termos: ["equipe", "turma"] },
  { campo: "funcionario", termos: ["funcionario", "responsavel", "fiscal", "encarregado", "colaborador"] },
  { campo: "regional", termos: ["regional", "cgr", "unidade"] },
  { campo: "categoria", termos: ["categoria", "tipo"] },
  { campo: "contrato", termos: ["contrato", "ct", "n contrato"] },
  { campo: "atividade", termos: ["atividade", "servico", "servicos"] },
  { campo: "rodovia", termos: ["rodovia", "sp", "via", "trecho"] },
  { campo: "descricao", termos: ["descricao", "detalhamento", "local"] },
  { campo: "medicao", termos: ["medicao", "medida", "quantidade", "qtde"] },
  { campo: "observacao", termos: ["observacao", "obs", "observacoes"] },
];

function classificarCabecalho(texto: string): CampoTabela | null {
  const t = normalizarTexto(texto).replace(/[.:]/g, "");
  if (!t) return null;
  for (const { campo, termos } of SINONIMOS) {
    for (const termo of termos) {
      if (t === termo || t.startsWith(`${termo} `) || t.includes(termo)) return campo;
    }
  }
  return null;
}

async function calcularHash(arquivo: File): Promise<string> {
  const buffer = await arquivo.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Agrupa palavras em linhas visuais usando a coordenada Y. */
function agruparLinhas(palavras: Palavra[], tolerancia = 3): Palavra[][] {
  const ordenadas = [...palavras].sort((a, b) => b.y - a.y || a.x - b.x);
  const linhas: Palavra[][] = [];
  let atual: Palavra[] = [];
  let yAtual: number | null = null;

  for (const p of ordenadas) {
    if (yAtual === null || Math.abs(p.y - yAtual) <= tolerancia) {
      atual.push(p);
      yAtual = yAtual === null ? p.y : (yAtual + p.y) / 2;
    } else {
      linhas.push(atual.sort((a, b) => a.x - b.x));
      atual = [p];
      yAtual = p.y;
    }
  }
  if (atual.length) linhas.push(atual.sort((a, b) => a.x - b.x));
  return linhas;
}

/** Tenta ler uma linha como cabeçalho de tabela. Retorna as colunas. */
function lerCabecalho(linha: Palavra[]): Coluna[] | null {
  const encontrados: Coluna[] = [];
  const usados = new Set<CampoTabela>();

  // agrupa palavras vizinhas para permitir "KM INICIAL" em duas células
  const celulas: Palavra[] = [];
  for (const p of linha) {
    const anterior = celulas[celulas.length - 1];
    if (anterior && p.x - (anterior.x + anterior.largura) < 6) {
      anterior.texto = `${anterior.texto} ${p.texto}`;
      anterior.largura = p.x + p.largura - anterior.x;
    } else {
      celulas.push({ ...p });
    }
  }

  for (const celula of celulas) {
    const campo = classificarCabecalho(celula.texto);
    if (campo && !usados.has(campo)) {
      usados.add(campo);
      encontrados.push({ campo, inicio: celula.x, fim: celula.x + celula.largura });
    }
  }

  if (encontrados.length < 3) return null;

  encontrados.sort((a, b) => a.inicio - b.inicio);
  // expande os limites até a metade do espaço entre colunas vizinhas
  return encontrados.map((col, i) => {
    const anterior = encontrados[i - 1];
    const proximo = encontrados[i + 1];
    return {
      campo: col.campo,
      inicio: anterior ? (anterior.fim + col.inicio) / 2 : -Infinity,
      fim: proximo ? (col.fim + proximo.inicio) / 2 : Infinity,
    };
  });
}

function distribuirEmColunas(linha: Palavra[], colunas: Coluna[]): Partial<Record<CampoTabela, string>> {
  const saida: Partial<Record<CampoTabela, string>> = {};
  for (const p of linha) {
    const centro = p.x + p.largura / 2;
    const col =
      colunas.find((c) => centro >= c.inicio && centro < c.fim) ??
      colunas.reduce((melhor, c) => {
        const d = Math.min(Math.abs(centro - c.inicio), Math.abs(centro - c.fim));
        const dMelhor = Math.min(Math.abs(centro - melhor.inicio), Math.abs(centro - melhor.fim));
        return d < dMelhor ? c : melhor;
      });
    if (!col) continue;
    saida[col.campo] = saida[col.campo] ? `${saida[col.campo]} ${p.texto}` : p.texto;
  }
  return saida;
}

const RE_RODOVIA = /\b(SPA|SPM|SPI|SP|BR|VIC|VCS)\s*[-.]?\s*\d{2,3}/i;

function linhaEhDado(texto: string): boolean {
  const t = normalizarTexto(texto);
  if (t.length < 6) return false;
  if (/^(pagina|page)\b/.test(t)) return false;
  if (/total de registros|assinatura|emitido em/.test(t)) return false;
  return RE_RODOVIA.test(texto) || /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(texto) || /\bkm\b/i.test(texto);
}

/** Extração de reserva quando o cabeçalho não pôde ser identificado. */
function extrairPorRegex(texto: string): Partial<Record<CampoTabela, string>> {
  const saida: Partial<Record<CampoTabela, string>> = {};
  const rodovia = texto.match(RE_RODOVIA);
  if (rodovia) saida.rodovia = rodovia[0];

  const kms = [...texto.matchAll(/\b(?:km\s*)?(\d{1,4}[.,]\d{1,3})\b/gi)].map((m) => m[1] ?? "");
  if (kms[0]) saida.km_inicial = kms[0];
  if (kms[1]) saida.km_final = kms[1];

  const datas = [...texto.matchAll(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g)].map((m) => m[0]);
  if (datas[0]) saida.data_inicial = datas[0];
  if (datas[1]) saida.data_final = datas[1];

  saida.descricao = texto;
  return saida;
}

function limpar(valor: string | undefined | null): string | null {
  if (!valor) return null;
  const t = valor.replace(/\s+/g, " ").trim();
  return t.length ? t : null;
}

export async function lerProgramacaoPdf(
  arquivo: File,
  aoProgredir?: (mensagem: string, progresso: number) => void,
): Promise<ResultadoLeitura> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (
    await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
  ).default;

  const hash = await calcularHash(arquivo);
  const dados = new Uint8Array(await arquivo.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: dados }).promise;

  const registros: RegistroExtraido[] = [];
  const paginasComOcr: number[] = [];
  let colunas: Coluna[] | null = null;
  let regionalAnterior: string | null = null;

  for (let numeroPagina = 1; numeroPagina <= doc.numPages; numeroPagina++) {
    aoProgredir?.(`Lendo página ${numeroPagina} de ${doc.numPages}`, numeroPagina / doc.numPages);
    const pagina = await doc.getPage(numeroPagina);
    const conteudo = await pagina.getTextContent();

    let palavras: Palavra[] = conteudo.items
      .filter((item): item is Extract<typeof item, { str: string }> => "str" in item)
      .filter((item) => item.str.trim().length > 0)
      .map((item) => {
        const t = item.transform as number[];
        return {
          texto: item.str.trim(),
          x: t[4] ?? 0,
          y: t[5] ?? 0,
          largura: item.width ?? item.str.length * 4,
        };
      });

    let linhasTexto: string[] | null = null;

    // OCR apenas quando a página não tem texto nativo utilizável
    if (palavras.length < 5) {
      aoProgredir?.(`Executando OCR na página ${numeroPagina}`, numeroPagina / doc.numPages);
      linhasTexto = await ocrDaPagina(pagina as unknown as PaginaRenderizavel);
      paginasComOcr.push(numeroPagina);
      palavras = [];
    }

    const linhas = palavras.length ? agruparLinhas(palavras) : [];
    const textoPagina = linhas.map((l) => l.map((p) => p.texto).join(" ")).join("\n");
    const regionalDaPagina = detectarRegional(textoPagina.split("\n").slice(0, 6).join(" "));

    const fontesDeLinha: Array<{ linha: Palavra[] | null; texto: string }> = linhas.length
      ? linhas.map((l) => ({ linha: l, texto: l.map((p) => p.texto).join(" ") }))
      : (linhasTexto ?? []).map((texto) => ({ linha: null, texto }));

    for (const { linha, texto } of fontesDeLinha) {
      if (linha) {
        const possivelCabecalho = lerCabecalho(linha);
        if (possivelCabecalho) {
          colunas = possivelCabecalho;
          continue;
        }
      }
      if (!linhaEhDado(texto)) continue;

      const bruto =
        linha && colunas ? distribuirEmColunas(linha, colunas) : extrairPorRegex(texto);

      const motivos: string[] = [];
      if (!linha || !colunas) motivos.push("Linha lida sem cabeçalho de tabela identificado");

      // --- Regional: linha a linha ---
      let origem: RegistroExtraido["regional_origem"] = "linha";
      let regional =
        detectarRegional(bruto.regional ?? null) ??
        detectarRegional(texto);
      if (!regional && regionalDaPagina) {
        regional = regionalDaPagina;
        origem = "cabecalho_pagina";
      }
      if (!regional && regionalAnterior) {
        regional = regionalAnterior;
        origem = "linha_anterior";
      }
      if (!regional) {
        origem = "nao_identificada";
        motivos.push("Regional não confirmada");
      }
      if (regional) regionalAnterior = regional;

      const kmInicial = parseKm(bruto.km_inicial ?? null);
      const kmFinal = parseKm(bruto.km_final ?? null);
      const rodovia = normalizarRodovia(bruto.rodovia ?? null);
      if (!rodovia) motivos.push("Rodovia não identificada");
      if (kmInicial === null) motivos.push("KM inicial ausente");

      const dataInicial = parseData(bruto.data_inicial ?? null);
      const dataFinal = parseData(bruto.data_final ?? null) ?? dataInicial;

      registros.push({
        chaveLocal: `${numeroPagina}-${registros.length}`,
        equipe: limpar(bruto.equipe),
        funcionario: limpar(bruto.funcionario),
        regional_codigo: regional,
        regional_confirmada: origem === "linha",
        regional_origem: origem,
        categoria: limpar(bruto.categoria),
        contrato: limpar(bruto.contrato),
        atividade: limpar(bruto.atividade),
        rodovia,
        km_inicial: kmInicial,
        km_final: kmFinal,
        descricao: limpar(bruto.descricao),
        data_inicial: dataInicial,
        data_final: dataFinal,
        medicao: limpar(bruto.medicao),
        observacao: limpar(bruto.observacao),
        pagina_pdf: numeroPagina,
        linha_bruta: texto,
        precisaRevisao: motivos.length > 0,
        motivosRevisao: motivos,
      });
    }
  }

  const datas = registros.map((r) => r.data_inicial).filter((d): d is string => !!d).sort();

  return {
    nomeArquivo: arquivo.name,
    hash,
    totalPaginas: doc.numPages,
    paginasComOcr,
    registros,
    periodo: { inicio: datas[0] ?? null, fim: datas[datas.length - 1] ?? null },
  };
}

/** OCR de reserva para páginas escaneadas. Carregado sob demanda. */
type PaginaRenderizavel = {
  getViewport: (p: { scale: number }) => { width: number; height: number };
  render: (p: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
    canvas: HTMLCanvasElement;
  }) => { promise: Promise<void> };
};

async function ocrDaPagina(pagina: PaginaRenderizavel): Promise<string[]> {
  const viewport = pagina.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  await pagina.render({ canvasContext: ctx, viewport, canvas }).promise;

  const { default: Tesseract } = await import("tesseract.js");
  const resultado = await Tesseract.recognize(canvas, "por");
  return resultado.data.text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}
