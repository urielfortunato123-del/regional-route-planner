import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const foto = z.string().max(900_000);

const inspecaoSchema = z.object({
  funcionarioId: z.string().uuid(),
  programacaoId: z.string().uuid().nullable().optional(),
  equipe: z.string().max(120).nullable().optional(),
  contrato: z.string().max(120).nullable().optional(),
  atividade: z.string().max(240).nullable().optional(),
  rodovia: z.string().max(60).nullable().optional(),
  kmInicial: z.number().nullable().optional(),
  kmFinal: z.number().nullable().optional(),
  condicao: z.string().max(60).nullable().optional(),
  servicoExecutado: z.string().max(500).nullable().optional(),
  naoConformidade: z.string().max(500).nullable().optional(),
  observacao: z.string().max(1000).nullable().optional(),
  situacao: z.string().max(30).nullable().optional(),
  fotos: z.array(foto).max(6).optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
});

const ocorrenciaSchema = z.object({
  funcionarioId: z.string().uuid(),
  programacaoId: z.string().uuid().nullable().optional(),
  equipe: z.string().max(120).nullable().optional(),
  contrato: z.string().max(120).nullable().optional(),
  tipo: z.string().min(2).max(60),
  rodovia: z.string().max(60).nullable().optional(),
  km: z.number().nullable().optional(),
  kmFinal: z.number().nullable().optional(),
  sentido: z.string().max(30).nullable().optional(),
  faixa: z.string().max(30).nullable().optional(),
  prioridade: z.enum(["baixa", "media", "alta", "emergencial"]).optional(),
  risco: z.string().max(120).nullable().optional(),
  descricao: z.string().min(3).max(1000),
  necessitaAtendimento: z.boolean().optional(),
  prazo: z.string().max(10).nullable().optional(),
  observacao: z.string().max(1000).nullable().optional(),
  fotos: z.array(foto).max(6).optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
});

export const criarInspecao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inspecaoSchema.parse(d))
  .handler(async ({ data }) => {
    const { criarInspecaoDb } = await import("@/lib/campo.server");
    const { funcionarioId, ...dados } = data;
    return { inspecao: await criarInspecaoDb(funcionarioId, dados) };
  });

export const listarInspecoes = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        programacaoId: z.string().uuid().nullable().optional(),
        dia: z.string().max(10).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { listarInspecoesDb } = await import("@/lib/campo.server");
    return listarInspecoesDb(data.funcionarioId, {
      programacaoId: data.programacaoId ?? null,
      dia: data.dia ?? null,
    });
  });

export const atualizarInspecao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        id: z.string().uuid(),
        situacao: z.enum(["registrada", "em_andamento", "concluida"]).optional(),
        observacao: z.string().max(1000).nullable().optional(),
        naoConformidade: z.string().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { atualizarInspecaoDb } = await import("@/lib/campo.server");
    const { funcionarioId, id, ...campos } = data;
    return { inspecao: await atualizarInspecaoDb(funcionarioId, id, campos) };
  });

export const criarOcorrencia = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ocorrenciaSchema.parse(d))
  .handler(async ({ data }) => {
    const { criarOcorrenciaDb } = await import("@/lib/campo.server");
    const { funcionarioId, ...dados } = data;
    return { ocorrencia: await criarOcorrenciaDb(funcionarioId, dados) };
  });

export const listarOcorrencias = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        programacaoId: z.string().uuid().nullable().optional(),
        dia: z.string().max(10).nullable().optional(),
        situacao: z.string().max(20).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { listarOcorrenciasDb } = await import("@/lib/campo.server");
    return listarOcorrenciasDb(data.funcionarioId, {
      programacaoId: data.programacaoId ?? null,
      dia: data.dia ?? null,
      situacao: data.situacao ?? null,
    });
  });

export const atualizarOcorrencia = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        id: z.string().uuid(),
        situacao: z.enum(["aberta", "em_atendimento", "resolvida", "cancelada"]).optional(),
        prioridade: z.enum(["baixa", "media", "alta", "emergencial"]).optional(),
        observacao: z.string().max(1000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { atualizarOcorrenciaDb } = await import("@/lib/campo.server");
    const { funcionarioId, id, ...campos } = data;
    return { ocorrencia: await atualizarOcorrenciaDb(funcionarioId, id, campos) };
  });
