/**
 * Etapas do checklist de validação do pipeline.
 *
 * A lista é fixa: toda importação/regional tem sempre as 12 etapas, mesmo que
 * ainda não tenham sido validadas (status PENDENTE).
 */
export const STATUS_ETAPA = [
  "PENDENTE",
  "VALIDANDO",
  "OK",
  "DIVERGENTE",
  "CORRIGIDO",
  "ERRO",
] as const;

export type StatusEtapa = (typeof STATUS_ETAPA)[number];

export type ChaveEtapa =
  | "PDF_LIDO"
  | "LINHAS_EXTRAIDAS"
  | "LINHAS_CLASSIFICADAS"
  | "REGISTROS_PERSISTIDOS"
  | "PROGRAMACAO_CARREGADA"
  | "MAPA_CARREGADO"
  | "AGUARDANDO_LOCALIZACAO"
  | "GEOMETRIAS_VALIDAS"
  | "ELEGIVEIS_ROTA"
  | "ROTA_CONSISTENTE"
  | "PERSISTENCIA_OFFLINE"
  | "VERSIONAMENTO";

export type DefinicaoEtapa = {
  chave: ChaveEtapa;
  ordem: number;
  rotulo: string;
  /** Etapa crítica bloqueia a geração da rota quando divergente. */
  critica: boolean;
  descricao: string;
};

export const ETAPAS_PIPELINE: DefinicaoEtapa[] = [
  {
    chave: "PDF_LIDO",
    ordem: 1,
    rotulo: "PDF lido",
    critica: true,
    descricao: "A importação existe no banco e tem páginas lidas.",
  },
  {
    chave: "LINHAS_EXTRAIDAS",
    ordem: 2,
    rotulo: "Linhas extraídas",
    critica: true,
    descricao: "As linhas lidas do PDF foram gravadas na conferência ou na programação.",
  },
  {
    chave: "LINHAS_CLASSIFICADAS",
    ordem: 3,
    rotulo: "Linhas classificadas por regional",
    critica: true,
    descricao: "Toda linha gravada tem regional identificada.",
  },
  {
    chave: "REGISTROS_PERSISTIDOS",
    ordem: 4,
    rotulo: "Registros persistidos",
    critica: true,
    descricao: "Nenhum registro se perdeu entre a leitura e o banco, e não há duplicidade.",
  },
  {
    chave: "PROGRAMACAO_CARREGADA",
    ordem: 5,
    rotulo: "Programação carregada",
    critica: true,
    descricao: "A Programação mostra todos os serviços persistidos da regional.",
  },
  {
    chave: "MAPA_CARREGADO",
    ordem: 6,
    rotulo: "Mapa carregado",
    critica: true,
    descricao: "O Mapa recebe todos os serviços da regional, com ou sem coordenada.",
  },
  {
    chave: "AGUARDANDO_LOCALIZACAO",
    ordem: 7,
    rotulo: "Serviços aguardando localização",
    critica: false,
    descricao: "Serviços sem coordenada continuam persistidos e podem ser localizados depois.",
  },
  {
    chave: "GEOMETRIAS_VALIDAS",
    ordem: 8,
    rotulo: "Geometrias válidas",
    critica: false,
    descricao: "Serviços com coordenada válida gravada.",
  },
  {
    chave: "ELEGIVEIS_ROTA",
    ordem: 9,
    rotulo: "Serviços elegíveis para rota",
    critica: false,
    descricao: "Serviços da regional prontos para entrar na rota.",
  },
  {
    chave: "ROTA_CONSISTENTE",
    ordem: 10,
    rotulo: "Rota consistente",
    critica: false,
    descricao: "As rotas salvas apontam apenas para serviços existentes da regional.",
  },
  {
    chave: "PERSISTENCIA_OFFLINE",
    ordem: 11,
    rotulo: "Persistência offline validada",
    critica: true,
    descricao: "Ao reabrir o aplicativo, nada se perde no banco do aparelho.",
  },
  {
    chave: "VERSIONAMENTO",
    ordem: 12,
    rotulo: "Versionamento consistente",
    critica: true,
    descricao: "A versão da programação da importação bate com a versão dos serviços gravados.",
  },
];

export const DEFINICAO_ETAPA = new Map(ETAPAS_PIPELINE.map((e) => [e.chave, e]));

export const ROTULO_ETAPA = (chave: string) => DEFINICAO_ETAPA.get(chave as ChaveEtapa)?.rotulo ?? chave;

export const ETAPA_CRITICA = (chave: string) =>
  DEFINICAO_ETAPA.get(chave as ChaveEtapa)?.critica ?? false;

export type EtapaChecklist = {
  etapa: ChaveEtapa;
  ordem: number;
  rotulo: string;
  critica: boolean;
  status: StatusEtapa;
  esperado: number;
  encontrado: number;
  divergencia: number;
  registros: string[];
  motivo: string | null;
  validadoEm: string | null;
  atualizadoEm: string | null;
};

export const ETAPA_EM_FALHA = (e: { status: StatusEtapa }) =>
  e.status === "DIVERGENTE" || e.status === "ERRO";

/** Divergência crítica não validada = rota bloqueada. */
export function bloqueiosCriticos(checklist: EtapaChecklist[]) {
  return checklist.filter((e) => e.critica && ETAPA_EM_FALHA(e));
}

export function pendenciasNaoCriticas(checklist: EtapaChecklist[]) {
  return checklist.filter((e) => !e.critica && ETAPA_EM_FALHA(e));
}
