import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Cria a importação em conferência: nada entra na programação oficial ainda. */
export const criarImportacao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        arquivo: z.object({
          nome: z.string().min(1),
          hash: z.string().min(8),
          periodo_inicio: z.string().nullable().optional(),
          periodo_fim: z.string().nullable().optional(),
          tipo_periodo: z.string().nullable().optional(),
          total_paginas: z.number().int().nullable().optional(),
          conteudo_base64: z.string().max(20_000_000).nullable().optional(),
        }),
        importacaoAnteriorId: z.string().uuid().nullable().optional(),
        registros: z
          .array(
            z.object({
              regional_codigo: z.string().nullable(),
              regional_confirmada: z.boolean().default(false),
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
    const { carregarPerfil } = await import("@/lib/programacao.server");
    const {
      avaliarRegistro,
      chaveDoRegistro,
      mapaIdPorCodigoRegional,
      recalcularTotais,
      BUCKET_PDF,
    } = await import("@/lib/importacoes.server");

    const perfil = await carregarPerfil(data.funcionarioId);
    const idPorCodigo = await mapaIdPorCodigoRegional();

    const { data: anterior } = await supabaseAdmin
      .from("importacoes_pdf")
      .select("id, versao")
      .eq("hash_arquivo", data.arquivo.hash)
      .order("versao", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: arquivo } = await supabaseAdmin
      .from("arquivos_programacao")
      .insert({
        nome: data.arquivo.nome,
        hash: data.arquivo.hash,
        periodo:
          data.arquivo.periodo_inicio && data.arquivo.periodo_fim
            ? `${data.arquivo.periodo_inicio} a ${data.arquivo.periodo_fim}`
            : null,
        tipo_periodo: data.arquivo.tipo_periodo ?? null,
        total_paginas: data.arquivo.total_paginas ?? null,
        versao: anterior ? (anterior.versao ?? 1) + 1 : 1,
        criado_por: perfil.nome,
        criado_por_id: perfil.id,
      })
      .select("id")
      .single();

    const { data: importacao, error: erroImportacao } = await supabaseAdmin
      .from("importacoes_pdf")
      .insert({
        nome_arquivo: data.arquivo.nome,
        hash_arquivo: data.arquivo.hash,
        periodo_inicio: data.arquivo.periodo_inicio ?? null,
        periodo_fim: data.arquivo.periodo_fim ?? null,
        tipo_periodo: data.arquivo.tipo_periodo ?? null,
        total_paginas: data.arquivo.total_paginas ?? null,
        status: "em_conferencia",
        usuario_nome: perfil.nome,
        usuario_id: perfil.id,
        regional_origem_id: perfil.regional_id,
        versao: anterior ? (anterior.versao ?? 1) + 1 : 1,
        importacao_anterior_id: data.importacaoAnteriorId ?? anterior?.id ?? null,
        arquivo_id: arquivo?.id ?? null,
      })
      .select("id, versao")
      .single();
    if (erroImportacao) throw new Error(erroImportacao.message);

    // Guarda o PDF original para consulta futura sem reenvio do arquivo.
    if (data.arquivo.conteudo_base64) {
      try {
        const binario = Uint8Array.from(atob(data.arquivo.conteudo_base64), (c) => c.charCodeAt(0));
        const caminho = `${importacao.id}.pdf`;
        const { error } = await supabaseAdmin.storage
          .from(BUCKET_PDF)
          .upload(caminho, binario, { contentType: "application/pdf", upsert: true });
        if (!error) {
          await supabaseAdmin
            .from("importacoes_pdf")
            .update({ caminho_arquivo: caminho })
            .eq("id", importacao.id);
        }
      } catch {
        /* o arquivo original é um apoio: a conferência funciona sem ele */
      }
    }

    const chaves = data.registros.map((r) => chaveDoRegistro(r));
    const { data: jaExistentes } = await supabaseAdmin
      .from("programacoes")
      .select("chave_duplicidade")
      .in("chave_duplicidade", chaves);
    const existentes = new Set((jaExistentes ?? []).map((e) => e.chave_duplicidade));

    const linhas = data.registros.map((r) => {
      const duplicado = existentes.has(chaveDoRegistro(r));
      const { valido, motivos } = avaliarRegistro({ ...r, duplicado });
      return {
        importacao_id: importacao.id,
        regional_id: r.regional_codigo ? (idPorCodigo.get(r.regional_codigo) ?? null) : null,
        regional_codigo: r.regional_codigo,
        regional_confirmada: r.regional_confirmada && !!r.regional_codigo,
        regional_origem: r.regional_origem ?? null,
        pagina_pdf: r.pagina_pdf,
        texto_original: r.linha_bruta,
        valores_extraidos: r as unknown as Record<string, unknown>,
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
        chave_duplicidade: chaveDoRegistro(r),
        duplicado,
        status_validacao: valido ? ("valido" as const) : ("revisar" as const),
        motivos,
      };
    });

    for (let i = 0; i < linhas.length; i += 400) {
      const { error } = await supabaseAdmin
        .from("importacao_registros")
        .insert(linhas.slice(i, i + 400) as never);
      if (error) throw new Error(error.message);
    }

    const totais = await recalcularTotais(importacao.id);
    return { importacaoId: importacao.id, versao: importacao.versao, ...totais };
  });

/** Duplicidade: informa se o mesmo PDF já foi importado antes. */
export const verificarHashImportacao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ hash: z.string().min(8) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: encontradas, error } = await supabaseAdmin
      .from("importacoes_pdf")
      .select(
        "id, nome_arquivo, status, versao, criado_em, confirmado_em, total_registros, total_erros, periodo_inicio, periodo_fim, usuario_nome",
      )
      .eq("hash_arquivo", data.hash)
      .order("versao", { ascending: false });
    if (error) throw new Error(error.message);
    return { jaImportado: (encontradas?.length ?? 0) > 0, importacoes: encontradas ?? [] };
  });

