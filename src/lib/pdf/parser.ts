/**
 * Leitura de PDFs de programação (executa somente no navegador).
 *
 * Este arquivo cuida apenas de abrir o PDF, extrair as palavras de cada
 * página (com OCR de reserva) e delegar toda a interpretação ao núcleo,
 * que é testado automaticamente.
 */
import { processarPaginas, type PaginaLida, type Palavra, type ResultadoLeitura } from "@/lib/pdf/nucleo";

export type {
  CampoTabela,
  LinhaDiagnostico,
  RegistroExtraido,
  ResultadoLeitura,
  StatusConferencia,
} from "@/lib/pdf/nucleo";
export { ROTULO_CONFERENCIA } from "@/lib/pdf/nucleo";

async function calcularHash(arquivo: File): Promise<string> {
  const buffer = await arquivo.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

  const paginas: PaginaLida[] = [];
  const paginasComOcr: number[] = [];

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

    paginas.push({ numero: numeroPagina, palavras, linhasTexto });
  }

  const processado = processarPaginas(paginas, arquivo.name);

  return {
    nomeArquivo: arquivo.name,
    hash,
    totalPaginas: doc.numPages,
    paginasComOcr,
    ...processado,
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
