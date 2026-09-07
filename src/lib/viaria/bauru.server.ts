import { limiteRegional } from "@/lib/der/der.server";
import { FONTES_VIARIAS } from "./types";

export const PILOTO_BAURU = {
  id: "BAURU_DR03",
  nome: "Piloto Base Viária — Região de Bauru",
  uf: "SP",
  derRegional: 3,
  estrategia: "municipios_da_regional",
} as const;

/**
 * O piloto não mantém uma lista manual de municípios.
 * A lista vem do limite oficial da DR-03 no DER-SP para reduzir divergência
 * entre a configuração do app e a regional usada na operação de campo.
 */
export async function obterEscopoPilotoBauru() {
  const limite = await limiteRegional(PILOTO_BAURU.derRegional);
  const municipios = [...new Set(limite?.municipios ?? [])].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );

  return {
    ...PILOTO_BAURU,
    nomeDer: limite?.nome ?? null,
    municipios,
    totalMunicipios: municipios.length,
    bbox: limite?.bbox ?? null,
    fontes: FONTES_VIARIAS.map((fonte) => ({
      id: fonte.id,
      nome: fonte.nome,
      prioridade: fonte.prioridade,
      confianca: fonte.confianca,
      status:
        fonte.id === "DER_SP"
          ? "ativa"
          : fonte.id === "DNIT_SNV" || fonte.id === "IBGE_MMD" || fonte.id === "OSM"
            ? "integracao_planejada"
            : "sob_demanda",
    })),
  };
}
