import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const listarRegionais = createServerFn({ method: "GET" }).handler(async () => {
  const { mapaRegionais } = await import("@/lib/programacao.server");
  return mapaRegionais();
});

export const salvarPerfil = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        nome: z.string().min(2).max(120),
        matricula: z.string().max(60).optional().nullable(),
        cargo: z.string().max(80).optional().nullable(),
        equipe: z.string().max(80).optional().nullable(),
        regional_codigo: z.string().min(3),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { carregarPerfil } = await import("@/lib/programacao.server");

    const { data: regional, error: erroRegional } = await supabaseAdmin
      .from("regionais")
      .select("id")
      .eq("codigo", data.regional_codigo)
      .maybeSingle();
    if (erroRegional) throw new Error(erroRegional.message);
    if (!regional) throw new Error("Regional inválida.");

    const registro = {
      nome: data.nome.trim(),
      matricula: data.matricula || null,
      cargo: data.cargo || null,
      equipe: data.equipe || null,
      regional_id: regional.id,
      role: "funcionario" as const,
    };

    if (data.id) {
      const { error } = await supabaseAdmin.from("funcionarios").update(registro).eq("id", data.id);
      if (error) throw new Error(error.message);
      return carregarPerfil(data.id);
    }

    const { data: existente } = await supabaseAdmin
      .from("funcionarios")
      .select("id")
      .ilike("nome", registro.nome)
      .eq("regional_id", regional.id)
      .maybeSingle();

    if (existente) {
      const { error } = await supabaseAdmin.from("funcionarios").update(registro).eq("id", existente.id);
      if (error) throw new Error(error.message);
      return carregarPerfil(existente.id);
    }

    const { data: criado, error } = await supabaseAdmin
      .from("funcionarios")
      .insert(registro)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return carregarPerfil(criado.id);
  });

export const obterPerfil = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ funcionarioId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { carregarPerfil } = await import("@/lib/programacao.server");
    return carregarPerfil(data.funcionarioId);
  });

export const verificarArquivo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ hash: z.string().min(8) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: arquivos, error } = await supabaseAdmin
      .from("arquivos_programacao")
      .select("id, nome, versao, criado_em, criado_por, total_registros")
      .eq("hash", data.hash)
      .order("versao", { ascending: false });
    if (error) throw new Error(error.message);
    return { jaImportado: (arquivos?.length ?? 0) > 0, arquivos: arquivos ?? [] };
  });

