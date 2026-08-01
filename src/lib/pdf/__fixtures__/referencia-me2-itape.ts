/**
 * Teste automatizado da leitura do arquivo de referência.
 *
 * As linhas abaixo reproduzem exatamente o formato do PDF real
 * "PLANEJAMENTO DE PROGRAMAÇÕES ME2 ITAPÊ - 03-08-26 a 07-08-26 - ATUAL.pdf",
 * cuja página 3 traz 10 serviços da CGR.3 – Bauru.
 */
export const NOME_ARQUIVO_REFERENCIA =
  "PLANEJAMENTO_DE_PROGRAMAÇÕES_ME2_ITAPÊ_-_03-08-26_a_07-08-26_-_ATUAL.pdf";

const CABECALHO = [
  "PLANEJAMENTO SEMANAL",
  "GERENCIAMENTO ME2 - ITAPETININGA",
  "EQUIPE REGIONAL CATEGORIA CONTRATO ATIVIDADES RODOVIA KM INICIAL KM FINAL DESCRIÇÃO PERÍODO MEDIÇÃO OBSERVAÇÃO",
];

const RODAPE = ["DIRETORIA DE OPERAÇÕES-D.O VERSÃO:31/07/2026"];

/** Página 1 — CGR.1 Itapetininga. */
export const PAGINA_1 = [
  ...CABECALHO,
  "ACOMP. SERVIÇOS / OCORRÊNCIAS",
  "Luciano/ Uriel CGR.1 - Itapetininga Conservação de Rotina 22.779-1 - A3F Engenharia Ltda (RC 1.1) Ocorrências SP 127 130,000 145,500 3/8/2026 3/8/2026 10",
  "GERAL",
  "Luciano/ Uriel CGR.1 - Itapetininga Conservação de Rotina (RC 1.2) Ocorrências SP 258 200,000 214,300 ACOMP. SERVIÇOS / TOLERÂNCIA ZERO 4/8/2026 4/8/2026 1",
  ...RODAPE,
];

/** Página 2 — CGR.13 Rio Claro. */
export const PAGINA_2 = [
  ...CABECALHO,
  "Luciano CGR.13 - Rio Claro Conservação de Rotina 21.096-1 - RB (13.5) Ocorrências SP 344 254,320 299,000 5/8/2026 5/8/2026 58",
  "Luciano CGR.13 - Rio Claro Conservação de Rotina 21.096-1 - RB (13.5) Ocorrências SP 253 0,000 18,700 5/8/2026 5/8/2026 58",
  // linha com data fora do período declarado no arquivo (03/08 a 07/08)
  "Luciano CGR.13 - Rio Claro Conservação de Rotina 21.096-1 - RB (13.5) Ocorrências SP 207 0,000 12,100 12/8/2026 12/8/2026 58",
  ...RODAPE,
];

/** Página 3 — exatamente 10 serviços da CGR.3 – Bauru. */
export const PAGINA_3 = [
  ...CABECALHO,
  "ACOMP. SERVIÇOS / OCORRÊNCIAS",
  "Luciano/ Uriel CGR.3 - Bauru Conservação de Rotina 22.779-1 - A3F Engenharia Ltda (RC 3.1) Ocorrências SP 225 200,000 215,400 3/8/2026 3/8/2026 10",
  "GERAL",
  "ACOMP. SERVIÇOS / OCORRÊNCIAS",
  "Luciano/ Uriel CGR.3 - Bauru Conservação de Rotina 22.779-1 - A3F Engenharia Ltda (RC 3.1) Ocorrências SP 225 215,400 232,000 3/8/2026 3/8/2026 10",
  "GERAL",
  "Luciano/ Uriel CGR.3 - Bauru Conservação de Rotina 21.096-1 - RB (3.2) Ocorrências SP 300 320,000 341,700 4/8/2026 4/8/2026 58",
  "Luciano/ Uriel CGR.3 - Bauru Conservação de Rotina 21.096-1 - RB (3.2) Ocorrências SP 321 0,000 14,900 4/8/2026 4/8/2026 58",
  "ACOMP. SERVIÇOS / OCORRÊNCIAS",
  "Luciano/ Uriel CGR.3 - Bauru Conservação de Rotina 21.096-1 - RB (3.2) Ocorrências SPA 029/225 0,000 7,000 5/8/2026 5/8/2026 58",
  "GERAL",
  "Luciano/ Uriel CGR.3 - Bauru Conservação de Rotina (RC 3.3) Ocorrências SP 191 143,410 149,390 ACOMP. SERVIÇOS / TOLERÂNCIA ZERO 5/8/2026 5/8/2026 1",
  "Luciano/ Uriel CGR.3 - Bauru Conservação de Rotina (RC 3.3) Ocorrências SP 191 149,390 159,060 ACOMP. SERVIÇOS / TOLERÂNCIA ZERO 6/8/2026 6/8/2026 1",
  "CE FASE 2 - 268,200 A 292,000",
  "Luciano/ Uriel CGR.3 - Bauru Conservação de Rotina (RC 3.4) Ocorrências SP 261 10,000 28,600 6/8/2026 6/8/2026 1",
  "Luciano/ Uriel CGR.3 - Bauru Conservação de Rotina (RC 3.4) Ocorrências SP 261 28,600 42,000 7/8/2026 7/8/2026 1",
  "ACOMP. SERVIÇOS / OCORRÊNCIAS",
  "Luciano/ Uriel CGR.3 - Bauru Conservação de Rotina 21.096-1 - RB (3.5) Ocorrências SP 333 100,000 118,250 7/8/2026 7/8/2026 58",
  "GERAL",
  ...RODAPE,
];

export const PAGINAS_REFERENCIA = [PAGINA_1, PAGINA_2, PAGINA_3];