export const obterImportacao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ funcionarioId: z.string().uuid(), importacaoId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { carregarPerfil } = await import("@/lib/programacao.server");
    const { carregarImportacao, COLUNAS_REGISTRO_IMPORTACAO } = await import(
      "@/lib/importacoes.server"
    );

    const perfil = await carregarPerfil(data.funcionarioId);
    const importacao = await carregarImportacao(data.importacaoId);
    const { data: registros, error } = await supabaseAdmin
      .from("importacao_registros")
      .select(COLUNAS_REGISTRO_IMPORTACAO)
      .eq("importacao_id", data.importacaoId)
      .order("pagina_pdf", { ascending: true })
      .order("criado_em", { ascending: true });
    if (error) throw new Error(error.message);

    return { perfil, importacao, registros: registros ?? [] };
  });

export const editarRegistroImportacao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        registroId: z.string().uuid(),
        campos: z.object({
          regional_codigo: z.string().nullable().optional(),
          equipe: z.string().nullable().optional(),
          funcionario: z.string().nullable().optional(),
          categoria: z.string().nullable().optional(),
          contrato: z.string().nullable().optional(),
          atividade: z.string().nullable().optional(),
          rodovia: z.string().nullable().optional(),
          km_inicial: z.number().nullable().optional(),
          km_final: z.number().nullable().optional(),
          descricao: z.string().nullable().optional(),
          data_inicial: z.string().nullable().optional(),
          data_final: z.string().nullable().optional(),
          medicao: z.string().nullable().optional(),
          observacao: z.string().nullable().optional(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { carregarPerfil } = await import("@/lib/programacao.server");
    const {
      avaliarRegistro,
      chaveDoRegistro,
      mapaIdPorCodigoRegional,
      recalcularTotais,
      COLUNAS_REGISTRO_IMPORTACAO,
    } = await import("@/lib/importacoes.server");

    await carregarPerfil(data.funcionarioId);
    const { data: atual, error: erroBusca } = await supabaseAdmin
      .from("importacao_registros")
      .select(COLUNAS_REGISTRO_IMPORTACAO)
      .eq("id", data.registroId)
      .maybeSingle();
    if (erroBusca) throw new Error(erroBusca.message);
    if (!atual) throw new Error("Linha da importação não encontrada.");

    const idPorCodigo = await mapaIdPorCodigoRegional();
    const atualizado = { ...atual, ...data.campos };
    const corrigidos = new Set<string>(atual.campos_corrigidos ?? []);
    for (const [campo, valor] of Object.entries(data.campos)) {
      const antes = (atual as unknown as Record<string, unknown>)[campo] ?? null;
      const depois = valor ?? null;
      if (String(antes ?? "") !== String(depois ?? "")) corrigidos.add(campo);
    }

    const { valido, motivos } = avaliarRegistro({
      ...atualizado,
      km_inicial: atualizado.km_inicial == null ? null : Number(atualizado.km_inicial),
      km_final: atualizado.km_final == null ? null : Number(atualizado.km_final),
      duplicado: atual.duplicado,
    });

    const { error } = await supabaseAdmin
      .from("importacao_registros")
      .update({
        ...data.campos,
        regional_id: atualizado.regional_codigo
          ? (idPorCodigo.get(atualizado.regional_codigo) ?? null)
          : null,
        regional_confirmada: !!atualizado.regional_codigo,
        regional_origem: data.campos.regional_codigo ? "confirmacao_manual" : atual.regional_origem,
        chave_duplicidade: chaveDoRegistro(atualizado as never),
        status_validacao: valido ? "valido" : "revisar",
        motivos,
        campos_corrigidos: [...corrigidos],
        foi_corrigido: corrigidos.size > 0,
      } as never)
      .eq("id", data.registroId);
    if (error) throw new Error(error.message);

    await recalcularTotais(atual.importacao_id);
    return { ok: true, valido, motivos };
  });

/** Ações por linha: confirmar, marcar para revisar, excluir e restaurar. */
export const acaoRegistroImportacao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        registroId: z.string().uuid(),
        acao: z.enum(["confirmar", "revisar", "excluir", "restaurar"]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { carregarPerfil } = await import("@/lib/programacao.server");
    const {
      avaliarRegistro,
      chaveDoRegistro,
      mapaIdPorCodigoRegional,
      recalcularTotais,
      COLUNAS_REGISTRO_IMPORTACAO,
    } = await import("@/lib/importacoes.server");

    await carregarPerfil(data.funcionarioId);
    const { data: registro, error: erroBusca } = await supabaseAdmin
      .from("importacao_registros")
      .select(COLUNAS_REGISTRO_IMPORTACAO)
      .eq("id", data.registroId)
      .maybeSingle();
    if (erroBusca) throw new Error(erroBusca.message);
    if (!registro) throw new Error("Linha da importação não encontrada.");

    if (data.acao === "excluir") {
      const { error } = await supabaseAdmin
        .from("importacao_registros")
        .update({ status_validacao: "rejeitado", motivos: ["Excluído na conferência"] })
        .eq("id", data.registroId);
      if (error) throw new Error(error.message);
      await recalcularTotais(registro.importacao_id);
      return { ok: true };
    }

    if (data.acao === "revisar") {
      const { error } = await supabaseAdmin
        .from("importacao_registros")
        .update({ status_validacao: "revisar", motivos: ["Marcado para revisão manual"] })
        .eq("id", data.registroId);
      if (error) throw new Error(error.message);
      await recalcularTotais(registro.importacao_id);
      return { ok: true };
    }

    if (data.acao === "confirmar") {
      const { valido, motivos } = avaliarRegistro({
        ...registro,
        km_inicial: registro.km_inicial == null ? null : Number(registro.km_inicial),
        km_final: registro.km_final == null ? null : Number(registro.km_final),
        duplicado: false,
      });
      if (!valido) throw new Error(`Não é possível confirmar: ${motivos.join("; ")}`);
      const { error } = await supabaseAdmin
        .from("importacao_registros")
        .update({ status_validacao: "valido", motivos: [] })
        .eq("id", data.registroId);
      if (error) throw new Error(error.message);
      await recalcularTotais(registro.importacao_id);
      return { ok: true };
    }

    // restaurar: volta exatamente ao que o leitor extraiu do PDF
    const originais = (registro.valores_extraidos ?? {}) as Record<string, unknown>;
    const idPorCodigo = await mapaIdPorCodigoRegional();
    const campos = {
      regional_codigo: (originais["regional_codigo"] as string | null) ?? null,
      equipe: (originais["equipe"] as string | null) ?? null,
      funcionario: (originais["funcionario"] as string | null) ?? null,
      categoria: (originais["categoria"] as string | null) ?? null,
      contrato: (originais["contrato"] as string | null) ?? null,
      atividade: (originais["atividade"] as string | null) ?? null,
      rodovia: (originais["rodovia"] as string | null) ?? null,
      km_inicial: (originais["km_inicial"] as number | null) ?? null,
      km_final: (originais["km_final"] as number | null) ?? null,
      descricao: (originais["descricao"] as string | null) ?? null,
      data_inicial: (originais["data_inicial"] as string | null) ?? null,
      data_final: (originais["data_final"] as string | null) ?? null,
      medicao: (originais["medicao"] as string | null) ?? null,
      observacao: (originais["observacao"] as string | null) ?? null,
    };
    const { valido, motivos } = avaliarRegistro({ ...campos, duplicado: registro.duplicado });
    const { error } = await supabaseAdmin
      .from("importacao_registros")
      .update({
        ...campos,
        regional_id: campos.regional_codigo ? (idPorCodigo.get(campos.regional_codigo) ?? null) : null,
        regional_confirmada: !!campos.regional_codigo,
        regional_origem: (originais["regional_origem"] as string | null) ?? null,
        chave_duplicidade: chaveDoRegistro(campos),
        status_validacao: valido ? "valido" : "revisar",
        motivos,
        campos_corrigidos: [],
        foi_corrigido: false,
      } as never)
      .eq("id", data.registroId);
    if (error) throw new Error(error.message);
    await recalcularTotais(registro.importacao_id);
    return { ok: true };
  });