export const importarProgramacao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        modo: z.enum(["novo", "somente_novos", "nova_versao", "substituir"]).default("novo"),
        arquivo: z.object({
          nome: z.string().min(1),
          hash: z.string().min(8),
          periodo: z.string().nullable().optional(),
          tipo_periodo: z.string().nullable().optional(),
          total_paginas: z.number().int().nullable().optional(),
        }),
        registros: z
          .array(
            z.object({
              regional_codigo: z.string().nullable(),
              regional_confirmada: z.boolean(),
              regional_origem: z.string().nullable().optional(),
              equipe: z.string().nullable(),
              funcionario: z.string().nullable(),
              categoria: z.string().nullable(),
              contrato: z.string().nullable(),
              atividade: z.string().nullable(),
              rodovia: z.string().nullable(),
              km_inicial: z.number().nullable(),
              km_final: z.number().nullable(),
              descricao: z.string().nullable(),
              data_inicial: z.string().nullable(),
              data_final: z.string().nullable(),
              medicao: z.string().nullable(),
              observacao: z.string().nullable(),
              pagina_pdf: z.number().int(),
              linha_bruta: z.string().nullable(),
            }),
          )
          .min(1)
          .max(5000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { carregarPerfil, montarChaveDuplicidade } = await import("@/lib/programacao.server");

    const perfil = await carregarPerfil(data.funcionarioId);

    const { data: regionais, error: erroRegionais } = await supabaseAdmin
      .from("regionais")
      .select("id, codigo");
    if (erroRegionais) throw new Error(erroRegionais.message);
    const idPorCodigo = new Map((regionais ?? []).map((r) => [r.codigo, r.id]));

    // Todas as linhas do PDF são gravadas; a separação por regional acontece
    // na leitura (cada aparelho enxerga apenas a regional selecionada) e as
    // linhas sem regional ficam disponíveis na tela de revisão.
    const registrosPermitidos = data.registros;

    const { data: versaoAnterior } = await supabaseAdmin
      .from("arquivos_programacao")
      .select("id, versao")
      .eq("hash", data.arquivo.hash)
      .order("versao", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (versaoAnterior && data.modo === "substituir") {
      await supabaseAdmin.from("arquivos_programacao").delete().eq("hash", data.arquivo.hash);
    }

    const { data: arquivo, error: erroArquivo } = await supabaseAdmin
      .from("arquivos_programacao")
      .insert({
        nome: data.arquivo.nome,
        hash: data.arquivo.hash,
        periodo: data.arquivo.periodo ?? null,
        tipo_periodo: data.arquivo.tipo_periodo ?? null,
        total_paginas: data.arquivo.total_paginas ?? null,
        versao:
          data.modo === "nova_versao" && versaoAnterior ? (versaoAnterior.versao ?? 1) + 1 : 1,
        criado_por: perfil.nome,
        criado_por_id: perfil.id,
      })
      .select("id")
      .single();
    if (erroArquivo) throw new Error(erroArquivo.message);

    const linhas = registrosPermitidos.map((r) => ({
      arquivo_id: arquivo.id,
      regional_id: r.regional_codigo ? (idPorCodigo.get(r.regional_codigo) ?? null) : null,
      regional_codigo: r.regional_codigo,
      regional_confirmada: r.regional_confirmada && !!r.regional_codigo,
      regional_origem: r.regional_origem ?? null,
      equipe: r.equipe,
      funcionario: r.funcionario,
      categoria: r.categoria,
      contrato: r.contrato,
      atividade: r.atividade,
      rodovia: r.rodovia,
      km_inicial: r.km_inicial,
      km_final: r.km_final,
      descricao: r.descricao,
      data_inicial: r.data_inicial,
      data_final: r.data_final,
      medicao: r.medicao,
      observacao: r.observacao,
      pagina_pdf: r.pagina_pdf,
      linha_bruta: r.linha_bruta,
      chave_duplicidade: montarChaveDuplicidade(r),
    }));

    let paraInserir = linhas;
    let ignorados = 0;

    if (data.modo === "somente_novos") {
      const chaves = linhas.map((l) => l.chave_duplicidade);
      const { data: existentes } = await supabaseAdmin
        .from("programacoes")
        .select("chave_duplicidade")
        .in("chave_duplicidade", chaves);
      const jaExiste = new Set((existentes ?? []).map((e) => e.chave_duplicidade));
      paraInserir = linhas.filter((l) => !jaExiste.has(l.chave_duplicidade));
      ignorados = linhas.length - paraInserir.length;
    }

    for (let i = 0; i < paraInserir.length; i += 500) {
      const { error } = await supabaseAdmin.from("programacoes").insert(paraInserir.slice(i, i + 500));
      if (error) throw new Error(error.message);
    }

    await supabaseAdmin
      .from("arquivos_programacao")
      .update({ total_registros: paraInserir.length })
      .eq("id", arquivo.id);

    return {
      arquivoId: arquivo.id,
      inseridos: paraInserir.length,
      ignorados,
      descartadosPorRegional: data.registros.length - registrosPermitidos.length,
    };
  });

