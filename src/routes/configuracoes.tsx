import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery } from "@tanstack/react-query";

import { AppShell, Botao, Campo, Cartao, estiloEntrada } from "@/components/AppShell";
import { Identificacao } from "@/components/Identificacao";
import { usePerfilLocal } from "@/lib/perfil-local";
import { listarRegionais, salvarPerfil } from "@/lib/programacao.functions";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({
    meta: [
      { title: "Ajustes do perfil | Roteirização Regional" },
      {
        name: "description",
        content:
          "Altere nome, matrícula, equipe e regional do funcionário. Os dados ficam salvos no próprio dispositivo.",
      },
      { property: "og:title", content: "Ajustes do perfil" },
      {
        property: "og:description",
        content: "Identificação salva no dispositivo, sem login e sem senha.",
      },
    ],
  }),
  component: Configuracoes,
});

function Configuracoes() {
  const { perfil, carregado, salvar, limpar } = usePerfilLocal();
  const [nome, setNome] = useState("");
  const [matricula, setMatricula] = useState("");
  const [equipe, setEquipe] = useState("");
  const [regional, setRegional] = useState("");
  const [iniciado, setIniciado] = useState(false);

  const regionais = useQuery({ queryKey: ["regionais"], queryFn: () => listarRegionais() });

  const atualizar = useMutation({
    mutationFn: () =>
      salvarPerfil({
        data: {
          id: perfil!.id,
          nome,
          matricula: matricula || null,
          equipe: equipe || null,
          regional_codigo: regional,
          role: perfil!.role,
        },
      }),
    onSuccess: (p) => {
      salvar(p);
      toast.success("Dados atualizados neste dispositivo.");
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  if (!carregado) return <div className="min-h-screen bg-background" />;
  if (!perfil) return <Identificacao aoConcluir={salvar} />;

  if (!iniciado) {
    setIniciado(true);
    setNome(perfil.nome);
    setMatricula(perfil.matricula ?? "");
    setEquipe(perfil.equipe ?? "");
    setRegional(perfil.regional_codigo);
  }

  return (
    <AppShell perfil={perfil} titulo="Ajustes">
      <div className="space-y-4">
        <Cartao className="space-y-3">
          <Campo rotulo="Nome do funcionário">
            <input className={estiloEntrada} value={nome} onChange={(e) => setNome(e.target.value)} />
          </Campo>
          <Campo rotulo="Matrícula">
            <input className={estiloEntrada} value={matricula} onChange={(e) => setMatricula(e.target.value)} />
          </Campo>
          <Campo rotulo="Equipe">
            <input className={estiloEntrada} value={equipe} onChange={(e) => setEquipe(e.target.value)} />
          </Campo>
          <Campo rotulo="Regional">
            <select className={estiloEntrada} value={regional} onChange={(e) => setRegional(e.target.value)}>
              {(regionais.data ?? []).map((r) => (
                <option key={r.codigo} value={r.codigo}>
                  {r.rotulo}
                </option>
              ))}
            </select>
          </Campo>
          <Botao
            className="w-full"
            disabled={atualizar.isPending || !nome.trim() || !regional}
            onClick={() => atualizar.mutate()}
          >
            {atualizar.isPending ? "Salvando..." : "Salvar alterações"}
          </Botao>
        </Cartao>

        <Cartao className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Nível de acesso atual: <strong className="text-foreground">{perfil.role}</strong>. A
            alteração de nível é feita pelo administrador.
          </p>
          <Botao
            variante="perigo"
            className="w-full"
            onClick={() => {
              limpar();
              toast.success("Identificação removida deste dispositivo.");
            }}
          >
            Trocar de funcionário neste dispositivo
          </Botao>
        </Cartao>
      </div>
    </AppShell>
  );
}
