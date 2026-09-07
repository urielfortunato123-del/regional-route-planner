export type JurisdicaoViaria = "federal" | "estadual" | "municipal" | "concessionada" | "desconhecida";

export type ClasseViaria =
  | "rodovia"
  | "acesso"
  | "marginal"
  | "interligacao"
  | "vicinal"
  | "estrada_municipal"
  | "via_servico"
  | "outra";

export type FonteViariaId =
  | "DER_SP"
  | "DNIT_SNV"
  | "IBGE_MMD"
  | "PREFEITURA"
  | "CONCESSIONARIA"
  | "OSM";

export type ConfiancaViaria = "oficial" | "alta" | "media" | "complementar";

export type CoberturaKm = "oficial" | "interpolada" | "estimada" | "indisponivel";

export type CoordenadaViaria = { lat: number; lon: number };

export type FonteViaria = {
  id: FonteViariaId;
  nome: string;
  autoridade: string;
  prioridade: number;
  confianca: ConfiancaViaria;
  forneceGeometria: boolean;
  forneceKm: boolean;
  forneceMunicipio: boolean;
  observacao: string;
};

export type ViaNacional = {
  id: string;
  codigo: string | null;
  nome: string | null;
  uf: string;
  municipiosIbge: string[];
  jurisdicao: JurisdicaoViaria;
  classe: ClasseViaria;
  fonte: FonteViariaId;
  confianca: ConfiancaViaria;
  kmInicial: number | null;
  kmFinal: number | null;
  coberturaKm: CoberturaKm;
  linhas: CoordenadaViaria[][];
  atualizadoEm: number | null;
};

/**
 * Regra central do ViaCerta: geometria e quilometragem têm confiança própria.
 * Uma via pode ser conhecida e navegável sem que o app afirme um KM que não
 * esteja sustentado por uma fonte oficial ou por um modelo validado.
 */
export type ReferenciaKmViaria = {
  viaId: string;
  km: number;
  lat: number;
  lon: number;
  fonte: FonteViariaId;
  cobertura: Exclude<CoberturaKm, "indisponivel">;
  atualizadoEm: number | null;
};

export const FONTES_VIARIAS: readonly FonteViaria[] = [
  {
    id: "DER_SP",
    nome: "DER-SP / WebRota",
    autoridade: "Departamento de Estradas de Rodagem do Estado de São Paulo",
    prioridade: 100,
    confianca: "oficial",
    forneceGeometria: true,
    forneceKm: true,
    forneceMunicipio: true,
    observacao: "Fonte principal para rodovias estaduais, acessos e marcos quilométricos em São Paulo.",
  },
  {
    id: "DNIT_SNV",
    nome: "DNIT / Sistema Nacional de Viação",
    autoridade: "Departamento Nacional de Infraestrutura de Transportes",
    prioridade: 95,
    confianca: "oficial",
    forneceGeometria: true,
    forneceKm: true,
    forneceMunicipio: false,
    observacao: "Fonte principal para a rede rodoviária federal e seus trechos SNV.",
  },
  {
    id: "IBGE_MMD",
    nome: "IBGE / Malha Municipal Digital",
    autoridade: "Instituto Brasileiro de Geografia e Estatística",
    prioridade: 90,
    confianca: "oficial",
    forneceGeometria: false,
    forneceKm: false,
    forneceMunicipio: true,
    observacao: "Fonte territorial para relacionar cada trecho viário à UF, município e geocódigo IBGE.",
  },
  {
    id: "CONCESSIONARIA",
    nome: "Base oficial da concessionária",
    autoridade: "Concessionária responsável pelo trecho",
    prioridade: 85,
    confianca: "alta",
    forneceGeometria: true,
    forneceKm: true,
    forneceMunicipio: false,
    observacao: "Usada quando houver base operacional oficial e rastreável do trecho concedido.",
  },
  {
    id: "PREFEITURA",
    nome: "Base municipal",
    autoridade: "Prefeitura / órgão municipal competente",
    prioridade: 80,
    confianca: "alta",
    forneceGeometria: true,
    forneceKm: false,
    forneceMunicipio: true,
    observacao: "Prioritária para vicinais e estradas municipais quando existir cadastro oficial disponível.",
  },
  {
    id: "OSM",
    nome: "OpenStreetMap",
    autoridade: "Comunidade OpenStreetMap",
    prioridade: 40,
    confianca: "complementar",
    forneceGeometria: true,
    forneceKm: false,
    forneceMunicipio: false,
    observacao: "Camada complementar; nunca deve criar KM oficial nem substituir uma geometria oficial disponível.",
  },
] as const;
