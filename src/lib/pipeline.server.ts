/**
 * Checklist de validação do pipeline, simulações do DER e log de auditoria.
 * Só executa no servidor; a regional vem sempre do id do funcionário.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { carregarPerfil } from "@/lib/programacao.server";
import { ETAPAS_PIPELINE, type EtapaChecklist, type StatusEtapa } from "@/lib/pipeline/etapas";

export type LinhaChecklist = {
  etapa: string;
  ordem: number;
  status: StatusEtapa;
  critica: boolean;
  esperado: number;
  encontrado: number;
  divergencia: number;
  registros: string[];
  motivo: string | null;
  validadoEm: string | null;
  atualizadoEm: string | null;
  historico: Array<{ status: string; esperado: number; encontrado: number; em: string }>;
};

const vazia = (chave: string): LinhaChecklist => {
  const def = ETAPAS_PIPELINE.find((e) => e.chave === chave)!;
  return {
    etapa: def.chave,
    ordem: def.ordem,
    status: "PENDENTE",
    critica: def.critica,
    esperado: 0,
    encontrado: 0,
    divergencia: 0,
    registros: [],
    motivo: null,
    validadoEm: null,
    atualizadoEm: null,
    historico: [],
  };
};

/** Lê o checklist persistido; etapas nunca validadas voltam como PENDENTE. */
export async function lerChecklist(funcionarioId: string, importacaoId: string | null) {
  const perfil = await carregarPerfil(funcionarioId);
  let consulta = supabaseAdmin
    .from("pipeline_validacoes")
    .select("*")
    .eq("regional_id", perfil.regional_id);
  consulta = importacaoId
    ? consulta.eq("importacao_id", importacaoId)
    : consulta.is("importacao_id", null);
  const { data, error } = await consulta;
  if (error) throw new Error(error.message);

  const porEtapa = new Map((data ?? []).map((r) => [r.etapa, r]));
  const linhas: LinhaChecklist[] = ETAPAS_PIPELINE.map((def) => {
    const r = porEtapa.get(def.chave);
    if (!r) return vazia(def.chave);
    return {
      etapa: def.chave,
      ordem: def.ordem,
      status: (r.status as StatusEtapa) ?? "PENDENTE",
      critica: def.critica,
      esperado: r.esperado,
      encontrado: r.encontrado,
      divergencia: r.divergencia,
      registros: Array.isArray(r.registros_afetados) ? (r.registros_afetados as string[]) : [],
      motivo: r.motivo,
      validadoEm: r.validado_em,
      atualizadoEm: r.atualizado_em,
      historico: Array.isArray(r.historico)
        ? (r.historico as LinhaChecklist["historico"])
        : [],
    };
  });

  return { perfil, checklist: linhas.sort((a, b) => a.ordem - b.ordem) };
}

/**
 * Grava (ou atualiza) apenas as etapas informadas — as demais permanecem como
 * estavam, o que permite reprocessar somente as divergentes.
 */