export const listarProgramacoes = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        regionalCodigo: z.string().optional(),
        visao: z
          .enum(["hoje", "amanha", "semana", "todas", "concluidas", "pendentes", "dia"])
          .default("hoje"),
        dia: z.string().max(10).optional(),
        somenteMeus: z.boolean().default(false),
        busca: z.string().max(120).optional(),
        rodovia: z.string().max(60).optional(),
        atividade: z.string().max(80).optional(),
        contrato: z.string().max(60).optional(),
        equipe: z.string().max(80).optional(),
        status: z.string().max(40).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { carregarPerfil, COLUNAS_PROGRAMACAO } = await import("@/lib/programacao.server");

    const perfil = await carregarPerfil(data.funcionarioId);
    let consulta = supabaseAdmin.from("programacoes").select(COLUNAS_PROGRAMACAO);

    // === FILTRO DE REGIONAL — aplicado no servidor, sempre ===
    // O cliente envia apenas o id do funcionário: a regional vem do banco.
    // Registros sem regional confirmada só aparecem na tela de revisão.
    consulta = consulta.eq("regional_id", perfil.regional_id).eq("regional_confirmada", true);

    const hoje = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    if (data.visao === "hoje") consulta = consulta.lte("data_inicial", iso(hoje)).gte("data_final", iso(hoje));
    if (data.visao === "amanha") {
      const amanha = new Date(hoje.getTime() + 86400000);
      consulta = consulta.lte("data_inicial", iso(amanha)).gte("data_final", iso(amanha));
    }
    if (data.visao === "semana") {
      const fim = new Date(hoje.getTime() + 7 * 86400000);
      consulta = consulta.lte("data_inicial", iso(fim)).gte("data_final", iso(hoje));
    }
    if (data.visao === "dia" && data.dia) {
      consulta = consulta.lte("data_inicial", data.dia).gte("data_final", data.dia);
    }
    if (data.visao === "concluidas") consulta = consulta.eq("status", "concluido");
    if (data.visao === "pendentes") consulta = consulta.neq("status", "concluido");

    if (data.somenteMeus) consulta = consulta.ilike("funcionario", `%${perfil.nome}%`);
    if (data.rodovia) consulta = consulta.ilike("rodovia", `%${data.rodovia}%`);
    if (data.atividade) consulta = consulta.ilike("atividade", `%${data.atividade}%`);
    if (data.contrato) consulta = consulta.ilike("contrato", `%${data.contrato}%`);
    if (data.equipe) consulta = consulta.ilike("equipe", `%${data.equipe}%`);
    if (data.status) consulta = consulta.eq("status", data.status);
    if (data.busca) {
      const b = data.busca.replace(/[%,()]/g, "");
      consulta = consulta.or(
        `descricao.ilike.%${b}%,rodovia.ilike.%${b}%,atividade.ilike.%${b}%,funcionario.ilike.%${b}%,contrato.ilike.%${b}%`,
      );
    }

    const { data: registros, error } = await consulta
      .order("data_inicial", { ascending: true })
      .order("rodovia", { ascending: true })
      .order("km_inicial", { ascending: true })
      .limit(1000);
    if (error) throw new Error(error.message);

    return { perfil, registros: registros ?? [] };
  });

/**
 * Tela "Revisar dados da programação": devolve apenas
 *  - registros da regional selecionada no aparelho e
 *  - registros que o leitor de PDF não conseguiu classificar (sem regional).
 */
export const listarParaRevisao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        somentePendentes: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { carregarPerfil, COLUNAS_PROGRAMACAO } = await import("@/lib/programacao.server");
    const perfil = await carregarPerfil(data.funcionarioId);

    const { data: registros, error } = await supabaseAdmin
      .from("programacoes")
      .select(COLUNAS_PROGRAMACAO)
      .or(`regional_id.eq.${perfil.regional_id},regional_id.is.null`)
      .order("regional_confirmada", { ascending: true })
      .order("data_inicial", { ascending: true })
      .limit(1000);
    if (error) throw new Error(error.message);

    const todos = registros ?? [];
    const semRegional = todos.filter((r) => !r.regional_id || !r.regional_confirmada);
    return {
      perfil,
      registros: data.somentePendentes ? semRegional : todos,
      totalPendentes: semRegional.length,
      totalRegional: todos.length - semRegional.length,
    };
  });

export const excluirRegistro = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ funcionarioId: z.string().uuid(), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { carregarPerfil } = await import("@/lib/programacao.server");
    const perfil = await carregarPerfil(data.funcionarioId);

    const { data: registro, error: erroBusca } = await supabaseAdmin
      .from("programacoes")
      .select("id, regional_id")
      .eq("id", data.id)
      .maybeSingle();
    if (erroBusca) throw new Error(erroBusca.message);
    if (!registro) return { ok: true };
    if (registro.regional_id && registro.regional_id !== perfil.regional_id) {
      throw new Error("Este serviço pertence a outra regional e não pode ser excluído aqui.");
    }

    const { error } = await supabaseAdmin.from("programacoes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Grava as coordenadas obtidas na malha oficial do DER para um serviço. */
export const salvarCoordenadas = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        itens: z
          .array(
            z.object({
              id: z.string().uuid(),
              latitude_inicial: z.number(),
              longitude_inicial: z.number(),
              latitude_final: z.number().nullable().optional(),
              longitude_final: z.number().nullable().optional(),
              localizacao_confirmada: z.boolean().default(true),
            }),
          )
          .min(1)
          .max(500),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { carregarPerfil } = await import("@/lib/programacao.server");
    const perfil = await carregarPerfil(data.funcionarioId);

    for (const item of data.itens) {
      await supabaseAdmin
        .from("programacoes")
        .update({
          latitude_inicial: item.latitude_inicial,
          longitude_inicial: item.longitude_inicial,
          latitude_final: item.latitude_final ?? null,
          longitude_final: item.longitude_final ?? null,
          localizacao_confirmada: item.localizacao_confirmada,
        })
        .eq("id", item.id)
        .eq("regional_id", perfil.regional_id);
    }
    return { ok: true, atualizados: data.itens.length };
  });

