import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const derStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { pingDer } = await import("@/lib/der/der.server");
  return pingDer();
});

export const derBuscarRodovias = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ termo: z.string().min(2).max(30) }).parse(d))
  .handler(async ({ data }) => {
    const { buscarRodovias } = await import("@/lib/der/der.server");
    return buscarRodovias(data.termo);
  });

export const derMarcos = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ codigo: z.string().min(2).max(30) }).parse(d))
  .handler(async ({ data }) => {
    const { marcosDaRodovia } = await import("@/lib/der/der.server");
    return { codigo: data.codigo, marcos: await marcosDaRodovia(data.codigo), obtidoEm: Date.now() };
  });

export const derGeometria = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ codigo: z.string().min(2).max(30) }).parse(d))
  .handler(async ({ data }) => {
    const { geometriaDaRodovia } = await import("@/lib/der/der.server");
    return { codigo: data.codigo, linhas: await geometriaDaRodovia(data.codigo), obtidoEm: Date.now() };
  });

export const derRodoviasProximas = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        lat: z.number().min(-35).max(5),
        lon: z.number().min(-75).max(-30),
        raioMetros: z.number().min(50).max(20000).default(400),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { rodoviasProximas } = await import("@/lib/der/der.server");
    return rodoviasProximas({ lat: data.lat, lon: data.lon }, data.raioMetros);
  });

export const derMunicipio = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ lat: z.number(), lon: z.number() }).parse(d))
  .handler(async ({ data }) => {
    const { municipioDoPonto } = await import("@/lib/der/der.server");
    return { municipio: await municipioDoPonto({ lat: data.lat, lon: data.lon }) };
  });

export const derCamadas = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        sul: z.number().min(-35).max(5),
        norte: z.number().min(-35).max(5),
        oeste: z.number().min(-75).max(-30),
        leste: z.number().min(-75).max(-30),
        regional: z.number().int().min(1).max(20).nullable().optional(),
        marcos: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { camadasNaArea } = await import("@/lib/der/der.server");
    return camadasNaArea({
      bbox: { sul: data.sul, norte: data.norte, oeste: data.oeste, leste: data.leste },
      regional: data.regional ?? null,
      marcos: data.marcos,
    });
  });

export const derLimiteRegional = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ regional: z.number().int().min(1).max(20) }).parse(d))
  .handler(async ({ data }) => {
    const { limiteRegional } = await import("@/lib/der/der.server");
    return { limite: await limiteRegional(data.regional), obtidoEm: Date.now() };
  });
