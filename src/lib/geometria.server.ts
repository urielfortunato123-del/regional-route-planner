/**
 * Acesso a dados da localização (geometria) dos serviços — só no servidor.
 * O filtro de regional é sempre resolvido a partir do id do funcionário.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { carregarPerfil } from "@/lib/programacao.server";
import type { StatusGeometria } from "@/lib/geometria/status";

export type PendenteGeometria = {
  id: string;
  rodovia: string | null;
  km_inicial: number | null;
  km_final: number | null;
  status_geometria: string;
  regional_codigo: string | null;
  descricao: string | null;
  data_inicial: string | null;
};

export async function buscarPendentes(
  funcionarioId: string,
  importacaoId: string | null,
  limite: number,
): Promise<{ regionalId: string; pendentes: PendenteGeometria[] }> {
  const perfil = await carregarPerfil(funcionarioId);
  let consulta = supabaseAdmin
    .from("programacoes")
    .select("id, rodovia, km_inicial, km_final, status_geometria, regional_codigo, descricao, data_inicial")
    .eq("regional_id", perfil.regional_id)
    .in("status_geometria", [
      "AGUARDANDO_LOCALIZACAO",
      "PROCESSANDO",
      "ERRO_SERVICO_DER",
      "ERRO_RODOVIA_NAO_ENCONTRADA",
      "ERRO_KM_FORA_DA_FAIXA",
    ])
    .is("latitude_inicial", null);
  if (importacaoId) consulta = consulta.eq("importacao_id", importacaoId);

  const { data, error } = await consulta.order("data_inicial", { ascending: true }).limit(limite);
  if (error) throw new Error(error.message);
  return { regionalId: perfil.regional_id, pendentes: (data ?? []) as PendenteGeometria[] };
}

export type ResultadoGeometria = {
  id: string;
  status: StatusGeometria;
  latitude_inicial?: number | null | undefined;
  longitude_inicial?: number | null | undefined;
  latitude_final?: number | null | undefined;
  longitude_final?: number | null | undefined;
  geometria?: unknown;
  fonte?: string | null | undefined;
  precisao?: string | null | undefined;
  erro?: string | null | undefined;
  confirmada?: boolean | undefined;
};

/**
 * Grava o resultado do job. Nunca apaga coordenadas já confirmadas manualmente
 * e nunca altera a regional nem o status geral do serviço.
 */
export async function gravarGeometrias(funcionarioId: string, itens: ResultadoGeometria[]) {
  const perfil = await carregarPerfil(funcionarioId);
  const ids = itens.map((i) => i.id);
  const { data: atuais, error } = await supabaseAdmin
    .from("programacoes")
    .select("id, regional_id, status_geometria, localizacao_confirmada")
    .in("id", ids);
  if (error) throw new Error(error.message);

  const porId = new Map((atuais ?? []).map((r) => [r.id, r]));
  let gravados = 0;
  const ignorados: string[] = [];

  for (const item of itens) {
    const atual = porId.get(item.id);
    if (!atual || atual.regional_id !== perfil.regional_id) {
      ignorados.push(item.id);
      continue;
    }
    // correções manuais têm prioridade sobre o job automático
    if (atual.status_geometria === "LOCALIZADA_MANUAL" && item.status !== "LOCALIZADA_MANUAL") {
      ignorados.push(item.id);
      continue;
    }

    const campos: Record<string, unknown> = {
      status_geometria: item.status,
      geometria_fonte: item.fonte ?? null,
      geometria_precisao: item.precisao ?? null,
      geometria_erro: item.erro ?? null,
      geometria_processada_em: new Date().toISOString(),
    };
    if (item.latitude_inicial != null && item.longitude_inicial != null) {
      campos["latitude_inicial"] = item.latitude_inicial;
      campos["longitude_inicial"] = item.longitude_inicial;
      campos["latitude_final"] = item.latitude_final ?? null;
      campos["longitude_final"] = item.longitude_final ?? null;
      campos["localizacao_confirmada"] = item.confirmada ?? true;
      if (item.geometria !== undefined) campos["geometria"] = item.geometria;
    }

    const { error: erroUpdate } = await supabaseAdmin
      .from("programacoes")
      .update(campos as never)
      .eq("id", item.id)
      .eq("regional_id", perfil.regional_id);
    if (erroUpdate) throw new Error(erroUpdate.message);
    gravados += 1;
  }

  return { ok: true, gravados, ignorados };
}