/** Confirma a conferência e libera os registros válidos para a programação. */
export const confirmarImportacao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        importacaoId: z.string().uuid(),
        somenteValidos: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { carregarPerfil } = await import("@/lib/programacao.server");
    const { carregarImportacao, recalcularTotais, COLUNAS_REGISTRO_IMPORTACAO } = await import(
      "@/lib/importacoes.server"
    );

    const perfil = await carregarPerfil(data.funcionarioId);
    const importacao = await carregarImportacao(data.importacaoId);
    if (importacao.status === "cancelado") throw new Error("Esta importação foi cancelada.");

    const { data: registros, error } = await supabaseAdmin
      .from("importacao_registros")
      .select(COLUNAS_REGISTRO_IMPORTACAO)
      .eq("importacao_id", data.importacaoId);
    if (error) throw new Error(error.message);

    const todos = registros ?? [];
    const validos = todos.filter(
      (r) => r.status_validacao === "valido" && !r.programacao_id && r.regional_id,
    );
    const pendentes = todos.filter((r) => r.status_validacao === "revisar" || r.status_validacao === "pendente");
    if (!data.somenteValidos && pendentes.length) {
      throw new Error("Existem registros pendentes de conferência.");
    }

    let inseridos = 0;
    for (const r of validos) {
      const { data: criado, error: erroInsert } = await supabaseAdmin
        .from("programacoes")
        .insert({
          arquivo_id: importacao.arquivo_id,
          importacao_id: importacao.id,
          importacao_registro_id: r.id,
          regional_id: r.regional_id,
          regional_codigo: r.regional_codigo,
          regional_confirmada: true,
          regional_origem: r.regional_origem,
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
          data_final: r.data_final ?? r.data_inicial,
          medicao: r.medicao,
          observacao: r.observacao,
          pagina_pdf: r.pagina_pdf,
          linha_bruta: r.texto_original,
          chave_duplicidade: r.chave_duplicidade,
        })
        .select("id")
        .single();
      if (erroInsert) throw new Error(erroInsert.message);
      await supabaseAdmin
        .from("importacao_registros")
        .update({ status_validacao: "confirmado", programacao_id: criado.id })
        .eq("id", r.id);
      inseridos += 1;
    }

    const restantes = pendentes.length;
    const status =
      restantes > 0
        ? inseridos > 0
          ? "parcialmente_confirmado"
          : "com_erros"
        : "confirmado";

    await supabaseAdmin
      .from("importacoes_pdf")
      .update({
        status,
        confirmado_em: new Date().toISOString(),
        usuario_nome: importacao.usuario_nome ?? perfil.nome,
      })
      .eq("id", data.importacaoId);
    await recalcularTotais(data.importacaoId);

    return { ok: true, inseridos, pendentes: restantes, status };
  });