export const corrigirRegistro = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        id: z.string().uuid(),
        campos: z.object({
          regional_codigo: z.string().nullable().optional(),
          equipe: z.string().nullable().optional(),
          funcionario: z.string().nullable().optional(),
          rodovia: z.string().nullable().optional(),
          km_inicial: z.number().nullable().optional(),
          km_final: z.number().nullable().optional(),
          atividade: z.string().nullable().optional(),
          contrato: z.string().nullable().optional(),
          descricao: z.string().nullable().optional(),
          data_inicial: z.string().nullable().optional(),
          data_final: z.string().nullable().optional(),
          observacao: z.string().nullable().optional(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { carregarPerfil } = await import("@/lib/programacao.server");
    const perfil = await carregarPerfil(data.funcionarioId);

    const campos: {
      [k: string]: string | number | boolean | null | undefined;
    } = { ...data.campos };
    if (data.campos.regional_codigo) {
      const { data: regional } = await supabaseAdmin
        .from("regionais")
        .select("id, codigo")
        .eq("codigo", data.campos.regional_codigo)
        .maybeSingle();
      if (!regional) throw new Error("Regional inválida.");
      campos['regional_id'] = regional.id;
      campos['regional_confirmada'] = true;
      campos['regional_origem'] = "confirmacao_manual";
    }

    // Só é possível corrigir registros da própria regional ou ainda sem regional.
    const consulta = supabaseAdmin
      .from("programacoes")
      .update(campos as never)
      .eq("id", data.id)
      .or(`regional_id.eq.${perfil.regional_id},regional_id.is.null`);
    const { error } = await consulta;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const atualizarStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        programacaoId: z.string().uuid(),
        status: z.enum([
          "pendente",
          "na_rota",
          "em_deslocamento",
          "no_local",
          "em_fiscalizacao",
          "concluido",
          "nao_localizado",
          "reagendado",
          "cancelado",
        ]),
        observacao: z.string().max(1000).optional().nullable(),
        latitude: z.number().optional().nullable(),
        longitude: z.number().optional().nullable(),
        assumir: z.boolean().default(false),
        justificativa: z.string().max(500).optional().nullable(),
        // Evita gravar duas vezes a mesma conclusão quando a fila offline reenvia.
        chaveIdempotencia: z.string().max(120).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { carregarPerfil } = await import("@/lib/programacao.server");
    const perfil = await carregarPerfil(data.funcionarioId);

    // Idempotência: se esta mesma operação já subiu antes, não repete nada.
    if (data.chaveIdempotencia) {
      const { data: jaGravado } = await supabaseAdmin
        .from("programacao_eventos")
        .select("id")
        .eq("chave_idempotencia", data.chaveIdempotencia)
        .maybeSingle();
      if (jaGravado) return { ok: true, repetido: true };
    }


    const { data: registro, error: erroBusca } = await supabaseAdmin
      .from("programacoes")
      .select("id, regional_id, assumido_por, assumido_em")
      .eq("id", data.programacaoId)
      .maybeSingle();
    if (erroBusca) throw new Error(erroBusca.message);
    if (!registro) throw new Error("Serviço não encontrado.");
    if (registro.regional_id !== perfil.regional_id) {
      throw new Error("Este serviço não pertence à sua regional.");
    }
    if (
      registro.assumido_por &&
      registro.assumido_por !== perfil.nome &&
      !data.assumir
    ) {
      throw new Error(
        `Serviço assumido por ${registro.assumido_por}${registro.assumido_em ? ` às ${new Date(registro.assumido_em).toLocaleTimeString("pt-BR")}` : ""}.`,
      );
    }

    const { error } = await supabaseAdmin
      .from("programacoes")
      .update({
        status: data.status,
        assumido_por: data.status === "pendente" ? null : perfil.nome,
        assumido_em: data.status === "pendente" ? null : new Date().toISOString(),
      })
      .eq("id", data.programacaoId);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("programacao_eventos").insert({
      programacao_id: data.programacaoId,
      status: data.status,
      usuario_nome: perfil.nome,
      usuario_id: perfil.id,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      observacao: [data.observacao, data.justificativa].filter(Boolean).join(" | ") || null,
      chave_idempotencia: data.chaveIdempotencia ?? null,
    } as never);

    return { ok: true, repetido: false };
  });


export const resumoDoDia = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ funcionarioId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { carregarPerfil } = await import("@/lib/programacao.server");
    const perfil = await carregarPerfil(data.funcionarioId);
    const hoje = new Date().toISOString().slice(0, 10);

    let consulta = supabaseAdmin
      .from("programacoes")
      .select("status")
      .lte("data_inicial", hoje)
      .gte("data_final", hoje);
    consulta = consulta.eq("regional_id", perfil.regional_id).eq("regional_confirmada", true);

    const { data: registros, error } = await consulta;
    if (error) throw new Error(error.message);
    const total = registros?.length ?? 0;
    const concluidos = (registros ?? []).filter((r) => r.status === "concluido").length;
    return { perfil, total, concluidos, pendentes: total - concluidos };
  });

