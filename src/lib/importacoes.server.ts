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
  "id, importacao_id, regional_id, regional_codigo, regional_confirmada, regional_origem, pagina_pdf, texto_original, valores_extraidos, equipe, funcionario, categoria, contrato, atividade, rodovia, km_inicial, km_final, descricao, data_inicial, data_final, medicao, observacao, chave_duplicidade, duplicado, status_validacao, motivos, campos_corrigidos, foi_corrigido, programacao_id, status_conferencia, motivo_conferencia, data_fora_periodo, periodo_inicio_esperado, periodo_fim_esperado, conferido_em, conferido_por";

export type CamposRegistro = {
  regional_codigo?: string | null | undefined;
  equipe?: string | null | undefined;
  funcionario?: string | null | undefined;
  categoria?: string | null | undefined;
  contrato?: string | null | undefined;
  atividade?: string | null | undefined;
  rodovia?: string | null | undefined;
  km_inicial?: number | null | undefined;
  km_final?: number | null | undefined;
  descricao?: string | null | undefined;
  data_inicial?: string | null | undefined;
  data_final?: string | null | undefined;
  medicao?: string | null | undefined;
  observacao?: string | null | undefined;
};

/** Diz se a linha lida pode virar programação oficial e por quê não. */
export function avaliarRegistro(r: CamposRegistro & { duplicado?: boolean | undefined }) {
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

/** Apaga somente o PDF guardado; os dados processados continuam disponíveis. */
export async function apagarArquivoPdf(importacaoId: string) {
  const importacao = await carregarImportacao(importacaoId);
  if (!importacao.caminho_arquivo) return { removido: false };
  await supabaseAdmin.storage.from(BUCKET_PDF).remove([importacao.caminho_arquivo]);
  const { error } = await supabaseAdmin
    .from("importacoes_pdf")
    .update({ caminho_arquivo: null })
    .eq("id", importacaoId);
  if (error) throw new Error(error.message);
  return { removido: true };
}

/**
 * Limpeza total de uma importação: PDF, texto/OCR guardado nas linhas,
 * programação gerada, rotas, inspeções e ocorrências vinculadas.
 */
export async function purgarImportacao(importacaoId: string) {
  const importacao = await carregarImportacao(importacaoId);

  const { data: programacoes } = await supabaseAdmin
    .from("programacoes")
    .select("id")
    .eq("importacao_id", importacaoId);
  const idsProgramacao = (programacoes ?? []).map((p) => p.id);

  const rotasAtingidas = new Set<string>();
  let inspecoes = 0;
  let ocorrencias = 0;

  for (let i = 0; i < idsProgramacao.length; i += 200) {
    const fatia = idsProgramacao.slice(i, i + 200);

    const { data: itens } = await supabaseAdmin
      .from("rota_itens")
      .select("rota_id")
      .in("programacao_id", fatia);
    for (const item of itens ?? []) if (item.rota_id) rotasAtingidas.add(item.rota_id);

    const { data: insp } = await supabaseAdmin
      .from("inspecoes")
      .select("id")
      .in("programacao_id", fatia);
    inspecoes += insp?.length ?? 0;
    const { data: ocor } = await supabaseAdmin
      .from("ocorrencias")
      .select("id")
      .in("programacao_id", fatia);
    ocorrencias += ocor?.length ?? 0;

    await supabaseAdmin.from("rota_itens").delete().in("programacao_id", fatia);
    await supabaseAdmin.from("inspecoes").delete().in("programacao_id", fatia);
    await supabaseAdmin.from("ocorrencias").delete().in("programacao_id", fatia);
    await supabaseAdmin.from("programacao_eventos").delete().in("programacao_id", fatia);
  }

  const { data: rotasDaImportacao } = await supabaseAdmin
    .from("rotas")
    .select("id")
    .eq("importacao_id", importacaoId);
  for (const r of rotasDaImportacao ?? []) rotasAtingidas.add(r.id);

  const listaRotas = [...rotasAtingidas];
  for (let i = 0; i < listaRotas.length; i += 200) {
    const fatia = listaRotas.slice(i, i + 200);
    await supabaseAdmin.from("rota_itens").delete().in("rota_id", fatia);
    await supabaseAdmin.from("rotas").delete().in("id", fatia);
  }

  await supabaseAdmin.from("programacoes").delete().eq("importacao_id", importacaoId);
  await supabaseAdmin.from("importacao_registros").delete().eq("importacao_id", importacaoId);

  if (importacao.caminho_arquivo) {
    await supabaseAdmin.storage.from(BUCKET_PDF).remove([importacao.caminho_arquivo]);
  }

  const { error } = await supabaseAdmin
    .from("importacoes_pdf")
    .delete()
    .eq("id", importacaoId);
  if (error) throw new Error(error.message);

  // O cabeçalho do arquivo só é apagado quando nenhuma outra importação o usa.
  if (importacao.arquivo_id) {
    const { data: aindaUsado } = await supabaseAdmin
      .from("importacoes_pdf")
      .select("id")
      .eq("arquivo_id", importacao.arquivo_id)
      .limit(1);
    if (!aindaUsado?.length) {
      await supabaseAdmin.from("arquivos_programacao").delete().eq("id", importacao.arquivo_id);
    }
  }

  return {
    programacoes: idsProgramacao.length,
    rotas: listaRotas.length,
    inspecoes,
    ocorrencias,
    idsProgramacao,
  };
}