export const atualizarStatusImportacao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        importacaoId: z.string().uuid(),
        status: z.enum(["em_conferencia", "cancelado"]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { carregarPerfil } = await import("@/lib/programacao.server");
    await carregarPerfil(data.funcionarioId);
    const { error } = await supabaseAdmin
      .from("importacoes_pdf")
      .update({ status: data.status })
      .eq("id", data.importacaoId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Remove somente o arquivo PDF guardado, preservando os dados processados. */
export const removerPdfImportacao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ funcionarioId: z.string().uuid(), importacaoId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { carregarPerfil } = await import("@/lib/programacao.server");
    const { apagarArquivoPdf } = await import("@/lib/importacoes.server");
    await carregarPerfil(data.funcionarioId);
    return apagarArquivoPdf(data.importacaoId);
  });

/** Limpeza total: PDF, linhas lidas, programação, rotas, inspeções e ocorrências. */
export const excluirImportacao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ funcionarioId: z.string().uuid(), importacaoId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { carregarPerfil } = await import("@/lib/programacao.server");
    const { purgarImportacao } = await import("@/lib/importacoes.server");
    await carregarPerfil(data.funcionarioId);
    const resultado = await purgarImportacao(data.importacaoId);
    return { ok: true, ...resultado };
  });