// ============================ ROTAS ============================

export const salvarRota = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        rotaId: z.string().uuid().nullable().optional(),
        importacaoId: z.string().uuid().nullable().optional(),
        situacao: z.enum(["rascunho", "ativa"]).default("ativa"),
        tipo: z.enum(["sugerida", "manual"]),
        data: z.string().min(8),
        pontoInicial: z
          .object({
            rotulo: z.string(),
            latitude: z.number(),
            longitude: z.number(),
            origem: z.string().optional(),
          })
          .nullable(),
        origemTipo: z.string().max(40).nullable().optional(),
        algoritmo: z.string().max(60).nullable().optional(),
        distanciaTotal: z.number().nullable().optional(),
        tempoEstimado: z.number().int().nullable().optional(),
        itens: z
          .array(
            z.object({
              programacaoId: z.string().uuid(),
              ordem: z.number().int().min(1),
              rotulo: z.string().max(200),
              latitude: z.number(),
              longitude: z.number(),
              distanciaAnterior: z.number().nullable().optional(),
              tempoAnterior: z.number().int().nullable().optional(),
            }),
          )
          .min(1)
          .max(200),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { carregarPerfil } = await import("@/lib/programacao.server");
    const { validarRota, textoDosProblemas } = await import("@/lib/rotas/validacao");
    const perfil = await carregarPerfil(data.funcionarioId);

    // Confere no banco (não no navegador) a regional de cada serviço da rota.
    const ids = data.itens.map((i) => i.programacaoId);
    const { data: registros, error: erroBusca } = await supabaseAdmin
      .from("programacoes")
      .select("id, regional_codigo, regional_id, regional_confirmada, rodovia, km_inicial")
      .in("id", ids);
    if (erroBusca) throw new Error(erroBusca.message);

    const porId = new Map((registros ?? []).map((r) => [r.id, r]));
    const faltando = ids.filter((id) => !porId.has(id));
    if (faltando.length) throw new Error("Alguns serviços da rota não existem mais no banco.");

    const problemas = validarRota(
      data.itens.map((i) => {
        const r = porId.get(i.programacaoId)!;
        return {
          programacaoId: i.programacaoId,
          rotulo: i.rotulo,
          regionalCodigo: r.regional_codigo,
          regionalConfirmada: Boolean(r.regional_confirmada) && r.regional_id === perfil.regional_id,
          latitude: i.latitude,
          longitude: i.longitude,
          ordem: i.ordem,
        };
      }),
      data.pontoInicial,
      perfil.regional_codigo,
    );
    if (problemas.length) throw new Error(textoDosProblemas(problemas));

    // Versão da programação vigente (para avisar quando a rota ficar defasada).
    let programacaoVersao: number | null = null;
    if (data.importacaoId) {
      const { data: imp } = await supabaseAdmin
        .from("importacoes_pdf")
        .select("programacao_versao, versao")
        .eq("id", data.importacaoId)
        .maybeSingle();
      programacaoVersao = imp?.programacao_versao ?? imp?.versao ?? null;
    }

    const cabecalho = {
      usuario_id: perfil.id,
      usuario_nome: perfil.nome,
      regional_id: perfil.regional_id,
      data: data.data,
      tipo: data.tipo,
      ponto_inicial: data.pontoInicial,
      distancia_total: data.distanciaTotal ?? null,
      tempo_estimado: data.tempoEstimado ?? null,
      importacao_id: data.importacaoId ?? null,
      status: data.situacao,
      origem_tipo: data.origemTipo ?? data.pontoInicial?.origem ?? null,
      origem_coordenadas: data.pontoInicial
        ? { latitude: data.pontoInicial.latitude, longitude: data.pontoInicial.longitude }
        : null,
      algoritmo_roteamento: data.algoritmo ?? (data.tipo === "sugerida" ? "vizinho_mais_proximo_osrm" : "manual"),
      servicos_ids: ids,
      quantidade_servicos: data.itens.length,
      programacao_versao: programacaoVersao,
      gerada_em: new Date().toISOString(),
    };

    let rotaId = data.rotaId ?? null;
    let versaoRota = 1;
    if (rotaId) {
      const { data: atual } = await supabaseAdmin
        .from("rotas")
        .select("versao_rota")
        .eq("id", rotaId)
        .eq("regional_id", perfil.regional_id)
        .maybeSingle();
      versaoRota = (atual?.versao_rota ?? 1) + 1;
      const { error } = await supabaseAdmin
        .from("rotas")
        .update({ ...cabecalho, versao_rota: versaoRota })
        .eq("id", rotaId)
        .eq("regional_id", perfil.regional_id);
      if (error) throw new Error(error.message);
      await supabaseAdmin.from("rota_itens").delete().eq("rota_id", rotaId);
    } else {
      const { data: criada, error } = await supabaseAdmin
        .from("rotas")
        .insert({ ...cabecalho, versao_rota: 1 })
        .select("id, versao_rota")
        .single();
      if (error) throw new Error(error.message);
      rotaId = criada.id;
      versaoRota = criada.versao_rota ?? 1;
    }

    const { error: erroItens } = await supabaseAdmin.from("rota_itens").insert(
      data.itens.map((i) => ({
        rota_id: rotaId!,
        programacao_id: i.programacaoId,
        ordem: i.ordem,
        rotulo: i.rotulo,
        latitude: i.latitude,
        longitude: i.longitude,
        distancia_anterior: i.distanciaAnterior ?? null,
        tempo_anterior: i.tempoAnterior ?? null,
      })),
    );
    if (erroItens) throw new Error(erroItens.message);

    await supabaseAdmin
      .from("programacoes")
      .update({ status: "na_rota" })
      .in("id", ids)
      .eq("regional_id", perfil.regional_id)
      .eq("status", "pendente");

    return { ok: true, rotaId, versaoRota, itens: data.itens.length };
  });

