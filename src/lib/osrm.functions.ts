import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Distância e tempo pela malha viária (OSRM público, livre e gratuito).
 * `otimizar` reordena as paradas pelo menor percurso rodoviário real,
 * mantendo o ponto de partida como primeira posição.
 * Quando o serviço não responde, devolve `disponivel: false` e o aplicativo
 * usa o cálculo aproximado por proximidade, avisando na tela.
 */
export const calcularPercurso = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        pontos: z
          .array(z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }))
          .min(2)
          .max(60),
        otimizar: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { consultarOsrm } = await import("@/lib/osrm.server");
    return consultarOsrm(data.pontos, data.otimizar);
  });
