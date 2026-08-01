/**
 * Inspeções e ocorrências de campo — acesso a dados (somente servidor).
 *
 * Trava obrigatória: todo registro nasce e é lido com a regional do
 * funcionário identificado. O navegador nunca escolhe a regional.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { carregarPerfil, type Perfil } from "@/lib/programacao.server";

export const COLUNAS_INSPECAO =
  "id, regional_id, regional_codigo, programacao_id, funcionario_id, funcionario_nome, equipe, contrato, atividade, rodovia, km_inicial, km_final, condicao, servico_executado, nao_conformidade, observacao, situacao, fotos, latitude, longitude, registrada_em";

export const COLUNAS_OCORRENCIA =
  "id, regional_id, regional_codigo, programacao_id, funcionario_id, funcionario_nome, equipe, contrato, tipo, rodovia, km, km_final, sentido, faixa, prioridade, risco, descricao, necessita_atendimento, prazo, observacao, situacao, fotos, latitude, longitude, registrada_em";

export type DadosInspecao = {
  programacaoId?: string | null;
  equipe?: string | null;
  contrato?: string | null;
  atividade?: string | null;
  rodovia?: string | null;
  kmInicial?: number | null;
  kmFinal?: number | null;
  condicao?: string | null;
  servicoExecutado?: string | null;
  naoConformidade?: string | null;
  observacao?: string | null;
  situacao?: string | null;
  fotos?: string[];
  latitude?: number | null;
  longitude?: number | null;
};

export type DadosOcorrencia = {
  programacaoId?: string | null;
  equipe?: string | null;
  contrato?: string | null;
  tipo: string;
  rodovia?: string | null;
  km?: number | null;
  kmFinal?: number | null;
  sentido?: string | null;
  faixa?: string | null;
  prioridade?: string | null;
  risco?: string | null;
  descricao: string;
  necessitaAtendimento?: boolean;
  prazo?: string | null;
  observacao?: string | null;
  fotos?: string[];
  latitude?: number | null;
  longitude?: number | null;
};

function coordenadaValida(lat: number | null | undefined, lon: number | null | undefined) {
  return (
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -34 &&
    lat <= 6 &&
    lon >= -74 &&
    lon <= -32
  );
}

/** Garante que o serviço informado é da mesma regional do funcionário. */
async function programacaoDaRegional(perfil: Perfil, programacaoId: string | null | undefined) {
  if (!programacaoId) return null;
  const { data, error } = await supabaseAdmin
    .from("programacoes")
    .select("id, regional_id, rodovia, km_inicial, km_final, atividade, equipe, contrato")
    .eq("id", programacaoId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Serviço da programação não encontrado.");
  if (data.regional_id !== perfil.regional_id) {
    throw new Error("Este serviço pertence a outra regional e não pode receber registros aqui.");
  }
  return data;
}

function fotosValidas(fotos: string[] | undefined) {
  const lista = (fotos ?? []).filter((f) => typeof f === "string" && f.startsWith("data:image/"));
  if (lista.length > 6) throw new Error("Máximo de 6 fotos por registro.");
  for (const f of lista) {
    if (f.length > 900_000) throw new Error("Foto muito grande. Reduza a qualidade e tente de novo.");
  }
  return lista;
}

// ------------------------------------------------------------- inspeções

export async function criarInspecaoDb(funcionarioId: string, dados: DadosInspecao) {
  const perfil = await carregarPerfil(funcionarioId);
  const programacao = await programacaoDaRegional(perfil, dados.programacaoId);

  if (!coordenadaValida(dados.latitude, dados.longitude)) {
    throw new Error("Informe a posição da inspeção (GPS ou ponto no mapa) antes de salvar.");
  }
  const rodovia = dados.rodovia ?? programacao?.rodovia ?? null;
  if (!rodovia) throw new Error("Informe a rodovia da inspeção.");

  const { data, error } = await supabaseAdmin
    .from("inspecoes")
    .insert({
      regional_id: perfil.regional_id,
      regional_codigo: perfil.regional_codigo,
      programacao_id: programacao?.id ?? null,
      funcionario_id: perfil.id,
      funcionario_nome: perfil.nome,
      equipe: dados.equipe ?? programacao?.equipe ?? perfil.equipe ?? null,
      contrato: dados.contrato ?? programacao?.contrato ?? null,
      atividade: dados.atividade ?? programacao?.atividade ?? null,
      rodovia,
      km_inicial: dados.kmInicial ?? programacao?.km_inicial ?? null,
      km_final: dados.kmFinal ?? programacao?.km_final ?? null,
      condicao: dados.condicao ?? null,
      servico_executado: dados.servicoExecutado ?? null,
      nao_conformidade: dados.naoConformidade ?? null,
      observacao: dados.observacao ?? null,
      situacao: dados.situacao ?? "registrada",
      fotos: fotosValidas(dados.fotos),
      latitude: dados.latitude ?? null,
      longitude: dados.longitude ?? null,
    } as never)
    .select(COLUNAS_INSPECAO)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function listarInspecoesDb(
  funcionarioId: string,
  filtros: { programacaoId?: string | null; dia?: string | null; limite?: number },
) {
  const perfil = await carregarPerfil(funcionarioId);
  let consulta = supabaseAdmin
    .from("inspecoes")
    .select(COLUNAS_INSPECAO)
    .eq("regional_id", perfil.regional_id)
    .order("registrada_em", { ascending: false })
    .limit(filtros.limite ?? 200);

  if (filtros.programacaoId) consulta = consulta.eq("programacao_id", filtros.programacaoId);
  if (filtros.dia) {
    consulta = consulta
      .gte("registrada_em", `${filtros.dia}T00:00:00`)
      .lte("registrada_em", `${filtros.dia}T23:59:59`);
  }

  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  return { regional: perfil.regional_codigo, inspecoes: data ?? [] };
}

export async function atualizarInspecaoDb(
  funcionarioId: string,
  id: string,
  campos: { situacao?: string; observacao?: string | null; naoConformidade?: string | null },
) {
  const perfil = await carregarPerfil(funcionarioId);
  const { data, error } = await supabaseAdmin
    .from("inspecoes")
    .update({
      ...(campos.situacao ? { situacao: campos.situacao } : {}),
      ...(campos.observacao !== undefined ? { observacao: campos.observacao } : {}),
      ...(campos.naoConformidade !== undefined
        ? { nao_conformidade: campos.naoConformidade }
        : {}),
      atualizado_em: new Date().toISOString(),
    } as never)
    .eq("id", id)
    .eq("regional_id", perfil.regional_id)
    .select(COLUNAS_INSPECAO)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Inspeção não encontrada na sua regional.");
  return data;
}

// ------------------------------------------------------------- ocorrências

export async function criarOcorrenciaDb(funcionarioId: string, dados: DadosOcorrencia) {
  const perfil = await carregarPerfil(funcionarioId);
  const programacao = await programacaoDaRegional(perfil, dados.programacaoId);

  if (!coordenadaValida(dados.latitude, dados.longitude)) {
    throw new Error("Informe a posição da ocorrência (GPS ou ponto no mapa) antes de salvar.");
  }
  if (!dados.descricao.trim()) throw new Error("Descreva a ocorrência.");

  const { data, error } = await supabaseAdmin
    .from("ocorrencias")
    .insert({
      regional_id: perfil.regional_id,
      regional_codigo: perfil.regional_codigo,
      programacao_id: programacao?.id ?? null,
      funcionario_id: perfil.id,
      funcionario_nome: perfil.nome,
      equipe: dados.equipe ?? programacao?.equipe ?? perfil.equipe ?? null,
      contrato: dados.contrato ?? programacao?.contrato ?? null,
      tipo: dados.tipo,
      rodovia: dados.rodovia ?? programacao?.rodovia ?? null,
      km: dados.km ?? programacao?.km_inicial ?? null,
      km_final: dados.kmFinal ?? null,
      sentido: dados.sentido ?? null,
      faixa: dados.faixa ?? null,
      prioridade: dados.prioridade ?? "media",
      risco: dados.risco ?? null,
      descricao: dados.descricao.trim(),
      necessita_atendimento: dados.necessitaAtendimento ?? false,
      prazo: dados.prazo ?? null,
      observacao: dados.observacao ?? null,
      fotos: fotosValidas(dados.fotos),
      latitude: dados.latitude ?? null,
      longitude: dados.longitude ?? null,
    } as never)
    .select(COLUNAS_OCORRENCIA)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function listarOcorrenciasDb(
  funcionarioId: string,
  filtros: { programacaoId?: string | null; dia?: string | null; situacao?: string | null; limite?: number },
) {
  const perfil = await carregarPerfil(funcionarioId);
  let consulta = supabaseAdmin
    .from("ocorrencias")
    .select(COLUNAS_OCORRENCIA)
    .eq("regional_id", perfil.regional_id)
    .order("registrada_em", { ascending: false })
    .limit(filtros.limite ?? 200);

  if (filtros.programacaoId) consulta = consulta.eq("programacao_id", filtros.programacaoId);
  if (filtros.situacao) consulta = consulta.eq("situacao", filtros.situacao);
  if (filtros.dia) {
    consulta = consulta
      .gte("registrada_em", `${filtros.dia}T00:00:00`)
      .lte("registrada_em", `${filtros.dia}T23:59:59`);
  }

  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  return { regional: perfil.regional_codigo, ocorrencias: data ?? [] };
}

export async function atualizarOcorrenciaDb(
  funcionarioId: string,
  id: string,
  campos: { situacao?: string; observacao?: string | null; prioridade?: string },
) {
  const perfil = await carregarPerfil(funcionarioId);
  const { data, error } = await supabaseAdmin
    .from("ocorrencias")
    .update({
      ...(campos.situacao ? { situacao: campos.situacao } : {}),
      ...(campos.prioridade ? { prioridade: campos.prioridade } : {}),
      ...(campos.observacao !== undefined ? { observacao: campos.observacao } : {}),
      atualizado_em: new Date().toISOString(),
    } as never)
    .eq("id", id)
    .eq("regional_id", perfil.regional_id)
    .select(COLUNAS_OCORRENCIA)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Ocorrência não encontrada na sua regional.");
  return data;
}
