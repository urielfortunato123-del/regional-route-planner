/**
 * Núcleo da leitura da programação — sem dependência de PDF ou navegador.
 *
 * Recebe as páginas já convertidas em palavras (com coordenadas) ou em linhas
 * de texto puro e devolve os registros estruturados, o diagnóstico linha a
 * linha e o período declarado no arquivo.
 *
 * Fica separado do leitor de PDF para poder ser testado automaticamente.
 */
import {
  detectarRegional,
  detectarRegionalNaLinha,
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

/** Situação de conferência de cada linha lida. */
export type StatusConferencia =
  | "OK"
  | "DATA_FORA_DO_PERIODO_CONFERIR"
  | "REGIONAL_NAO_IDENTIFICADA"
  | "DADOS_INCOMPLETOS";

export const ROTULO_CONFERENCIA: Record<StatusConferencia, string> = {
  OK: "Conferida",
  DATA_FORA_DO_PERIODO_CONFERIR: "Data fora do período — conferir",
  REGIONAL_NAO_IDENTIFICADA: "Regional não identificada",
  DADOS_INCOMPLETOS: "Dados incompletos",
};

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
  status_conferencia: StatusConferencia;
  motivo_conferencia: string | null;
  data_fora_periodo: boolean;
  periodo_inicio_esperado: string | null;
  periodo_fim_esperado: string | null;
};

/** Diagnóstico linha a linha (Página | Linha | Texto | Regional | Status | Motivo). */
export type LinhaDiagnostico = {
  pagina: number;
  linha: number;
  texto: string;
  regional: string | null;
  rodovia: string | null;
  km_inicial: number | null;
  km_final: number | null;
  data_inicial: string | null;
  data_final: string | null;
  status: "aceita" | "conferencia" | "ignorada";
  status_conferencia: StatusConferencia | null;
  motivo: string;
};

export type ResultadoLeitura = {
  nomeArquivo: string;
  hash: string;
  totalPaginas: number;
  paginasComOcr: number[];
  registros: RegistroExtraido[];
  periodo: { inicio: string | null; fim: string | null };
  periodoDeclarado: { inicio: string | null; fim: string | null };
  diagnostico: LinhaDiagnostico[];
};

export type Palavra = { texto: string; x: number; y: number; largura: number };
type Coluna = { campo: CampoTabela; inicio: number; fim: number };

/** Página já extraída: palavras posicionadas ou linhas de texto (OCR). */
export type PaginaLida = {
  numero: number;
  palavras: Palavra[];
  linhasTexto?: string[] | null;
};

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

/**
 * Classifica a célula de um possível cabeçalho de tabela.
 * Casamento estrito: nada de "includes", senão células de dados como
 * "ACOMP. SERVIÇOS / TOLERÂNCIA ZERO" seriam lidas como cabeçalho e a linha
 * inteira (com sua regional) seria descartada.
 */
function classificarCabecalho(texto: string): CampoTabela | null {
  const t = normalizarTexto(texto).replace(/[.:]/g, "");
  if (!t || t.length > 30) return null;
  if (/\d/.test(t)) return null; // cabeçalhos não têm números
  for (const { campo, termos } of SINONIMOS) {
    for (const termo of termos) {
      if (t === termo || t.startsWith(`${termo} `)) return campo;
    }
  }
  return null;
}

