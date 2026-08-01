/**
 * Auditoria do pipeline de importação — leitura direta do banco.
 *
 * Nada aqui usa estado da tela: todas as contagens vêm das tabelas
 * importacoes_pdf, importacao_registros e programacoes, sempre com o filtro
 * de regional resolvido a partir do id do funcionário.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { carregarPerfil } from "@/lib/programacao.server";

const LOCALIZADAS = [
  "LOCALIZADA_DER_OFICIAL",
  "LOCALIZADA_BASE_LOCAL",
  "LOCALIZADA_INTERPOLADA",
  "LOCALIZADA_MANUAL",
];

export type RegistroAuditoria = {
  id: string;
  importacao_id: string | null;
  pagina_pdf: number | null;
  texto_original: string | null;
  regional_codigo: string | null;
  data_inicial: string | null;
  rodovia: string | null;
  km_inicial: number | null;
  km_final: number | null;
  status_validacao: string;
  status_persistencia: "persistido" | "em_conferencia";
  status_geometria: string;
  latitude_inicial: number | null;
  longitude_inicial: number | null;
  latitude_final: number | null;
  longitude_final: number | null;
  na_programacao: boolean;
  no_mapa: boolean;
  elegivel_rota: boolean;
  motivo_bloqueio: string | null;
  atualizado_em: string | null;
};

export type Auditoria = Awaited<ReturnType<typeof auditar>>;

export async function auditar(funcionarioId: string, importacaoId: string | null) {
  const perfil = await carregarPerfil(funcionarioId);

  let importacao: Record<string, unknown> | null = null;
  if (importacaoId) {
    const { data, error } = await supabaseAdmin
      .from("importacoes_pdf")
      .select("*")
      .eq("id", importacaoId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    importacao = data as Record<string, unknown> | null;
  }

  // ---- linhas em conferência (staging) ----
  let staging: Array<Record<string, unknown>> = [];
  if (importacaoId) {
    const { data, error } = await supabaseAdmin
      .from("importacao_registros")
      .select(
        "id, importacao_id, pagina_pdf, texto_original, regional_codigo, regional_id, data_inicial, rodovia, km_inicial, km_final, status_validacao, duplicado, motivos, programacao_id, atualizado_em",
      )
      .eq("importacao_id", importacaoId)
      .limit(3000);
    if (error) throw new Error(error.message);
    staging = (data ?? []) as Array<Record<string, unknown>>;
  }

  // ---- serviços persistidos ----
  let consulta = supabaseAdmin
    .from("programacoes")
    .select(
      "id, importacao_id, pagina_pdf, linha_bruta, regional_id, regional_codigo, regional_confirmada, data_inicial, data_final, rodovia, km_inicial, km_final, status, status_geometria, latitude_inicial, longitude_inicial, latitude_final, longitude_final, atualizado_em",
    )
    .limit(5000);
  if (importacaoId) consulta = consulta.eq("importacao_id", importacaoId);
  else consulta = consulta.eq("regional_id", perfil.regional_id);
  const { data: persistidos, error: erroPersist } = await consulta;
  if (erroPersist) throw new Error(erroPersist.message);

  const todos = (persistidos ?? []) as Array<Record<string, unknown>>;
  const daRegional = todos.filter((r) => r["regional_id"] === perfil.regional_id);

  const localizado = (r: Record<string, unknown>) =>
    r["latitude_inicial"] != null && r["longitude_inicial"] != null;
  const comGeometria = daRegional.filter(
    (r) => localizado(r) && LOCALIZADAS.includes(String(r["status_geometria"] ?? "")),
  );
  const aguardando = daRegional.filter((r) => !localizado(r));
  const concluidos = daRegional.filter((r) => r["status"] === "concluido");
  const cancelados = daRegional.filter((r) => r["status"] === "cancelado");
  const elegiveis = daRegional.filter(
    (r) =>
      localizado(r) &&
      r["regional_confirmada"] === true &&
      r["status"] !== "cancelado" &&
      r["status"] !== "concluido",
  );
  const naProgramacao = daRegional.filter((r) => r["regional_confirmada"] === true);

  // ---- contagem por regional (inclui não identificada) ----
  const porRegional = new Map<string, number>();
  for (const r of todos) {
    const chave = (r["regional_codigo"] as string | null) ?? "NAO_IDENTIFICADA";
    porRegional.set(chave, (porRegional.get(chave) ?? 0) + 1);
  }
  for (const r of staging) {
    if (r["programacao_id"]) continue;
    const chave = (r["regional_codigo"] as string | null) ?? "NAO_IDENTIFICADA";
    porRegional.set(chave, (porRegional.get(chave) ?? 0) + 1);
  }

  const emConferencia = staging.filter(
    (r) => !r["programacao_id"] && r["status_validacao"] !== "valido",
  );
  const rejeitadas = staging.filter((r) => r["status_validacao"] === "rejeitado");

  const motivoBloqueio = (r: Record<string, unknown>): string | null => {
    if (r["regional_id"] !== perfil.regional_id) return "Serviço de outra regional";
    if (r["regional_confirmada"] !== true) return "Regional ainda não confirmada";
    if (!localizado(r)) return "Aguardando localização (sem coordenada)";
    if (r["status"] === "cancelado") return "Serviço cancelado";
    if (r["status"] === "concluido") return "Serviço já concluído";
    return null;
  };

  const registros: RegistroAuditoria[] = [
    ...todos.map((r) => ({
      id: String(r["id"]),
      importacao_id: (r["importacao_id"] as string | null) ?? null,
      pagina_pdf: (r["pagina_pdf"] as number | null) ?? null,
      texto_original: (r["linha_bruta"] as string | null) ?? null,
      regional_codigo: (r["regional_codigo"] as string | null) ?? null,
      data_inicial: (r["data_inicial"] as string | null) ?? null,
      rodovia: (r["rodovia"] as string | null) ?? null,
      km_inicial: (r["km_inicial"] as number | null) ?? null,
      km_final: (r["km_final"] as number | null) ?? null,
      status_validacao: String(r["status"] ?? "pendente"),
      status_persistencia: "persistido" as const,
      status_geometria: String(
        r["status_geometria"] ?? (localizado(r) ? "LOCALIZADA_INTERPOLADA" : "AGUARDANDO_LOCALIZACAO"),
      ),
      latitude_inicial: (r["latitude_inicial"] as number | null) ?? null,
      longitude_inicial: (r["longitude_inicial"] as number | null) ?? null,
      latitude_final: (r["latitude_final"] as number | null) ?? null,
      longitude_final: (r["longitude_final"] as number | null) ?? null,
      na_programacao: r["regional_id"] === perfil.regional_id && r["regional_confirmada"] === true,
      no_mapa: r["regional_id"] === perfil.regional_id,
      elegivel_rota: motivoBloqueio(r) === null,
      motivo_bloqueio: motivoBloqueio(r),
      atualizado_em: (r["atualizado_em"] as string | null) ?? null,
    })),
    ...staging
      .filter((r) => !r["programacao_id"])
      .map((r) => ({
        id: String(r["id"]),
        importacao_id: (r["importacao_id"] as string | null) ?? null,
        pagina_pdf: (r["pagina_pdf"] as number | null) ?? null,
        texto_original: (r["texto_original"] as string | null) ?? null,
        regional_codigo: (r["regional_codigo"] as string | null) ?? null,
        data_inicial: (r["data_inicial"] as string | null) ?? null,
        rodovia: (r["rodovia"] as string | null) ?? null,
        km_inicial: (r["km_inicial"] as number | null) ?? null,
        km_final: (r["km_final"] as number | null) ?? null,
        status_validacao: String(r["status_validacao"] ?? "revisar"),
        status_persistencia: "em_conferencia" as const,
        status_geometria: "AGUARDANDO_LOCALIZACAO",
        latitude_inicial: null,
        longitude_inicial: null,
        latitude_final: null,
        longitude_final: null,
        na_programacao: false,
        no_mapa: false,
        elegivel_rota: false,
        motivo_bloqueio: Array.isArray(r["motivos"])
          ? (r["motivos"] as string[]).join(" · ") || "Em conferência"
          : "Em conferência",
        atualizado_em: (r["atualizado_em"] as string | null) ?? null,
      })),
  ];

  return {
    perfil,
    importacao,
    etapas: {
      paginasPdf: Number(importacao?.["total_paginas"] ?? 0),
      linhasBrutas: Number(importacao?.["total_registros"] ?? staging.length),
      linhasReconhecidas: staging.length || todos.length,
      linhasConferencia: emConferencia.length,
      linhasRejeitadas: rejeitadas.length,
      registrosSalvos: todos.length,
      servicosRegionalAtual: daRegional.length,
      aguardandoLocalizacao: aguardando.length,
      comGeometria: comGeometria.length,
      elegiveisRota: elegiveis.length,
      exibidosProgramacao: naProgramacao.length,
      exibidosMapa: daRegional.length,
      concluidos: concluidos.length,
      cancelados: cancelados.length,
    },
    porRegional: [...porRegional.entries()]
      .map(([codigo, total]) => ({ codigo, total }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo)),
    registros,
    validadoEm: new Date().toISOString(),
  };
}

/** Guarda o carimbo da última validação na própria importação. */
export async function registrarValidacao(
  funcionarioId: string,
  importacaoId: string,
  resultado: unknown,
) {
  const perfil = await carregarPerfil(funcionarioId);
  const agora = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("importacoes_pdf")
    .update({ ultima_validacao_em: agora, ultima_validacao: resultado as never })
    .eq("id", importacaoId);
  if (error) throw new Error(error.message);

  await supabaseAdmin
    .from("programacoes")
    .update({ ultima_validacao_em: agora })
    .eq("importacao_id", importacaoId)
    .eq("regional_id", perfil.regional_id);

  return { ok: true, validadoEm: agora };
}
