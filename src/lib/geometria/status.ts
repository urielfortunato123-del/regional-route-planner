/**
 * Situação da localização (geometria) de um serviço da programação.
 *
 * Regra inegociável: um serviço NUNCA é removido nem marcado como excluído por
 * falta de geometria. Ele apenas fica "aguardando localização" e continua
 * aparecendo na Programação e na lista auxiliar do Mapa.
 */
export const STATUS_GEOMETRIA = [
  "AGUARDANDO_LOCALIZACAO",
  "PROCESSANDO",
  "LOCALIZADA_DER_OFICIAL",
  "LOCALIZADA_BASE_LOCAL",
  "LOCALIZADA_INTERPOLADA",
  "LOCALIZADA_MANUAL",
  "ERRO_RODOVIA_NAO_ENCONTRADA",
  "ERRO_KM_FORA_DA_FAIXA",
  "ERRO_SERVICO_DER",
  "REVISAR_MANUALMENTE",
] as const;

export type StatusGeometria = (typeof STATUS_GEOMETRIA)[number];

export const ROTULO_GEOMETRIA: Record<StatusGeometria, string> = {
  AGUARDANDO_LOCALIZACAO: "Aguardando localização",
  PROCESSANDO: "Localizando…",
  LOCALIZADA_DER_OFICIAL: "Localizada (marco oficial DER)",
  LOCALIZADA_BASE_LOCAL: "Localizada (base local salva)",
  LOCALIZADA_INTERPOLADA: "Localizada (interpolada entre marcos)",
  LOCALIZADA_MANUAL: "Localizada (ajuste manual)",
  ERRO_RODOVIA_NAO_ENCONTRADA: "Rodovia não encontrada na malha DER",
  ERRO_KM_FORA_DA_FAIXA: "KM fora da faixa de marcos da rodovia",
  ERRO_SERVICO_DER: "Serviço do DER indisponível",
  REVISAR_MANUALMENTE: "Revisar manualmente",
};

const LOCALIZADAS: StatusGeometria[] = [
  "LOCALIZADA_DER_OFICIAL",
  "LOCALIZADA_BASE_LOCAL",
  "LOCALIZADA_INTERPOLADA",
  "LOCALIZADA_MANUAL",
];

export function ehStatusGeometria(valor: unknown): valor is StatusGeometria {
  return typeof valor === "string" && (STATUS_GEOMETRIA as readonly string[]).includes(valor);
}

export function statusGeometriaDe(registro: Record<string, unknown>): StatusGeometria {
  const bruto = registro["status_geometria"];
  if (ehStatusGeometria(bruto)) return bruto;
  return temCoordenada(registro) ? "LOCALIZADA_INTERPOLADA" : "AGUARDANDO_LOCALIZACAO";
}

export function temCoordenada(registro: Record<string, unknown>): boolean {
  const lat = registro["latitude_inicial"];
  const lon = registro["longitude_inicial"];
  return typeof lat === "number" && typeof lon === "number" && Number.isFinite(lat) && Number.isFinite(lon);
}

/** Localizada = tem coordenada válida gravada, qualquer que seja a fonte. */
export function estaLocalizada(registro: Record<string, unknown>): boolean {
  return temCoordenada(registro) && LOCALIZADAS.includes(statusGeometriaDe(registro));
}

export function aguardandoLocalizacao(registro: Record<string, unknown>): boolean {
  return !temCoordenada(registro);
}

/** Data/hora local a partir de um ISO guardado no banco. */
export function dataHoraLocal(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

export const agoraIso = () => new Date().toISOString();