export const listarRotas = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ funcionarioId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { carregarPerfil } = await import("@/lib/programacao.server");
    const perfil = await carregarPerfil(data.funcionarioId);

    const { data: rotas, error } = await supabaseAdmin
      .from("rotas")
      .select(
        "id, data, tipo, status, distancia_total, tempo_estimado, ponto_inicial, usuario_nome, criado_em, importacao_id, rota_itens(id, ordem, rotulo, latitude, longitude, programacao_id, status, distancia_anterior, tempo_anterior)",
      )
      .eq("regional_id", perfil.regional_id)
      .order("criado_em", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { perfil, rotas: rotas ?? [] };
  });

export const excluirRota = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ funcionarioId: z.string().uuid(), rotaId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { carregarPerfil } = await import("@/lib/programacao.server");
    const perfil = await carregarPerfil(data.funcionarioId);
    const { error } = await supabaseAdmin
      .from("rotas")
      .delete()
      .eq("id", data.rotaId)
      .eq("regional_id", perfil.regional_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ==================== LOCALIZAÇÃO MANUAL ====================

/**
 * Correção manual de localização feita pelo fiscal em campo.
 * O que é confirmado à mão tem prioridade: o job automático de geometria
 * nunca sobrescreve um registro marcado como LOCALIZADA_MANUAL.
 */
export const salvarLocalizacaoManual = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        programacaoId: z.string().uuid(),
        rodovia: z.string().max(60).nullable().optional(),
        km_inicial: z.number().nullable().optional(),
        km_final: z.number().nullable().optional(),
        sentido: z.string().max(30).nullable().optional(),
        municipio: z.string().max(120).nullable().optional(),
        referencia_local: z.string().max(300).nullable().optional(),
        latitude: z.number().min(-90).max(90).nullable().optional(),
        longitude: z.number().min(-180).max(180).nullable().optional(),
        observacao: z.string().max(1000).nullable().optional(),
        chaveIdempotencia: z.string().max(120).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { carregarPerfil } = await import("@/lib/programacao.server");
    const perfil = await carregarPerfil(data.funcionarioId);

    const { data: registro, error: erroBusca } = await supabaseAdmin
      .from("programacoes")
      .select("id, regional_id, rodovia, km_inicial, km_final")
      .eq("id", data.programacaoId)
      .maybeSingle();
    if (erroBusca) throw new Error(erroBusca.message);
    if (!registro) throw new Error("Serviço não encontrado.");
    if (registro.regional_id !== perfil.regional_id) {
      throw new Error("Este serviço não pertence à sua regional.");
    }

    const rodovia = data.rodovia ?? registro.rodovia;
    const kmInicial = data.km_inicial ?? registro.km_inicial;
    const kmFinal = data.km_final ?? registro.km_final ?? kmInicial;
    const temCoordenada = data.latitude != null && data.longitude != null;
    if (!temCoordenada && (!rodovia || kmInicial == null)) {
      throw new Error("Informe a rodovia e o km inicial, ou marque o ponto no mapa.");
    }
    if (kmInicial != null && kmFinal != null && kmFinal < kmInicial) {
      throw new Error("O km final não pode ser menor que o km inicial.");
    }

    const campos: Record<string, unknown> = {
      rodovia,
      km_inicial: kmInicial,
      km_final: kmFinal,
      sentido: data.sentido ?? null,
      municipio: data.municipio ?? null,
      referencia_local: data.referencia_local ?? null,
      observacao: data.observacao ?? null,
      localizacao_manual: true,
      localizacao_manual_em: new Date().toISOString(),
      localizacao_manual_por: perfil.nome,
      ultima_validacao_em: new Date().toISOString(),
    };
    if (temCoordenada) {
      campos["latitude_inicial"] = data.latitude;
      campos["longitude_inicial"] = data.longitude;
      campos["localizacao_confirmada"] = true;
      campos["status_geometria"] = "LOCALIZADA_MANUAL";
      campos["geometria_fonte"] = "correcao_manual";
      campos["geometria_erro"] = null;
    } else {
      // Sem coordenada ainda: o job passa a ter dados suficientes para localizar.
      campos["status_geometria"] = "AGUARDANDO_LOCALIZACAO";
      campos["geometria_erro"] = null;
    }

    const { error } = await supabaseAdmin
      .from("programacoes")
      .update(campos as never)
      .eq("id", data.programacaoId)
      .eq("regional_id", perfil.regional_id);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("programacao_eventos").insert({
      programacao_id: data.programacaoId,
      status: "localizacao_corrigida",
      usuario_nome: perfil.nome,
      usuario_id: perfil.id,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      observacao: `Localização corrigida manualmente: ${rodovia ?? "—"} km ${kmInicial ?? "—"}`,
      chave_idempotencia: data.chaveIdempotencia ?? null,
    } as never);

    return { ok: true, localizada: temCoordenada };
  });

