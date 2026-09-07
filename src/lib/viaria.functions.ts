import { createServerFn } from "@tanstack/react-start";

export const resumoBaseViariaBauru = createServerFn({ method: "GET" }).handler(async () => {
  const { obterEscopoPilotoBauru } = await import("@/lib/viaria/bauru.server");
  return obterEscopoPilotoBauru();
});
