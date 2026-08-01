/**
 * Exportação da rota confirmada em PDF (jsPDF + autotable — open source).
 * Roda inteiramente no navegador, portanto funciona offline.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type ParadaPdf = {
  ordem: number;
  rodovia: string;
  kmInicial: string;
  kmFinal: string;
  atividade: string;
  descricao: string;
  equipe: string;
  contrato: string;
  observacao: string;
  distanciaKm: number | null;
  tempoMin: number | null;
  status: string;
  lat: number | null;
  lon: number | null;
  aproximado: boolean;
};

export type DadosPdfRota = {
  funcionario: string;
  regionalCodigo: string;
  regionalRotulo: string;
  dataRota: string; // aaaa-mm-dd
  pontoInicial: { rotulo: string; lat: number; lon: number } | null;
  distanciaTotalKm: number;
  tempoTotalMin: number;
  percursoReal: boolean;
  paradas: ParadaPdf[];
  resumo: {
    rodovias: number;
    servicos: number;
    extensaoKm: number;
    pendentes: number;
    concluidos: number;
  };
  origem: {
    arquivo: string;
    importacaoId: string | null;
    processadoEm: string | null;
    versao: number | null;
  };
};

function dataBr(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR");
}

function duracao(min: number | null) {
  if (min == null) return "-";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}

export function nomeArquivoRota(d: DadosPdfRota) {
  const regional = d.regionalCodigo.replace(/^CGR_0?/, "CGR").replace(/_/g, "_");
  const primeiro = d.funcionario.trim().split(/\s+/)[0] ?? "rota";
  return `Rota_${regional}_${dataBr(d.dataRota).replace(/\//g, "-")}_${primeiro}.pdf`;
}

/** Desenho esquemático da rota (sem depender de internet para carregar mapa). */
function desenharMapa(doc: jsPDF, d: DadosPdfRota, topo: number) {
  const pontos = [
    ...(d.pontoInicial ? [{ lat: d.pontoInicial.lat, lon: d.pontoInicial.lon, n: 0 }] : []),
    ...d.paradas.filter((p) => p.lat != null && p.lon != null).map((p) => ({ lat: p.lat!, lon: p.lon!, n: p.ordem })),
  ];
  if (pontos.length < 2) return topo;

  const largura = doc.internal.pageSize.getWidth() - 28;
  const altura = 70;
  const x0 = 14;
  const y0 = topo;

  const lats = pontos.map((p) => p.lat);
  const lons = pontos.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const escala = (p: { lat: number; lon: number }) => ({
    x: x0 + 10 + ((p.lon - minLon) / (maxLon - minLon || 1)) * (largura - 20),
    y: y0 + altura - 10 - ((p.lat - minLat) / (maxLat - minLat || 1)) * (altura - 20),
  });

  doc.setDrawColor(180);
  doc.setFillColor(248, 248, 245);
  doc.rect(x0, y0, largura, altura, "FD");

  doc.setDrawColor(180, 83, 9);
  doc.setLineWidth(0.6);
  for (let i = 1; i < pontos.length; i++) {
    const a = escala(pontos[i - 1]!);
    const b = escala(pontos[i]!);
    doc.line(a.x, a.y, b.x, b.y);
  }

  pontos.forEach((p, i) => {
    const c = escala(p);
    const inicio = i === 0;
    const fim = i === pontos.length - 1;
    doc.setFillColor(inicio ? 15 : fim ? 21 : 180, inicio ? 118 : fim ? 94 : 83, inicio ? 110 : fim ? 45 : 9);
    doc.circle(c.x, c.y, 3, "F");
    doc.setTextColor(255);
    doc.setFontSize(6);
    doc.text(String(p.n === 0 ? "P" : p.n), c.x, c.y + 1.6, { align: "center" });
  });

  doc.setTextColor(90);
  doc.setFontSize(7);
  doc.text(
    "Legenda: P = ponto inicial · números = ordem das paradas · linha = sequência da rota (esquema fora de escala).",
    x0 + 2,
    y0 + altura + 4,
  );
  doc.setTextColor(0);
  return y0 + altura + 10;
}