/** Agrupa palavras em linhas visuais usando a coordenada Y. */
export function agruparLinhas(palavras: Palavra[], tolerancia = 3): Palavra[][] {
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

/**
 * Uma linha que traz data, quilometragem ou o código de uma regional é dado,
 * nunca cabeçalho.
 */
function pareceLinhaDeDados(texto: string): boolean {
  if (/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(texto)) return true;
  if (detectarRegionalNaLinha(texto)) return true;
  return (texto.match(/\b\d{1,4}[.,]\d{1,3}\b/g)?.length ?? 0) >= 2;
}

/** Tenta ler uma linha como cabeçalho de tabela. Retorna as colunas. */
function lerCabecalho(linha: Palavra[]): Coluna[] | null {
  if (pareceLinhaDeDados(linha.map((p) => p.texto).join(" "))) return null;

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

function distribuirEmColunas(
  linha: Palavra[],
  colunas: Coluna[],
): Partial<Record<CampoTabela, string>> {
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

const RE_RODOVIA =
  /\b(SPA|SPM|SPI|SP|BR|VIC|VCS)\s*[-.]?\s*\d{2,3}(?:\s*\/\s*\d{2,3})?(?:\s+[A-Z]\b)?/i;
const RE_RODOVIA_G = new RegExp(RE_RODOVIA.source, "gi");
const RE_REGIONAL_ROTULO =
  /\bCGR\.?\s*\d{1,2}\s*[-–]\s*[A-Za-zÀ-ÿ]+(?:\s+(?!Conserva|Manuten|Melhor|Emerg|Obras|Rotina|Sinaliza)[A-Za-zÀ-ÿ]{2,})*/i;
const RE_CONTRATO = /\d{2}\.\d{3}-\d[^]*?(?:\)|(?=\s[A-ZÀ-Ÿ][a-zà-ÿ]))/;
const RE_KM = /\b\d{1,4}[.,]\d{1,3}\b/g;
const RE_DATA = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g;

const RE_IGNORAR =
  /^(versao|diretoria de operacoes|planejamento (semanal|diario|quinzenal|mensal)|gerenciamento me|pagina|page)/;

function linhaEhDado(texto: string): boolean {
  const t = normalizarTexto(texto);
  if (t.length < 6) return false;
  if (RE_IGNORAR.test(t)) return false;
  if (/total de registros|assinatura|emitido em/.test(t)) return false;
  return RE_RODOVIA.test(texto) || /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(texto) || /\bkm\b/i.test(texto);
}

/** Um valor só é texto útil se não for apenas números, datas e quilometragens. */
function textoUtil(valor: string): boolean {
  const semNumeros = valor
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, " ")
    .replace(/\b\d{1,4}[.,]\d{1,3}\b/g, " ")
    .replace(/[\d\s.,;/-]/g, "");
  return semNumeros.length >= 2;
}

/**
 * Extração por âncoras: usa a ordem natural da linha da programação
 * (equipe → regional → categoria → contrato → atividade → rodovia → km →
 * descrição → datas → medição → observação).
 */
function extrairPorAncoras(texto: string): Partial<Record<CampoTabela, string>> | null {
  const linha = texto.replace(/\s+/g, " ").trim();

  const mRegional = linha.match(RE_REGIONAL_ROTULO);
  const mRodovia = linha.match(RE_RODOVIA);
  if (!mRodovia || mRodovia.index === undefined) return null;

  const saida: Partial<Record<CampoTabela, string>> = {};
  const inicioRodovia = mRodovia.index;

  if (mRegional && mRegional.index !== undefined && mRegional.index < inicioRodovia) {
    saida.regional = mRegional[0];
    const equipe = linha.slice(0, mRegional.index).trim();
    if (equipe) saida.equipe = equipe;

    const meio = linha.slice(mRegional.index + mRegional[0].length, inicioRodovia).trim();
    const mContrato = meio.match(RE_CONTRATO) ?? meio.match(/\(\s*RC[^)]*\)/i);
    if (mContrato && mContrato.index !== undefined) {
      const categoria = meio.slice(0, mContrato.index).trim();
      if (categoria) saida.categoria = categoria;
      saida.contrato = mContrato[0].trim();
      const atividade = meio.slice(mContrato.index + mContrato[0].length).trim();
      if (atividade) saida.atividade = atividade;
    } else if (meio) {
      saida.categoria = meio;
    }
  } else {
    const antes = linha.slice(0, inicioRodovia).trim();
    if (antes) saida.categoria = antes;
  }

  saida.rodovia = mRodovia[0];

  const resto = linha.slice(inicioRodovia + mRodovia[0].length);

  RE_KM.lastIndex = 0;
  const kms = [...resto.matchAll(RE_KM)];
  RE_DATA.lastIndex = 0;
  const datas = [...resto.matchAll(RE_DATA)];

  // números de km não podem estar depois da primeira data
  const limiteData = datas[0]?.index ?? resto.length;
  const kmsValidos = kms.filter((m) => (m.index ?? 0) < limiteData);
  if (kmsValidos[0]) saida.km_inicial = kmsValidos[0][0];
  if (kmsValidos[1]) saida.km_final = kmsValidos[1][0];

  const fimKm = kmsValidos.length
    ? (kmsValidos[kmsValidos.length - 1]!.index ?? 0) +
      kmsValidos[kmsValidos.length - 1]![0].length
    : 0;

  if (datas[0]) {
    saida.data_inicial = datas[0][0];
    const descricao = resto.slice(fimKm, datas[0].index).trim();
    if (descricao) saida.descricao = descricao;
  } else {
    const descricao = resto.slice(fimKm).trim();
    if (descricao) saida.descricao = descricao;
  }
  if (datas[1]) saida.data_final = datas[1][0];

  const ultimaData = datas[datas.length - 1];
  if (ultimaData) {
    const cauda = resto.slice((ultimaData.index ?? 0) + ultimaData[0].length).trim();
    const mMedicao = cauda.match(/^([\d.,]+)\s*(.*)$/s);
    if (mMedicao) {
      saida.medicao = mMedicao[1] ?? "";
      const obs = (mMedicao[2] ?? "").trim();
      if (obs) saida.observacao = obs;
    } else if (cauda) {
      saida.observacao = cauda;
    }
  }

  return saida;
}

