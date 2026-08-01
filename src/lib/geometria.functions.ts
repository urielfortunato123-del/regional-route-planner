import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { STATUS_GEOMETRIA } from "@/lib/geometria/status";

export const listarPendentesGeometria = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        importacaoId: z.string().uuid().nullable().optional(),
        limite: z.number().int().min(1).max(300).default(120),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { buscarPendentes } = await import("@/lib/geometria.server");
    return buscarPendentes(data.funcionarioId, data.importacaoId ?? null, data.limite);
  });

export const salvarGeometrias = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        itens: z
          .array(
            z.object({
              id: z.string().uuid(),
              status: z.enum(STATUS_GEOMETRIA),
              latitude_inicial: z.number().nullable().optional(),
              longitude_inicial: z.number().nullable().optional(),
              latitude_final: z.number().nullable().optional(),
              longitude_final: z.number().nullable().optional(),
              geometria: z.unknown().optional(),
              fonte: z.string().max(200).nullable().optional(),
              precisao: z.string().max(40).nullable().optional(),
              erro: z.string().max(300).nullable().optional(),
              confirmada: z.boolean().optional(),
            }),
          )
          .min(1)
          .max(200),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { gravarGeometrias } = await import("@/lib/geometria.server");
    return gravarGeometrias(data.funcionarioId, data.itens);
  });