export function gerarPdfRota(d: DadosPdfRota): Blob {
  // Muitas colunas por parada: paisagem garante a tabela inteira sem cortes.
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const largura = doc.internal.pageSize.getWidth();
  const geradoEm = new Date().toLocaleString("pt-BR");

  doc.setFillColor(15, 76, 71);
  doc.rect(0, 0, largura, 20, "F");
  doc.setTextColor(255);
  doc.setFontSize(13);
  doc.text("Roteirização Regional — Rota do dia", 14, 9);
  doc.setFontSize(9);
  doc.text(
    `${d.regionalRotulo} · ${d.funcionario} · ${dataBr(d.dataRota)} · gerado em ${geradoEm}`,
    14,
    15,
  );
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 24,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.6 },
    headStyles: { fillColor: [230, 230, 226], textColor: 20 },
    head: [["Ponto inicial", "Distância total", "Tempo estimado", "Serviços", "Cálculo"]],
    body: [
      [
        d.pontoInicial
          ? `${d.pontoInicial.rotulo} (${d.pontoInicial.lat.toFixed(5)}, ${d.pontoInicial.lon.toFixed(5)})`
          : "não informado",
        `${d.distanciaTotalKm.toFixed(1)} km`,
        duracao(d.tempoTotalMin),
        String(d.paradas.length),
        d.percursoReal ? "distância rodoviária (OSRM)" : "aproximado por proximidade",
      ],
    ],
  });

  const apos = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  autoTable(doc, {
    startY: apos + 4,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.6 },
    headStyles: { fillColor: [230, 230, 226], textColor: 20 },
    head: [["Regional", "Rodovias", "Serviços", "Extensão programada", "Pendentes", "Concluídos"]],
    body: [
      [
        `${d.regionalCodigo.replace(/_/g, ".")} — ${d.regionalRotulo}`,
        String(d.resumo.rodovias),
        String(d.resumo.servicos),
        `${d.resumo.extensaoKm.toFixed(1)} km`,
        String(d.resumo.pendentes),
        String(d.resumo.concluidos),
      ],
    ],
  });

  const apos2 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  autoTable(doc, {
    startY: apos2 + 4,
    theme: "striped",
    styles: { fontSize: 7.5, cellPadding: 1.4, overflow: "linebreak" },
    headStyles: { fillColor: [15, 76, 71], textColor: 255 },
    showHead: "everyPage",
    head: [
      [
        "#",
        "Rodovia",
        "Km inicial",
        "Km final",
        "Atividade",
        "Descrição",
        "Equipe",
        "Contrato",
        "Observação",
        "Dist.",
        "Tempo",
        "Situação",
      ],
    ],
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 22 },
      2: { cellWidth: 16 },
      3: { cellWidth: 16 },
      4: { cellWidth: 30 },
      5: { cellWidth: 60 },
      6: { cellWidth: 22 },
      7: { cellWidth: 20 },
      8: { cellWidth: 38 },
      9: { cellWidth: 16 },
      10: { cellWidth: 16 },
      11: { cellWidth: 20 },
    },
    body: d.paradas.map((p) => [
      String(p.ordem),
      p.rodovia,
      p.kmInicial,
      p.kmFinal,
      p.atividade,
      p.descricao,
      p.equipe,
      p.contrato,
      p.observacao,
      p.distanciaKm == null ? "-" : `${p.distanciaKm.toFixed(1)} km`,
      duracao(p.tempoMin),
      p.status,
    ]),
  });

  const apos3 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  let y = apos3 + 6;
  if (y > doc.internal.pageSize.getHeight() - 90) {
    doc.addPage();
    y = 20;
  }
  doc.setFontSize(10);
  doc.text("Mapa esquemático da rota", 14, y - 2);
  desenharMapa(doc, d, y + 1);

  const aproximados = d.paradas.filter((p) => p.aproximado).length;
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    const alturaPagina = doc.internal.pageSize.getHeight();
    doc.setFontSize(7);
    doc.setTextColor(110);
    doc.text(
      [
        `Origem: ${d.origem.arquivo}`,
        d.origem.importacaoId ? `importação ${d.origem.importacaoId.slice(0, 8)}` : null,
        d.origem.processadoEm ? `processado em ${new Date(d.origem.processadoEm).toLocaleString("pt-BR")}` : null,
        d.origem.versao ? `versão ${d.origem.versao}` : null,
        aproximados ? `${aproximados} posição(ões) aproximada(s) na malha do DER-SP` : null,
        !d.percursoReal ? "distâncias aproximadas (serviço de rotas indisponível)" : null,
      ]
        .filter(Boolean)
        .join(" · "),
      14,
      alturaPagina - 8,
    );
    doc.text(`Página ${i} de ${total}`, largura - 14, alturaPagina - 8, { align: "right" });
    doc.setTextColor(0);
  }

  return doc.output("blob");
}
