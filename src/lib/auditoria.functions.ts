import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const auditarImportacao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        importacaoId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { auditar } = await import("@/lib/auditoria.server");
    return auditar(data.funcionarioId, data.importacaoId ?? null);
  });

export const registrarValidacaoPipeline = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        importacaoId: z.string().uuid(),
        resultado: z.unknown(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { registrarValidacao } = await import("@/lib/auditoria.server");
    return registrarValidacao(data.funcionarioId, data.importacaoId, data.resultado);
  });