/** Extração de reserva quando não há âncoras suficientes. */
function extrairPorRegex(texto: string): Partial<Record<CampoTabela, string>> {
  const saida: Partial<Record<CampoTabela, string>> = {};
  RE_RODOVIA_G.lastIndex = 0;
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

/**
 * Período informado no nome do arquivo ou no texto ("27-07-26 a 31-07-26").
 * Serve apenas para sinalizar datas fora da semana; nenhuma linha é descartada.
 */
export function detectarPeriodoDeclarado(texto: string): {
  inicio: string | null;
  fim: string | null;
} {
  const m = texto.match(
    /(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\s*(?:a|à|ate|até|-|–)\s*(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/i,
  );
  if (!m) return { inicio: null, fim: null };
  const inicio = parseData(`${m[1]}/${m[2]}/${m[3]}`);
  const fim = parseData(`${m[4]}/${m[5]}/${m[6]}`);
  return inicio && fim ? { inicio, fim } : { inicio: null, fim: null };
}

/**
 * Processa as páginas já lidas. Nenhuma linha reconhecida é descartada:
 * o que não estiver completo entra com status de conferência.
 */
export function processarPaginas(
  paginas: PaginaLida[],
  nomeArquivo: string,
): {
  registros: RegistroExtraido[];
  diagnostico: LinhaDiagnostico[];
  periodoDeclarado: { inicio: string | null; fim: string | null };
  periodo: { inicio: string | null; fim: string | null };
} {
  const registros: RegistroExtraido[] = [];
  const diagnostico: LinhaDiagnostico[] = [];
  let colunas: Coluna[] | null = null;
  let regionalAnterior: string | null = null;
  let periodoDeclarado = detectarPeriodoDeclarado(nomeArquivo);

  for (const pagina of paginas) {
    const numeroPagina = pagina.numero;
    const linhas = pagina.palavras.length ? agruparLinhas(pagina.palavras) : [];
    const textoPagina = linhas.length
      ? linhas.map((l) => l.map((p) => p.texto).join(" ")).join("\n")
      : (pagina.linhasTexto ?? []).join("\n");
    if (!periodoDeclarado.inicio) periodoDeclarado = detectarPeriodoDeclarado(textoPagina);

    const fontesDeLinha: Array<{ linha: Palavra[] | null; texto: string }> = linhas.length
      ? linhas.map((l) => ({ linha: l, texto: l.map((p) => p.texto).join(" ") }))
      : (pagina.linhasTexto ?? []).map((texto) => ({ linha: null, texto }));

    let yAnterior: number | null = null;
    let numeroLinha = 0;
    for (const { linha, texto } of fontesDeLinha) {
      numeroLinha += 1;

      if (linha) {
        const possivelCabecalho = lerCabecalho(linha);
        if (possivelCabecalho) {
          colunas = possivelCabecalho;
          diagnostico.push({
            pagina: numeroPagina,
            linha: numeroLinha,
            texto,
            regional: null,
            rodovia: null,
            km_inicial: null,
            km_final: null,
            data_inicial: null,
            data_final: null,
            status: "ignorada",
            status_conferencia: null,
            motivo: "Cabeçalho da tabela",
          });
          continue;
        }
      }
      const yLinha = linha?.length ? linha.reduce((s, p) => s + p.y, 0) / linha.length : null;

      if (!linhaEhDado(texto)) {
        // continuação de célula (descrição/observação quebrada em várias linhas)
        const anterior = registros[registros.length - 1];
        let motivo = "Linha sem rodovia, km ou data (texto auxiliar)";
        if (anterior && linha && colunas && anterior.pagina_pdf === numeroPagina) {
          const partes = distribuirEmColunas(linha, colunas);
          const acima = yLinha !== null && yAnterior !== null && yLinha > yAnterior;
          for (const campo of ["descricao", "observacao"] as const) {
            const valor = partes[campo];
            if (valor && textoUtil(valor)) {
              motivo = "Continuação da linha anterior (descrição/observação)";
              const atual = anterior[campo];
              anterior[campo] = atual ? (acima ? `${valor} ${atual}` : `${atual} ${valor}`) : valor;
            }
          }
        }
        diagnostico.push({
          pagina: numeroPagina,
          linha: numeroLinha,
          texto,
          regional: null,
          rodovia: null,
          km_inicial: null,
          km_final: null,
          data_inicial: null,
          data_final: null,
          status: "ignorada",
          status_conferencia: null,
          motivo,
        });
        continue;
      }

      yAnterior = yLinha;

      const porAncoras = extrairPorAncoras(texto);
      const porColunas = linha && colunas ? distribuirEmColunas(linha, colunas) : null;
      const bruto = porAncoras ?? porColunas ?? extrairPorRegex(texto);

      if (porAncoras && porColunas) {
        for (const campo of [
          "equipe",
          "funcionario",
          "categoria",
          "contrato",
          "atividade",
          "descricao",
          "observacao",
        ] as const) {
          const valor = porColunas[campo];
          if (!bruto[campo] && valor && textoUtil(valor)) bruto[campo] = valor;
        }
      }
      for (const campo of [
        "equipe",
        "funcionario",
        "categoria",
        "atividade",
        "descricao",
        "observacao",
      ] as const) {
        const valor = bruto[campo];
        if (valor && !textoUtil(valor)) delete bruto[campo];
      }

      const motivos: string[] = [];
      if (!porAncoras && !porColunas) motivos.push("Linha lida sem cabeçalho de tabela identificado");

      // --- Regional: exclusivamente pela coluna REGIONAL da própria linha ---
      let origem: RegistroExtraido["regional_origem"] = "linha";
      let regional =
        detectarRegionalNaLinha(bruto.regional ?? null) ??
        detectarRegionalNaLinha(texto) ??
        detectarRegional(bruto.regional ?? null);
      if (!regional && regionalAnterior) {
        regional = regionalAnterior;
        origem = "linha_anterior";
        motivos.push("Regional herdada da linha anterior — conferir");
      }
      if (!regional) {
        origem = "nao_identificada";
        motivos.push("Regional não identificada na coluna REGIONAL");
      }
      if (regional && origem === "linha") regionalAnterior = regional;

      const kmInicial = parseKm(bruto.km_inicial ?? null);
      const kmFinal = parseKm(bruto.km_final ?? null);
      const rodovia = normalizarRodovia(bruto.rodovia ?? null);
      if (!rodovia) motivos.push("Rodovia não identificada");
      if (kmInicial === null) motivos.push("KM inicial ausente");

      const dataInicial = parseData(bruto.data_inicial ?? null);
      const dataFinal = parseData(bruto.data_final ?? null) ?? dataInicial;

      const status: StatusConferencia = !regional
        ? "REGIONAL_NAO_IDENTIFICADA"
        : motivos.length
          ? "DADOS_INCOMPLETOS"
          : "OK";

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
        status_conferencia: status,
        motivo_conferencia: motivos.join(" · ") || null,
        data_fora_periodo: false,
        periodo_inicio_esperado: null,
        periodo_fim_esperado: null,
      });

      diagnostico.push({
        pagina: numeroPagina,
        linha: numeroLinha,
        texto,
        regional,
        rodovia,
        km_inicial: kmInicial,
        km_final: kmFinal,
        data_inicial: dataInicial,
        data_final: dataFinal,
        status: motivos.length ? "conferencia" : "aceita",
        status_conferencia: status,
        motivo: motivos.join(" · ") || "Linha válida",
      });
    }
  }

  // datas fora do período informado no PDF: manter, apenas sinalizar
  if (periodoDeclarado.inicio && periodoDeclarado.fim) {
    for (const registro of registros) {
      registro.periodo_inicio_esperado = periodoDeclarado.inicio;
      registro.periodo_fim_esperado = periodoDeclarado.fim;
      if (!registro.data_inicial) continue;
      if (
        registro.data_inicial >= periodoDeclarado.inicio &&
        registro.data_inicial <= periodoDeclarado.fim
      ) {
        continue;
      }
      const motivo = `Data ${registro.data_inicial} fora do período ${periodoDeclarado.inicio} a ${periodoDeclarado.fim} — conferir`;
      registro.motivosRevisao.push(motivo);
      registro.precisaRevisao = true;
      registro.data_fora_periodo = true;
      registro.status_conferencia = "DATA_FORA_DO_PERIODO_CONFERIR";
      registro.motivo_conferencia = registro.motivosRevisao.join(" · ");
      const item = diagnostico.find(
        (d) => d.pagina === registro.pagina_pdf && d.texto === registro.linha_bruta,
      );
      if (item) {
        item.status = "conferencia";
        item.status_conferencia = "DATA_FORA_DO_PERIODO_CONFERIR";
        item.motivo = registro.motivosRevisao.join(" · ");
      }
    }
  }

  const datas = registros
    .map((r) => r.data_inicial)
    .filter((d): d is string => !!d)
    .sort();

  return {
    registros,
    diagnostico,
    periodoDeclarado,
    periodo: { inicio: datas[0] ?? null, fim: datas[datas.length - 1] ?? null },
  };
}

/** Conversão de linhas de texto puro (usada em testes e no OCR). */
export function processarTexto(paginasDeTexto: string[][], nomeArquivo: string) {
  return processarPaginas(
    paginasDeTexto.map((linhasTexto, i) => ({ numero: i + 1, palavras: [], linhasTexto })),
    nomeArquivo,
  );
}