export async function gravarChecklist(
  funcionarioId: string,
  importacaoId: string | null,
  etapas: Array<Omit<EtapaChecklist, "rotulo" | "validadoEm" | "atualizadoEm">>,
  programacaoVersao: number,
) {
  const perfil = await carregarPerfil(funcionarioId);
  const agora = new Date().toISOString();

  const { checklist: atual } = await lerChecklist(funcionarioId, importacaoId);
  const anterior = new Map(atual.map((e) => [e.etapa, e]));

  for (const etapa of etapas) {
    const antes = anterior.get(etapa.etapa);
    const historico = [
      ...(antes?.historico ?? []),
      ...(antes && antes.status !== "PENDENTE"
        ? [
            {
              status: antes.status,
              esperado: antes.esperado,
              encontrado: antes.encontrado,
              em: antes.validadoEm ?? agora,
            },
          ]
        : []),
    ].slice(-20);

    const registro = {
      importacao_id: importacaoId,
      regional_id: perfil.regional_id,
      regional_codigo: perfil.regional_codigo,
      programacao_versao: programacaoVersao,
      etapa: etapa.etapa,
      ordem: etapa.ordem,
      status: etapa.status,
      critica: etapa.critica,
      esperado: etapa.esperado,
      encontrado: etapa.encontrado,
      divergencia: etapa.divergencia,
      registros_afetados: etapa.registros.slice(0, 200) as never,
      motivo: etapa.motivo,
      historico: historico as never,
      validado_em: agora,
      atualizado_em: agora,
    };

    const existente = (
      await supabaseAdmin
        .from("pipeline_validacoes")
        .select("id")
        .eq("regional_id", perfil.regional_id)
        .eq("etapa", etapa.etapa)
        .eq("importacao_id", importacaoId ?? "")
        .maybeSingle()
    ).data;

    if (existente) {
      const { error } = await supabaseAdmin
        .from("pipeline_validacoes")
        .update(registro)
        .eq("id", existente.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("pipeline_validacoes").insert(registro);
      if (error) throw new Error(error.message);
    }
  }

  return lerChecklist(funcionarioId, importacaoId);
}

/** Dados brutos que só o banco conhece e que o checklist precisa conferir. */
export async function dadosChecklist(funcionarioId: string, importacaoId: string | null) {
  const perfil = await carregarPerfil(funcionarioId);

  let consulta = supabaseAdmin
    .from("programacoes")
    .select("id, chave_duplicidade, importacao_id, regional_id, regional_codigo")
    .eq("regional_id", perfil.regional_id)
    .limit(5000);
  if (importacaoId) consulta = consulta.eq("importacao_id", importacaoId);
  const { data: servicos, error } = await consulta;
  if (error) throw new Error(error.message);

  const chaves = new Map<string, number>();
  const duplicados: string[] = [];
  for (const s of servicos ?? []) {
    const chave = s.chave_duplicidade ?? s.id;
    const total = (chaves.get(chave) ?? 0) + 1;
    chaves.set(chave, total);
    if (total > 1) duplicados.push(s.id);
  }

  const { data: rotas, error: erroRotas } = await supabaseAdmin
    .from("rotas")
    .select("id, servicos_ids, programacao_versao, importacao_id, versao_rota, data")
    .eq("regional_id", perfil.regional_id)
    .limit(500);
  if (erroRotas) throw new Error(erroRotas.message);

  const idsServicos = new Set((servicos ?? []).map((s) => s.id));
  const rotasComOrfao: string[] = [];
  for (const r of rotas ?? []) {
    const ids = (r.servicos_ids ?? []) as string[];
    if (ids.some((id) => !idsServicos.has(id))) rotasComOrfao.push(r.id);
  }

  return {
    perfil,
    totalServicos: (servicos ?? []).length,
    duplicados,
    rotas: (rotas ?? []).map((r) => ({
      id: r.id,
      versaoProgramacao: r.programacao_versao,
      versaoRota: r.versao_rota,
      importacaoId: r.importacao_id,
    })),
    rotasComOrfao,
  };
}

// ------------------------------------------------------------- simulações DER

export type EntradaSimulacao = {
  importacaoId: string | null;
  tipoFalha: string;
  iniciadoEm: string;
  concluidoEm: string;
  totalAntes: number;
  totalDepois: number;
  jaLocalizados: number;
  localizadosFallback: number;
  aguardando: number;
  comErro: number;
  removidos: number;
  duplicados: number;
  resultado: "aprovado" | "aprovado_com_avisos" | "reprovado";
  observacoes: string;
  detalhes: unknown;
  programacaoVersao: number;
};

export async function registrarSimulacao(funcionarioId: string, entrada: EntradaSimulacao) {
  const perfil = await carregarPerfil(funcionarioId);
  const { data, error } = await supabaseAdmin
    .from("simulacoes_der")
    .insert({
      importacao_id: entrada.importacaoId,
      regional_id: perfil.regional_id,
      regional_codigo: perfil.regional_codigo,
      programacao_versao: entrada.programacaoVersao,
      tipo_simulacao: "der_indisponivel",
      tipo_falha: entrada.tipoFalha,
      iniciado_em: entrada.iniciadoEm,
      concluido_em: entrada.concluidoEm,
      total_antes: entrada.totalAntes,
      total_depois: entrada.totalDepois,
      total_servicos: entrada.totalAntes,
      ja_localizados: entrada.jaLocalizados,
      localizados_fallback: entrada.localizadosFallback,
      aguardando_localizacao: entrada.aguardando,
      com_erro: entrada.comErro,
      removidos: entrada.removidos,
      duplicados: entrada.duplicados,
      resultado: entrada.resultado,
      observacoes: entrada.observacoes,
      detalhes: entrada.detalhes as never,
      criado_por: perfil.nome,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listarSimulacoes(funcionarioId: string, importacaoId: string | null) {
  const perfil = await carregarPerfil(funcionarioId);
  let consulta = supabaseAdmin
    .from("simulacoes_der")
    .select("*")
    .eq("regional_id", perfil.regional_id)
    .order("criado_em", { ascending: false })
    .limit(50);
  if (importacaoId) consulta = consulta.eq("importacao_id", importacaoId);
  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Serviços da importação/regional, do jeito que estão gravados agora. */
export async function fotografarServicos(funcionarioId: string, importacaoId: string | null) {
  const perfil = await carregarPerfil(funcionarioId);
  let consulta = supabaseAdmin
    .from("programacoes")
    .select(
      "id, rodovia, km_inicial, km_final, status_geometria, latitude_inicial, longitude_inicial, regional_id, regional_codigo, status",
    )
    .eq("regional_id", perfil.regional_id)
    .limit(5000);
  if (importacaoId) consulta = consulta.eq("importacao_id", importacaoId);
  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  return { perfil, servicos: data ?? [] };
}

// ------------------------------------------------------------- log

export async function registrarLog(
  funcionarioId: string,
  entrada: { importacaoId: string | null; acao: string; detalhe: string; dados?: unknown },
) {
  const perfil = await carregarPerfil(funcionarioId);
  const { error } = await supabaseAdmin.from("auditoria_log").insert({
    importacao_id: entrada.importacaoId,
    regional_id: perfil.regional_id,
    regional_codigo: perfil.regional_codigo,
    funcionario_id: perfil.id,
    funcionario_nome: perfil.nome,
    acao: entrada.acao,
    detalhe: entrada.detalhe,
    dados: (entrada.dados ?? {}) as never,
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function listarLog(funcionarioId: string, importacaoId: string | null) {
  const perfil = await carregarPerfil(funcionarioId);
  let consulta = supabaseAdmin
    .from("auditoria_log")
    .select("*")
    .eq("regional_id", perfil.regional_id)
    .order("criado_em", { ascending: false })
    .limit(100);
  if (importacaoId) consulta = consulta.eq("importacao_id", importacaoId);
  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  return data ?? [];
}
