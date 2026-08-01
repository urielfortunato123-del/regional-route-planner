/**
 * Exportação do diagnóstico da auditoria: planilha (CSV UTF-8) e PDF A4
 * deitado, para levar o relatório à reunião ou anexar ao processo.
 */
import type { ItemVerificacao } from "@/lib/pdf/validacao-referencia";

export type LinhaExportacao = {
  pagina_pdf: number | null;
  texto_original: string | null;
  regional_codigo: string | null;
  rodovia: string | null;
  km_inicial: number | null;
  km_final: number | null;
  data_inicial: string | null;
  data_final: string | null;
  equipe: string | null;
  atividade: string | null;
  status_validacao: string;
  status_conferencia: string;
  data_fora_periodo: boolean;
  status_geometria: string;
  status_persistencia: string;
  na_programacao: boolean;
  no_mapa: boolean;
  elegivel_rota: boolean;
  motivo_bloqueio: string | null;
  conferido_em: string | null;
  conferido_por: string | null;
  atualizado_em: string | null;
};

const CABECALHOS = [
  "Pagina",
  "Regional",
  "Rodovia",
  "Km inicial",
  "Km final",
  "Data inicial",
  "Data final",
  "Equipe",
  "Atividade",
  "Status validacao",
  "Status conferencia",
  "Data fora do periodo",
  "Geometria",
  "Persistencia",
  "Programacao",
  "Mapa",
  "Rota",
  "Motivo",
  "Conferido em",
  "Conferido por",
  "Atualizado em",
  "Texto do PDF",
];

const valores = (l: LinhaExportacao) => [
  l.pagina_pdf ?? "",
  l.regional_codigo ?? "não identificada",
  l.rodovia ?? "",
  l.km_inicial ?? "",
  l.km_final ?? "",
  l.data_inicial ?? "",
  l.data_final ?? "",
  l.equipe ?? "",
  l.atividade ?? "",
  l.status_validacao,
  l.status_conferencia,
  l.data_fora_periodo ? "SIM" : "NÃO",
  l.status_geometria,
  l.status_persistencia,
  l.na_programacao ? "SIM" : "NÃO",
  l.no_mapa ? "SIM" : "NÃO",
  l.elegivel_rota ? "SIM" : "NÃO",
  l.motivo_bloqueio ?? "",
  l.conferido_em ?? "",
  l.conferido_por ?? "",
  l.atualizado_em ?? "",
  (l.texto_original ?? "").replace(/\s+/g, " ").trim(),
];

function baixar(conteudo: Blob, nome: string) {
  const url = URL.createObjectURL(conteudo);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

/** CSV com BOM UTF-8 para abrir acentuado no Excel. */
export function exportarDiagnosticoCsv(nomeArquivo: string, linhas: LinhaExportacao[]) {
  const escapa = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const corpo = [CABECALHOS, ...linhas.map(valores)]
    .map((linha) => linha.map(escapa).join(";"))
    .join("\r\n");
  baixar(
    new Blob([`\uFEFF${corpo}`], { type: "text/csv;charset=utf-8;" }),
    `diagnostico-${nomeArquivo.replace(/\.pdf$/i, "")}.csv`,
  );
}

/** PDF A4 deitado com o diagnóstico completo e o resumo da validação. */
export async function exportarDiagnosticoPdf(opcoes: {
  nomeArquivo: string;
  regional: string;
  funcionario: string;
  resumo: Array<{ rotulo: string; valor: number | string }>;
  validacoes: ItemVerificacao[];
  linhas: LinhaExportacao[];
}) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFontSize(14);
  doc.text("Auditoria da importação", 14, 14);
  doc.setFontSize(9);
  doc.text(
    `${opcoes.nomeArquivo} · ${opcoes.regional} · ${opcoes.funcionario} · ${new Date().toLocaleString("pt-BR")}`,
    14,
    20,
  );

  autoTable(doc, {
    startY: 24,
    head: [opcoes.resumo.map((r) => r.rotulo)],
    body: [opcoes.resumo.map((r) => String(r.valor))],
    styles: { fontSize: 7 },
    headStyles: { fillColor: [30, 41, 59] },
  });

  if (opcoes.validacoes.length) {
    autoTable(doc, {
      head: [["Validação", "Esperado", "Encontrado", "Situação"]],
      body: opcoes.validacoes.map((v) => [
        v.titulo,
        String(v.esperado),
        String(v.encontrado),
        v.ok ? "OK" : "DIVERGENTE",
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [30, 41, 59] },
    });
  }

  autoTable(doc, {
    head: [
      [
        "Pág",
        "Regional",
        "Rodovia",
        "Km ini",
        "Km fim",
        "Data",
        "Conferência",
        "Fora do período",
        "Geometria",
        "Prog.",
        "Mapa",
        "Rota",
        "Motivo",
      ],
    ],
    body: opcoes.linhas.map((l) => [
      l.pagina_pdf ?? "—",
      l.regional_codigo ?? "não identificada",
      l.rodovia ?? "—",
      l.km_inicial ?? "—",
      l.km_final ?? "—",
      l.data_inicial ?? "—",
      l.status_conferencia,
      l.data_fora_periodo ? "SIM" : "NÃO",
      l.status_geometria,
      l.na_programacao ? "SIM" : "NÃO",
      l.no_mapa ? "SIM" : "NÃO",
      l.elegivel_rota ? "SIM" : "NÃO",
      l.motivo_bloqueio ?? "—",
    ]),
    styles: { fontSize: 6.5, cellPadding: 1 },
    headStyles: { fillColor: [30, 41, 59] },
  });

  doc.save(`diagnostico-${opcoes.nomeArquivo.replace(/\.pdf$/i, "")}.pdf`);
}
