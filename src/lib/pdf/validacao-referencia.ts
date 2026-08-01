/**
 * Validação automática da leitura contra arquivos de referência conhecidos.
 *
 * Serve para provar, a cada importação, que nenhuma linha se perdeu e que as
 * regionais continuam sendo reconhecidas linha a linha (o caso conhecido é a
 * CGR.3 – Bauru na página 3 do planejamento ME2 Itapetininga).
 */
import type { LinhaDiagnostico, RegistroExtraido } from "@/lib/pdf/nucleo";

export type Expectativa = {
  /** Trecho do nome do arquivo, já normalizado (sem acento, minúsculo). */
  arquivo: string;
  descricao: string;
  totalPaginas?: number;
  /** Contagem obrigatória de linhas por página e regional. */
  porPaginaRegional: Array<{ pagina: number; regional: string; esperado: number }>;
};

export const EXPECTATIVAS: Expectativa[] = [
  {
    arquivo: "03-08-26 a 07-08-26",
    descricao: "PLANEJAMENTO DE PROGRAMAÇÕES ME2 ITAPÊ – 03-08-26 a 07-08-26 (ATUAL)",
    totalPaginas: 3,
    porPaginaRegional: [{ pagina: 3, regional: "CGR_03_BAURU", esperado: 10 }],
  },
];

export type ItemVerificacao = {
  titulo: string;
  esperado: number;
  encontrado: number;
  ok: boolean;
  detalhe: string;
};

export type ResultadoReferencia = {
  aplicavel: boolean;
  arquivo: string;
  descricao: string | null;
  itens: ItemVerificacao[];
  aprovado: boolean;
};

const normaliza = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function encontrarExpectativa(nomeArquivo: string): Expectativa | null {
  const alvo = normaliza(nomeArquivo);
  return EXPECTATIVAS.find((e) => alvo.includes(normaliza(e.arquivo))) ?? null;
}

/**
 * Conciliação de totais: linhas reconhecidas = aceitas + em conferência,
 * e todo registro extraído tem uma linha correspondente no diagnóstico.
 */
export function conciliarTotais(
  registros: RegistroExtraido[],
  diagnostico: LinhaDiagnostico[],
): ItemVerificacao[] {
  const reconhecidas = diagnostico.filter((d) => d.status !== "ignorada");
  const aceitas = diagnostico.filter((d) => d.status === "aceita").length;
  const conferencia = diagnostico.filter((d) => d.status === "conferencia").length;

  return [
    {
      titulo: "Linhas reconhecidas × registros gerados",
      esperado: reconhecidas.length,
      encontrado: registros.length,
      ok: reconhecidas.length === registros.length,
      detalhe:
        reconhecidas.length === registros.length
          ? "Nenhuma linha reconhecida ficou de fora."
          : "Há linhas reconhecidas que não viraram registro — perda silenciosa.",
    },
    {
      titulo: "Registros = prontos + em conferência",
      esperado: registros.length,
      encontrado: aceitas + conferencia,
      ok: registros.length === aceitas + conferencia,
      detalhe: `${aceitas} pronta(s) e ${conferencia} em conferência.`,
    },
    {
      titulo: "Registros com regional identificada",
      esperado: registros.length,
      encontrado: registros.filter((r) => !!r.regional_codigo).length,
      ok: registros.every((r) => !!r.regional_codigo),
      detalhe: "Linhas sem regional continuam na conferência, nunca são descartadas.",
    },
  ];
}

/** Aplica as expectativas do arquivo de referência (quando houver) + conciliação. */
export function validarLeitura(
  nomeArquivo: string,
  totalPaginas: number,
  registros: RegistroExtraido[],
  diagnostico: LinhaDiagnostico[],
): ResultadoReferencia {
  const expectativa = encontrarExpectativa(nomeArquivo);
  const itens: ItemVerificacao[] = [...conciliarTotais(registros, diagnostico)];

  if (expectativa) {
    if (expectativa.totalPaginas != null) {
      itens.push({
        titulo: "Total de páginas",
        esperado: expectativa.totalPaginas,
        encontrado: totalPaginas,
        ok: expectativa.totalPaginas === totalPaginas,
        detalhe: "Páginas lidas do arquivo de referência.",
      });
    }
    for (const alvo of expectativa.porPaginaRegional) {
      const encontrado = registros.filter(
        (r) => r.pagina_pdf === alvo.pagina && r.regional_codigo === alvo.regional,
      ).length;
      itens.push({
        titulo: `Página ${alvo.pagina} · ${alvo.regional}`,
        esperado: alvo.esperado,
        encontrado,
        ok: encontrado === alvo.esperado,
        detalhe: `Linhas identificadas como ${alvo.regional} na página ${alvo.pagina}.`,
      });
    }
  }

  return {
    aplicavel: !!expectativa,
    arquivo: nomeArquivo,
    descricao: expectativa?.descricao ?? null,
    itens,
    aprovado: itens.every((i) => i.ok),
  };
}

/**
 * Mesma validação, porém sobre o que já está gravado no banco (tela de
 * auditoria), onde não existe mais o diagnóstico linha a linha do PDF.
 */
export function validarPersistido(
  nomeArquivo: string,
  totalPaginas: number,
  registros: Array<{ pagina_pdf: number | null; regional_codigo: string | null }>,
): ResultadoReferencia {
  const expectativa = encontrarExpectativa(nomeArquivo);
  const itens: ItemVerificacao[] = [
    {
      titulo: "Registros com regional identificada",
      esperado: registros.length,
      encontrado: registros.filter((r) => !!r.regional_codigo).length,
      ok: registros.every((r) => !!r.regional_codigo),
      detalhe: "Linhas sem regional ficam em conferência, nunca são descartadas.",
    },
  ];

  if (expectativa) {
    if (expectativa.totalPaginas != null) {
      itens.push({
        titulo: "Total de páginas",
        esperado: expectativa.totalPaginas,
        encontrado: totalPaginas,
        ok: expectativa.totalPaginas === totalPaginas,
        detalhe: "Páginas registradas na importação.",
      });
    }
    for (const alvo of expectativa.porPaginaRegional) {
      const encontrado = registros.filter(
        (r) => r.pagina_pdf === alvo.pagina && r.regional_codigo === alvo.regional,
      ).length;
      itens.push({
        titulo: `Página ${alvo.pagina} · ${alvo.regional}`,
        esperado: alvo.esperado,
        encontrado,
        ok: encontrado === alvo.esperado,
        detalhe: `Serviços gravados como ${alvo.regional} na página ${alvo.pagina}.`,
      });
    }
  }

  return {
    aplicavel: !!expectativa,
    arquivo: nomeArquivo,
    descricao: expectativa?.descricao ?? null,
    itens,
    aprovado: itens.every((i) => i.ok),
  };
}
