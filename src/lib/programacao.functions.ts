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
        role: z.enum(["funcionario", "gestor", "admin"]).default("funcionario"),
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
      role: data.role,
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
    if (perfil.role === "funcionario") {
      throw new Error("Somente gestor regional ou administrador pode importar programação.");
    }

    const { data: regionais, error: erroRegionais } = await supabaseAdmin
      .from("regionais")
      .select("id, codigo");
    if (erroRegionais) throw new Error(erroRegionais.message);
    const idPorCodigo = new Map((regionais ?? []).map((r) => [r.codigo, r.id]));

    // Gestor só importa a própria regional
    const registrosPermitidos =
      perfil.role === "admin"
        ? data.registros
        : data.registros.filter(
            (r) => r.regional_codigo === perfil.regional_codigo || !r.regional_codigo,
          );

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
        visao: z.enum(["hoje", "amanha", "semana", "todas", "concluidas", "pendentes"]).default("hoje"),
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
    if (perfil.role === "admin") {
      if (data.regionalCodigo && data.regionalCodigo !== "TODAS") {
        consulta = consulta.eq("regional_codigo", data.regionalCodigo);
      }
    } else {
      consulta = consulta.eq("regional_id", perfil.regional_id);
      if (perfil.role === "funcionario") {
        // registros sem regional confirmada ficam ocultos até um gestor confirmar
        consulta = consulta.eq("regional_confirmada", true);
      }
    }

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
      .limit(1000);
    if (error) throw new Error(error.message);

    return { perfil, registros: registros ?? [] };
  });

export const listarPendentesDeRegional = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ funcionarioId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { carregarPerfil, COLUNAS_PROGRAMACAO } = await import("@/lib/programacao.server");
    const perfil = await carregarPerfil(data.funcionarioId);
    if (perfil.role === "funcionario") return [];

    const { data: registros, error } = await supabaseAdmin
      .from("programacoes")
      .select(COLUNAS_PROGRAMACAO)
      .eq("regional_confirmada", false)
      .limit(500);
    if (error) throw new Error(error.message);
    return registros ?? [];
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
    if (perfil.role === "funcionario") throw new Error("Sem permissão para corrigir registros.");

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
      if (perfil.role === "gestor" && regional.codigo !== perfil.regional_codigo) {
        throw new Error("Gestor só pode confirmar registros da própria regional.");
      }
      campos['regional_id'] = regional.id;
      campos['regional_confirmada'] = true;
      campos['regional_origem'] = "confirmacao_manual";
    }

    let consulta = supabaseAdmin
      .from("programacoes")
      .update(campos as never)
      .eq("id", data.id);
    if (perfil.role === "gestor") {
      consulta = consulta.or(`regional_id.eq.${perfil.regional_id},regional_id.is.null`);
    }
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
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { carregarPerfil } = await import("@/lib/programacao.server");
    const perfil = await carregarPerfil(data.funcionarioId);

    const { data: registro, error: erroBusca } = await supabaseAdmin
      .from("programacoes")
      .select("id, regional_id, assumido_por, assumido_em")
      .eq("id", data.programacaoId)
      .maybeSingle();
    if (erroBusca) throw new Error(erroBusca.message);
    if (!registro) throw new Error("Serviço não encontrado.");
    if (perfil.role !== "admin" && registro.regional_id !== perfil.regional_id) {
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
    });

    return { ok: true };
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
    if (perfil.role !== "admin") {
      consulta = consulta.eq("regional_id", perfil.regional_id);
      if (perfil.role === "funcionario") consulta = consulta.eq("regional_confirmada", true);
    }

    const { data: registros, error } = await consulta;
    if (error) throw new Error(error.message);
    const total = registros?.length ?? 0;
    const concluidos = (registros ?? []).filter((r) => r.status === "concluido").length;
    return { perfil, total, concluidos, pendentes: total - concluidos };
  });
