import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { INTERVALOS_MS } from "./lib/servidor";

export const getRouter = () => {
  // Cold start do plano gratuito: as consultas insistem em 3, 5, 10 e 15 s
  // antes de considerar falha, para o app não mostrar erro na primeira abertura.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: INTERVALOS_MS.length,
        retryDelay: (tentativa) => INTERVALOS_MS[tentativa] ?? 15_000,
        staleTime: 30_000,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
