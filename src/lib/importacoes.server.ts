/**
 * Regras de conferência das importações de PDF — só executa no servidor.
 *
 * A importação é uma área de espera: nada vira programação oficial antes de
 * passar pela tela de conferência. O filtro por regional continua sendo
 * resolvido no servidor a partir do id do funcionário.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const BUCKET_PDF = "programacao-pdf";

export type StatusImportacao =
  | "enviado"
  | "processando"
  | "em_conferencia"
  | "confirmado"
  | "parcialmente_confirmado"
  | "com_erros"
  | "cancelado";

export const ROTULO_STATUS: Record<StatusImportacao, string> = {
  enviado: "Enviado",
  processando: "Processando",
  em_conferencia: "Em conferência",
  confirmado: "Confirmado",
  parcialmente_confirmado: "Parcialmente confirmado",
  com_erros: "Com erros",
  cancelado: "Cancelado",
};

export const COLUNAS_REGISTRO_IMPORTACAO =
  "id, importacao_id, regional_id, regional_codigo, regional_confirmada, regional_origem, pagina_pdf, texto_original, valores_extraidos, equipe, funcionario, categoria, contrato, atividade, rodovia, km_inicial, km_final, descricao, data_inicial, data_final, medicao, observacao, chave_duplicidade, duplicado, status_validacao, motivos, campos_corrigidos, foi_corrigido, programacao_id";

export type CamposRegistro = {
  regional_codigo?: string | null;
  equipe?: string | null;
  funcionario?: string | null;
  categoria?: string | null;
  contrato?: string | null;
  atividade?: string | null;
  rodovia?: string | null;
  km_inicial?: number | null;
  km_final?: number | null;
  descricao?: string | null;
  data_inicial?: string | null;
  data_final?: string | null;
  medicao?: string | null;
  observacao?: string | null;
};

/** Diz se a linha lida pode virar programação oficial e por quê não. */
export function avaliarRegistro(r: CamposRegistro & { duplicado?: boolean }) {
  const motivos: string[] = [];
  if (!r.regional_codigo) motivos.push("Regional não identificada");
  if (!r.rodovia) motivos.push("Rodovia não identificada");
  if (r.km_inicial == null) motivos.push("Km inicial não identificado");
  if (!r.data_inicial) motivos.push("Data não identificada");
  if (r.km_inicial != null && r.km_final != null && r.km_final < r.km_inicial) {
    motivos.push("Km final menor que o inicial");
  }
  if (r.duplicado) motivos.push("Registro já existente em outra importação");
  return { valido: motivos.length === 0, motivos };
}

export function chaveDoRegistro(r: CamposRegistro) {
  return [
    r.regional_codigo ?? "",
    r.rodovia ?? "",
    r.km_inicial ?? "",
    r.km_final ?? "",
    r.data_inicial ?? "",
    r.contrato ?? "",
    r.equipe ?? "",
  ]
    .join("|")
    .toLowerCase();
}

export async function mapaIdPorCodigoRegional() {
  const { data, error } = await supabaseAdmin.from("regionais").select("id, codigo");
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((r) => [r.codigo, r.id]));
}

export async function carregarImportacao(id: string) {
  const { data, error } = await supabaseAdmin
    .from("importacoes_pdf")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Importação não encontrada.");
  return data;
}

/** Recalcula os totais do cabeçalho a partir das linhas conferidas. */
export async function recalcularTotais(importacaoId: string) {
  const { data, error } = await supabaseAdmin
    .from("importacao_registros")
    .select("status_validacao, regional_codigo, duplicado")
    .eq("importacao_id", importacaoId);
  if (error) throw new Error(error.message);
  const linhas = data ?? [];
  const erros = linhas.filter(
    (l) => l.status_validacao === "revisar" || l.status_validacao === "pendente",
  ).length;
  const regionais = [...new Set(linhas.map((l) => l.regional_codigo).filter(Boolean))] as string[];
  await supabaseAdmin
    .from("importacoes_pdf")
    .update({
      total_registros: linhas.length,
      total_erros: erros,
      total_duplicados: linhas.filter((l) => l.duplicado).length,
      regionais_encontradas: regionais,
    })
    .eq("id", importacaoId);
  return { total: linhas.length, erros, regionais };
}