/** Registra que o fiscal pediu confirmação da localização ao escritório. */
export const solicitarConfirmacaoLocalizacao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        programacaoId: z.string().uuid(),
        observacao: z.string().max(1000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { carregarPerfil } = await import("@/lib/programacao.server");
    const perfil = await carregarPerfil(data.funcionarioId);

    const { error } = await supabaseAdmin
      .from("programacoes")
      .update({
        solicitacao_confirmacao_em: new Date().toISOString(),
        solicitacao_confirmacao_por: perfil.nome,
        observacao: data.observacao ?? null,
      } as never)
      .eq("id", data.programacaoId)
      .eq("regional_id", perfil.regional_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ==================== AGENDA DO DIA (copiloto) ====================

/** Serviço da agenda, já enxuto para trafegar até o aparelho. */
export type ServicoAgenda = {
  id: string;
  rodovia: string | null;
  km_inicial: number | null;
  km_final: number | null;
  atividade: string | null;
  descricao: string | null;
  contrato: string | null;
  equipe: string | null;
  funcionario: string | null;
  status: string;
  data_inicial: string | null;
  data_final: string | null;
  latitude_inicial: number | null;
  longitude_inicial: number | null;
  latitude_final: number | null;
  longitude_final: number | null;
  sentido: string | null;
  municipio: string | null;
  referencia_local: string | null;
  status_geometria: string | null;
  localizacao_manual: boolean;
  localizacao_confirmada: boolean;
  solicitacao_confirmacao_em: string | null;
  assumido_por: string | null;
  observacao: string | null;
};

function comoServicoAgenda(r: Record<string, unknown>): ServicoAgenda {
  const texto = (c: string) => (typeof r[c] === "string" ? (r[c] as string) : null);
  const numero = (c: string) => (typeof r[c] === "number" ? (r[c] as number) : null);
  return {
    id: String(r["id"]),
    rodovia: texto("rodovia"),
    km_inicial: numero("km_inicial"),
    km_final: numero("km_final"),
    atividade: texto("atividade"),
    descricao: texto("descricao"),
    contrato: texto("contrato"),
    equipe: texto("equipe"),
    funcionario: texto("funcionario"),
    status: texto("status") ?? "pendente",
    data_inicial: texto("data_inicial"),
    data_final: texto("data_final"),
    latitude_inicial: numero("latitude_inicial"),
    longitude_inicial: numero("longitude_inicial"),
    latitude_final: numero("latitude_final"),
    longitude_final: numero("longitude_final"),
    sentido: texto("sentido"),
    municipio: texto("municipio"),
    referencia_local: texto("referencia_local"),
    status_geometria: texto("status_geometria"),
    localizacao_manual: r["localizacao_manual"] === true,
    localizacao_confirmada: r["localizacao_confirmada"] === true,
    solicitacao_confirmacao_em: texto("solicitacao_confirmacao_em"),
    assumido_por: texto("assumido_por"),
    observacao: texto("observacao"),
  };
}

/**
 * Agenda operacional do fiscal: separa a programação da regional em
 * Hoje / Amanhã / Próximos dias / Pendentes / Concluídos, sempre com o
 * filtro de regional resolvido no servidor a partir do id do funcionário.
 */
export const agendaDoDia = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        dia: z.string().max(10).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { carregarPerfil, COLUNAS_PROGRAMACAO } = await import("@/lib/programacao.server");
    const perfil = await carregarPerfil(data.funcionarioId);

    const { data: registros, error } = await supabaseAdmin
      .from("programacoes")
      .select(COLUNAS_PROGRAMACAO)
      .eq("regional_id", perfil.regional_id)
      .eq("regional_confirmada", true)
      .order("data_inicial", { ascending: true })
      .order("rodovia", { ascending: true })
      .order("km_inicial", { ascending: true })
      .limit(2000);
    if (error) throw new Error(error.message);

    const hoje = data.dia ?? new Date().toISOString().slice(0, 10);
    const amanha = new Date(new Date(`${hoje}T12:00:00`).getTime() + 86400000)
      .toISOString()
      .slice(0, 10);

    const todos = ((registros ?? []) as unknown as Array<Record<string, unknown>>).map(
      comoServicoAgenda,
    );
    const noDia = (r: ServicoAgenda, dia: string) => {
      const i = r.data_inicial;
      if (!i) return false;
      return i <= dia && (r.data_final ?? i) >= dia;
    };
    const concluido = (r: ServicoAgenda) => r.status === "concluido";
    const localizado = (r: ServicoAgenda) =>
      r.latitude_inicial != null && r.longitude_inicial != null;

    const doDia = todos.filter((r) => noDia(r, hoje));

    return {
      perfil,
      dia: hoje,
      hoje: doDia,
      amanha: todos.filter((r) => noDia(r, amanha)),
      proximos: todos.filter((r) => {
        const i = (r["data_inicial"] as string | null) ?? null;
        return !!i && i > amanha;
      }),
      pendentes: todos.filter((r) => !concluido(r)),
      concluidos: todos.filter(concluido),
      // Serviços que não entram na rota por falta de localização.
      naoLocalizados: todos.filter((r) => !concluido(r) && !localizado(r)),
      resumoDia: {
        total: doDia.length,
        concluidos: doDia.filter(concluido).length,
        ativos: doDia.filter((r) => !concluido(r)).length,
        naRota: doDia.filter((r) => !concluido(r) && localizado(r)).length,
        semLocalizacao: doDia.filter((r) => !concluido(r) && !localizado(r)).length,
      },
    };
  });

