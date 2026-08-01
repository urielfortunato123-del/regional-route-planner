import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange, ClipboardList, Map, Route as RouteIcon, Upload } from "lucide-react";

import { AppShell, Botao, Cartao } from "@/components/AppShell";
import { Identificacao } from "@/components/Identificacao";
import { usePerfilLocal } from "@/lib/perfil-local";
import { resumoDoDia } from "@/lib/programacao.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Início | Programação e Roteirização Regional" },
      {
        name: "description",
        content:
          "Resumo diário dos serviços programados na sua regional, com atalhos para programação, rota e mapa.",
      },
      { property: "og:title", content: "Programação e Roteirização Regional" },
      {
        property: "og:description",
        content: "Serviços do dia filtrados pela regional do funcionário.",
      },
    ],
  }),
  component: Inicio,
});

function Inicio() {
  const { perfil, carregado, salvar } = usePerfilLocal();

  const resumo = useQuery({
    queryKey: ["resumo", perfil?.id],
    queryFn: () => resumoDoDia({ data: { funcionarioId: perfil!.id } }),
    enabled: !!perfil?.id,
  });

  if (!carregado) return <div className="min-h-screen bg-background" />;
  if (!perfil) return <Identificacao aoConcluir={salvar} />;

  const total = resumo.data?.total ?? 0;
  const pendentes = resumo.data?.pendentes ?? 0;
  const concluidos = resumo.data?.concluidos ?? 0;

  return (
    <AppShell perfil={perfil} titulo={`Olá, ${perfil.nome.split(" ")[0]}`}>
      <div className="space-y-4">
        <Cartao>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Programação de hoje
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-surface p-3">
              <p className="font-display text-3xl font-semibold">{total}</p>
              <p className="text-xs text-muted-foreground">Serviços</p>
            </div>
            <div className="rounded-lg bg-warning/15 p-3">
              <p className="font-display text-3xl font-semibold text-warning-foreground">
                {pendentes}
              </p>
              <p className="text-xs text-muted-foreground">Pendentes</p>
            </div>
            <div className="rounded-lg bg-success/15 p-3">
              <p className="font-display text-3xl font-semibold text-success">{concluidos}</p>
              <p className="text-xs text-muted-foreground">Concluídos</p>
            </div>
          </div>
          {resumo.isLoading ? (
            <p className="mt-3 text-xs text-muted-foreground">Carregando resumo...</p>
          ) : null}
        </Cartao>

        <div className="grid gap-3 sm:grid-cols-2">
          <Link to="/programacao">
            <Botao className="w-full justify-start" variante="primario">
              <CalendarRange className="size-5" /> Ver programação
            </Botao>
          </Link>
          <Link to="/programacao" >
            <Botao className="w-full justify-start" variante="contorno">
              <ClipboardList className="size-5" /> Serviços pendentes
            </Botao>
          </Link>
          <Botao
            className="w-full justify-start"
            variante="contorno"
            disabled
            title="Disponível na próxima etapa"
          >
            <RouteIcon className="size-5" /> Gerar rota sugerida
          </Botao>
          <Botao
            className="w-full justify-start"
            variante="contorno"
            disabled
            title="Disponível na próxima etapa"
          >
            <Map className="size-5" /> Abrir mapa
          </Botao>
          {perfil.role !== "funcionario" ? (
            <Link to="/programacao/importar" className="sm:col-span-2">
              <Botao className="w-full justify-start" variante="destaque">
                <Upload className="size-5" /> Importar programação em PDF
              </Botao>
            </Link>
          ) : null}
        </div>

        <Cartao className="bg-surface">
          <p className="text-sm text-muted-foreground">
            Mapa da regional, marcos quilométricos e roteirização (OpenStreetMap + OSRM) entram na
            próxima etapa, sobre esta mesma base de dados já filtrada por regional.
          </p>
        </Cartao>
      </div>
    </AppShell>
  );
}