export const listarImportacoes = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        status: z.string().max(40).optional(),
        regionalCodigo: z.string().max(60).optional(),
        nomeArquivo: z.string().max(160).optional(),
        de: z.string().max(10).optional(),
        ate: z.string().max(10).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { carregarPerfil } = await import("@/lib/programacao.server");
    const perfil = await carregarPerfil(data.funcionarioId);

    let consulta = supabaseAdmin
      .from("importacoes_pdf")
      .select(
        "id, nome_arquivo, hash_arquivo, caminho_arquivo, periodo_inicio, periodo_fim, status, usuario_nome, regionais_encontradas, total_registros, total_erros, total_duplicados, versao, importacao_anterior_id, criado_em, confirmado_em",
      )
      .order("criado_em", { ascending: false })
      .limit(200);

    if (data.status) consulta = consulta.eq("status", data.status);
    if (data.regionalCodigo) consulta = consulta.contains("regionais_encontradas", [data.regionalCodigo]);
    if (data.nomeArquivo) consulta = consulta.ilike("nome_arquivo", `%${data.nomeArquivo.replace(/[%,()]/g, "")}%`);
    if (data.de) consulta = consulta.gte("criado_em", `${data.de}T00:00:00`);
    if (data.ate) consulta = consulta.lte("criado_em", `${data.ate}T23:59:59`);

    const { data: importacoes, error } = await consulta;
    if (error) throw new Error(error.message);
    return { perfil, importacoes: importacoes ?? [] };
  });

