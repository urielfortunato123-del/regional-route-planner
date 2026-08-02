import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { STATUS_ETAPA } from "@/lib/pipeline/etapas";

const etapaSchema = z.object({
  etapa: z.string().max(60),
  ordem: z.number().int(),
  critica: z.boolean(),
  status: z.enum(STATUS_ETAPA),
  esperado: z.number().int(),
  encontrado: z.number().int(),
  divergencia: z.number().int(),
  registros: z.array(z.string()).max(500).default([]),
  motivo: z.string().max(500).nullable().default(null),
});

export const lerChecklistPipeline = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        importacaoId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { lerChecklist } = await import("@/lib/pipeline.server");
    return lerChecklist(data.funcionarioId, data.importacaoId ?? null);
  });

export const gravarChecklistPipeline = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        importacaoId: z.string().uuid().nullable().optional(),
        programacaoVersao: z.number().int().min(1).default(1),
        etapas: z.array(etapaSchema).min(1).max(30),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { gravarChecklist } = await import("@/lib/pipeline.server");
    return gravarChecklist(
      data.funcionarioId,
      data.importacaoId ?? null,
      data.etapas as never,
      data.programacaoVersao,
    );
  });

export const dadosChecklistPipeline = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        importacaoId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { dadosChecklist } = await import("@/lib/pipeline.server");
    return dadosChecklist(data.funcionarioId, data.importacaoId ?? null);
  });

export const fotografarServicosImportacao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        importacaoId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { fotografarServicos } = await import("@/lib/pipeline.server");
    return fotografarServicos(data.funcionarioId, data.importacaoId ?? null);
  });

export const salvarSimulacaoDer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        importacaoId: z.string().uuid().nullable().optional(),
        tipoFalha: z.string().max(60),
        iniciadoEm: z.string(),
        concluidoEm: z.string(),
        totalAntes: z.number().int(),
        totalDepois: z.number().int(),
        jaLocalizados: z.number().int(),
        localizadosFallback: z.number().int(),
        aguardando: z.number().int(),
        comErro: z.number().int(),
        removidos: z.number().int(),
        duplicados: z.number().int(),
        resultado: z.enum(["aprovado", "aprovado_com_avisos", "reprovado"]),
        observacoes: z.string().max(1000),
        detalhes: z.unknown().optional(),
        programacaoVersao: z.number().int().min(1).default(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { registrarSimulacao } = await import("@/lib/pipeline.server");
    const { funcionarioId, importacaoId, ...resto } = data;
    return registrarSimulacao(funcionarioId, {
      ...resto,
      detalhes: resto.detalhes ?? {},
      importacaoId: importacaoId ?? null,
    });
  });

export const listarSimulacoesDer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        importacaoId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { listarSimulacoes } = await import("@/lib/pipeline.server");
    return listarSimulacoes(data.funcionarioId, data.importacaoId ?? null);
  });

export const registrarLogAuditoria = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        importacaoId: z.string().uuid().nullable().optional(),
        acao: z.string().max(80),
        detalhe: z.string().max(500),
        dados: z.unknown().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { registrarLog } = await import("@/lib/pipeline.server");
    return registrarLog(data.funcionarioId, {
      importacaoId: data.importacaoId ?? null,
      acao: data.acao,
      detalhe: data.detalhe,
      dados: data.dados,
    });
  });

export const listarLogAuditoria = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        importacaoId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { listarLog } = await import("@/lib/pipeline.server");
    return listarLog(data.funcionarioId, data.importacaoId ?? null);
  });
