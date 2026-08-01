import { it } from "vitest";
import { processarTexto } from "@/lib/pdf/nucleo";
import { PAGINAS_REFERENCIA, NOME_ARQUIVO_REFERENCIA } from "@/lib/pdf/__fixtures__/referencia-me2-itape";
import { detectarRegionalNaLinha } from "@/lib/regionais";
it("dbg", () => {
  const r = processarTexto(PAGINAS_REFERENCIA, NOME_ARQUIVO_REFERENCIA);
  console.log("regs", r.registros.length);
  console.log(r.diagnostico.slice(0,8));
  console.log("reg detect", detectarRegionalNaLinha(PAGINAS_REFERENCIA[2]![4]!));
});