/** Link temporário para abrir o PDF original guardado na importação. */
export const urlPdfImportacao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ funcionarioId: z.string().uuid(), importacaoId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { carregarPerfil } = await import("@/lib/programacao.server");
    const { BUCKET_PDF, carregarImportacao } = await import("@/lib/importacoes.server");
    await carregarPerfil(data.funcionarioId);
    const importacao = await carregarImportacao(data.importacaoId);
    if (!importacao.caminho_arquivo) return { url: null as string | null };
    const { data: assinado, error } = await supabaseAdmin.storage
      .from(BUCKET_PDF)
      .createSignedUrl(importacao.caminho_arquivo, 60 * 30);
    if (error) throw new Error(error.message);
    return { url: assinado?.signedUrl ?? null };
  });

/** Reabertura para edição: cria uma nova versão e preserva a anterior. */
export const duplicarImportacao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ funcionarioId: z.string().uuid(), importacaoId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { carregarPerfil } = await import("@/lib/programacao.server");
    const { carregarImportacao, recalcularTotais, COLUNAS_REGISTRO_IMPORTACAO } = await import(
      "@/lib/importacoes.server"
    );

    const perfil = await carregarPerfil(data.funcionarioId);
    const original = await carregarImportacao(data.importacaoId);

    const { data: nova, error } = await supabaseAdmin
      .from("importacoes_pdf")
      .insert({
        nome_arquivo: original.nome_arquivo,
        hash_arquivo: original.hash_arquivo,
        caminho_arquivo: original.caminho_arquivo,
        periodo_inicio: original.periodo_inicio,
        periodo_fim: original.periodo_fim,
        tipo_periodo: original.tipo_periodo,
        total_paginas: original.total_paginas,
        status: "em_conferencia",
        usuario_nome: perfil.nome,
        usuario_id: perfil.id,
        regional_origem_id: perfil.regional_id,
        versao: (original.versao ?? 1) + 1,
        importacao_anterior_id: original.id,
        arquivo_id: original.arquivo_id,
      })
      .select("id, versao")
      .single();
    if (error) throw new Error(error.message);

    const { data: registros } = await supabaseAdmin
      .from("importacao_registros")
      .select(COLUNAS_REGISTRO_IMPORTACAO)
      .eq("importacao_id", original.id);

    const copias = (registros ?? []).map((r) => ({
      importacao_id: nova.id,
      regional_id: r.regional_id,
      regional_codigo: r.regional_codigo,
      regional_confirmada: r.regional_confirmada,
      regional_origem: r.regional_origem,
      pagina_pdf: r.pagina_pdf,
      texto_original: r.texto_original,
      valores_extraidos: r.valores_extraidos,
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
      chave_duplicidade: r.chave_duplicidade,
      duplicado: r.duplicado,
      status_validacao: r.status_validacao === "confirmado" ? "valido" : r.status_validacao,
      motivos: r.motivos,
      campos_corrigidos: r.campos_corrigidos,
      foi_corrigido: r.foi_corrigido,
    }));
    for (let i = 0; i < copias.length; i += 400) {
      const { error: erroCopia } = await supabaseAdmin
        .from("importacao_registros")
        .insert(copias.slice(i, i + 400) as never);
      if (erroCopia) throw new Error(erroCopia.message);
    }
    await recalcularTotais(nova.id);

    // Avisa se existem rotas salvas apoiadas na importação que está sendo editada.
    const { count } = await supabaseAdmin
      .from("rotas")
      .select("id", { count: "exact", head: true })
      .eq("importacao_id", original.id);

    return { importacaoId: nova.id, versao: nova.versao, rotasAfetadas: count ?? 0 };
  });

/** Dias com programação confirmada na regional do aparelho, com indicadores. */
export const diasDaProgramacao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ funcionarioId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { carregarPerfil } = await import("@/lib/programacao.server");
    const { montarDias } = await import("@/lib/dias.server");
    const perfil = await carregarPerfil(data.funcionarioId);

    const { data: registros, error } = await supabaseAdmin
      .from("programacoes")
      .select(
        "id, rodovia, km_inicial, km_final, data_inicial, data_final, status, latitude_inicial, longitude_inicial",
      )
      .eq("regional_id", perfil.regional_id)
      .eq("regional_confirmada", true)
      .limit(5000);
    if (error) throw new Error(error.message);

    return { perfil, dias: montarDias(registros ?? []) };
  });
