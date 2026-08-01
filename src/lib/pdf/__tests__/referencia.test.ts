import { describe, expect, it } from "vitest";

import { processarTexto } from "@/lib/pdf/nucleo";
import { conciliarTotais, validarLeitura } from "@/lib/pdf/validacao-referencia";
import {
  NOME_ARQUIVO_REFERENCIA,
  PAGINAS_REFERENCIA,
} from "@/lib/pdf/__fixtures__/referencia-me2-itape";

const ler = () => processarTexto(PAGINAS_REFERENCIA, NOME_ARQUIVO_REFERENCIA);

describe("leitura do arquivo de referência ME2 Itapetininga", () => {
  it("reconhece exatamente 10 serviços da CGR.3 – Bauru na página 3", () => {
    const { registros } = ler();
    const bauruPagina3 = registros.filter(
      (r) => r.pagina_pdf === 3 && r.regional_codigo === "CGR.3",
    );
    expect(bauruPagina3).toHaveLength(10);
    expect(bauruPagina3.every((r) => r.rodovia && r.km_inicial != null)).toBe(true);
  });

  it("identifica a regional linha a linha, sem herdar de outra página", () => {
    const { registros } = ler();
    expect(registros.filter((r) => r.pagina_pdf === 1 && r.regional_codigo === "CGR.1")).toHaveLength(2);
    expect(registros.filter((r) => r.pagina_pdf === 2 && r.regional_codigo === "CGR.13")).toHaveLength(3);
    expect(registros.some((r) => !r.regional_codigo)).toBe(false);
  });

  it("lê o período declarado e marca a data divergente sem descartar a linha", () => {
    const { registros, periodoDeclarado } = ler();
    expect(periodoDeclarado).toEqual({ inicio: "2026-08-03", fim: "2026-08-07" });

    const fora = registros.filter((r) => r.status_conferencia === "DATA_FORA_DO_PERIODO_CONFERIR");
    expect(fora).toHaveLength(1);
    expect(fora[0]?.data_inicial).toBe("2026-08-12");
    expect(fora[0]?.data_fora_periodo).toBe(true);
    expect(fora[0]?.periodo_inicio_esperado).toBe("2026-08-03");
  });

  it("fecha a conta do pipeline: nada é perdido em silêncio", () => {
    const { registros, diagnostico } = ler();
    const itens = conciliarTotais(registros, diagnostico);
    expect(itens.every((i) => i.ok)).toBe(true);
    expect(registros).toHaveLength(15);
  });

  it("aprova a validação do arquivo de referência", () => {
    const { registros, diagnostico } = ler();
    const resultado = validarLeitura(NOME_ARQUIVO_REFERENCIA, 3, registros, diagnostico);
    expect(resultado.aplicavel).toBe(true);
    expect(resultado.itens.find((i) => i.titulo === "Página 3 · CGR.3")?.encontrado).toBe(10);
    expect(resultado.aprovado).toBe(true);
  });
});
