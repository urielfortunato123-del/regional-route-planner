import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { MapPinned } from "lucide-react";

import { Botao, Campo, Cartao, estiloEntrada } from "@/components/AppShell";
import { listarRegionais, salvarPerfil } from "@/lib/programacao.functions";
import type { PerfilLocal } from "@/lib/perfil-local";

export function Identificacao({
  perfilAtual,
  aoConcluir,
}: {
  perfilAtual?: PerfilLocal | null;
  aoConcluir: (perfil: PerfilLocal) => void;
}) {
  const [nome, setNome] = useState(perfilAtual?.nome ?? "");
  const [matricula, setMatricula] = useState(perfilAtual?.matricula ?? "");
  const [cargo, setCargo] = useState(perfilAtual?.cargo ?? "");
  const [equipe, setEquipe] = useState(perfilAtual?.equipe ?? "");
  const [regional, setRegional] = useState(perfilAtual?.regional_codigo ?? "");
  const [role, setRole] = useState<PerfilLocal["role"]>(perfilAtual?.role ?? "funcionario");

  const regionais = useQuery({
    queryKey: ["regionais"],
    queryFn: () => listarRegionais(),
  });

  const entrar = useMutation({
    mutationFn: () =>
      salvarPerfil({
        data: {
          ...(perfilAtual?.id ? { id: perfilAtual.id } : {}),
          nome: nome.trim(),
          matricula: matricula || null,
          cargo: cargo || null,
          equipe: equipe || null,
          regional_codigo: regional,
          role,
        },
      }),
    onSuccess: (perfil) => {
      toast.success(`Bem-vindo, ${perfil.nome.split(" ")[0]}!`);
      aoConcluir(perfil as PerfilLocal);
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  const podeEntrar = nome.trim().length >= 2 && regional.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="faixa-rodoviaria h-1.5 w-full" />
      <div className="mx-auto max-w-md px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground">
            <MapPinned className="size-6" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-semibold leading-tight">
              Programação Regional
            </h1>
            <p className="text-sm text-muted-foreground">
              Identifique-se para ver a programação da sua regional.
            </p>
          </div>
        </div>

        <Cartao className="space-y-4">
          <Campo rotulo="Nome do funcionário *">
            <input
              className={estiloEntrada}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome completo"
              autoComplete="name"
            />
          </Campo>

          <Campo rotulo="Regional *">
            <select
              className={estiloEntrada}
              value={regional}
              onChange={(e) => setRegional(e.target.value)}
            >
              <option value="">Selecionar regional</option>
              {(regionais.data ?? []).map((r) => (
                <option key={r.codigo} value={r.codigo}>
                  {r.rotulo}
                </option>
              ))}
            </select>
          </Campo>

          <details className="rounded-lg border border-border bg-surface p-3">
            <summary className="cursor-pointer text-sm font-semibold text-foreground">
              Dados complementares (opcional)
            </summary>
            <div className="mt-3 space-y-3">
              <Campo rotulo="Matrícula">
                <input
                  className={estiloEntrada}
                  value={matricula}
                  onChange={(e) => setMatricula(e.target.value)}
                  placeholder="Matrícula ou identificação"
                />
              </Campo>
              <Campo rotulo="Cargo">
                <input
                  className={estiloEntrada}
                  value={cargo}
                  onChange={(e) => setCargo(e.target.value)}
                  placeholder="Ex.: Fiscal de conservação"
                />
              </Campo>
              <Campo rotulo="Equipe">
                <input
                  className={estiloEntrada}
                  value={equipe}
                  onChange={(e) => setEquipe(e.target.value)}
                  placeholder="Ex.: Equipe 2"
                />
              </Campo>
              <Campo
                rotulo="Perfil de acesso"
                dica="Gestor e administrador podem importar PDF e corrigir dados."
              >
                <select
                  className={estiloEntrada}
                  value={role}
                  onChange={(e) => setRole(e.target.value as PerfilLocal["role"])}
                >
                  <option value="funcionario">Funcionário</option>
                  <option value="gestor">Gestor regional</option>
                  <option value="admin">Administrador</option>
                </select>
              </Campo>
            </div>
          </details>

          <Botao
            className="w-full"
            disabled={!podeEntrar || entrar.isPending}
            onClick={() => entrar.mutate()}
          >
            {entrar.isPending ? "Entrando..." : "Entrar no aplicativo"}
          </Botao>

          <p className="text-center text-xs text-muted-foreground">
            Sem cadastro, sem senha. Seus dados ficam salvos neste aparelho.
          </p>
        </Cartao>
      </div>
    </div>
  );
}
