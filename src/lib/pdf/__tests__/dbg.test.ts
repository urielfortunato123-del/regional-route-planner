import { it } from "vitest";
import { processarTexto } from "@/lib/pdf/nucleo";
import { PAGINAS_REFERENCIA, NOME_ARQUIVO_REFERENCIA } from "@/lib/pdf/__fixtures__/referencia-me2-itape";
it("dbg", () => {
  const r = processarTexto(PAGINAS_REFERENCIA, NOME_ARQUIVO_REFERENCIA);
  for (const x of r.registros) console.log(x.pagina_pdf, x.regional_codigo, x.rodovia, x.km_inicial, x.data_inicial);
});
