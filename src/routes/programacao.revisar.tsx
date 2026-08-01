import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Pencil, Trash2 } from "lucide-react";

import { AppShell, Botao, Campo, Cartao, Etiqueta, estiloEntrada } from "@/components/AppShell";
import { Identificacao } from "@/components/Identificacao";
import { usePerfilLocal } from "@/lib/perfil-local";
import {
  corrigirRegistro,
  excluirRegistro,
  listarParaRevisao,
  listarRegionais,
} from "@/lib/programacao.functions";
import { enfileirar } from "@/lib/offline/sync";
import { normalizarKm } from "@/services/derMapService";

export const Route = createFileRoute("/programacao/revisar")({
  head: () => ({
    meta: [
      { title: "Revisar dados da programação | Roteirização Regional" },
      {
        name: "description",
        content:
          "Confira, corrija ou exclua os serviços lidos do PDF antes de gerar rotas: regional, rodovia, km, datas e observações.",
      },
      { property: "og:title", content: "Revisar dados da programação" },
      {
        property: "og:description",
        content: "Correção manual dos serviços importados, sempre dentro da regional selecionada.",
      },
    ],
  }),
  component: RevisarPagina,
});

type Registro = Record<string, string | number | boolean | null>;

const CAMPOS_TEXTO = [
  ["rodovia", "Rodovia"],
  ["atividade", "Atividade"],
  ["equipe", "Equipe"],
  ["funcionario", "Funcionário"],
  ["contrato", "Contrato"],
] as const;

function textoCampo(r: Registro, chave: string) {
  const v = r[chave];
  return v == null ? "" : String(v);
}

function RevisarPagina() {
  const { perfil, carregado, salvar } = usePerfilLocal();
  const cliente = useQueryClient();
  const [somentePendentes, setSomentePendentes] = useState(false);
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});

  const regionais = useQuery({ queryKey: ["regionais"], queryFn: () => listarRegionais() });

  const consulta = useQuery({
    queryKey: ["revisao", perfil?.id, somentePendentes],
    enabled: !!perfil?.id,
    queryFn: () => listarParaRevisao({ data: { funcionarioId: perfil!.id, somentePendentes } }),
  });

  const salvarCampos = useMutation({
    mutationFn: async (v: { id: string; campos: Record<string, unknown> }) => {
      const payload = { funcionarioId: perfil!.id, id: v.id, campos: v.campos };
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await enfileirar({
          regional_codigo: perfil!.regional_codigo,
          tipo: "correcao",
          payload,
          descricao: "Correção de serviço",
        });
        return { offline: true } as const;
      }
      await corrigirRegistro({ data: payload as never });
      return { offline: false } as const;
    },
    onSuccess: (r) => {
      toast.success(r.offline ? "Correção salva no aparelho — envio quando houver conexão." : "Dados atualizados.");
      setEditando(null);
      cliente.invalidateQueries({ queryKey: ["revisao"] });
      cliente.invalidateQueries({ queryKey: ["programacoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const payload = { funcionarioId: perfil!.id, id };
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await enfileirar({
          regional_codigo: perfil!.regional_codigo,
          tipo: "exclusao",
          payload,
          descricao: "Exclusão de serviço",
        });
        return;
      }
      await excluirRegistro({ data: payload });
    },
    onSuccess: () => {
      toast.success("Serviço excluído.");
      cliente.invalidateQueries({ queryKey: ["revisao"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const registros = (consulta.data?.registros ?? []) as unknown as Registro[];
  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return registros;
    return registros.filter((r) =>
      ["rodovia", "atividade", "descricao", "equipe", "contrato", "funcionario"].some((c) =>
        textoCampo(r, c).toLowerCase().includes(termo),
      ),
    );
  }, [registros, busca]);

  if (!carregado) return <div className="min-h-screen bg-background" />;
  if (!perfil) return <Identificacao aoConcluir={salvar} />;

  function abrirEdicao(r: Registro) {
    setEditando(String(r["id"]));
    setRascunho({
      regional_codigo: textoCampo(r, "regional_codigo") || perfil!.regional_codigo,
      rodovia: textoCampo(r, "rodovia"),
      km_inicial: textoCampo(r, "km_inicial"),
      km_final: textoCampo(r, "km_final"),
      atividade: textoCampo(r, "atividade"),
      equipe: textoCampo(r, "equipe"),
      funcionario: textoCampo(r, "funcionario"),
      contrato: textoCampo(r, "contrato"),
      descricao: textoCampo(r, "descricao"),
      data_inicial: textoCampo(r, "data_inicial"),
      data_final: textoCampo(r, "data_final"),
      observacao: textoCampo(r, "observacao"),
    });
  }

  function gravar(id: string) {
    const campos: Record<string, unknown> = {
      regional_codigo: rascunho["regional_codigo"] || null,
      rodovia: rascunho["rodovia"] || null,
      km_inicial: normalizarKm(rascunho["km_inicial"] ?? ""),
      km_final: normalizarKm(rascunho["km_final"] ?? ""),
      atividade: rascunho["atividade"] || null,
      equipe: rascunho["equipe"] || null,
      funcionario: rascunho["funcionario"] || null,
      contrato: rascunho["contrato"] || null,
      descricao: rascunho["descricao"] || null,
      data_inicial: rascunho["data_inicial"] || null,
      data_final: rascunho["data_final"] || null,
      observacao: rascunho["observacao"] || null,
    };
    salvarCampos.mutate({ id, campos });
  }

  return (
    <AppShell perfil={perfil} titulo="Revisar programação">
      <div className="space-y-4">
        <Cartao className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Confira o que foi lido do PDF antes de montar rotas. Você vê apenas os serviços da{" "}
            <strong className="text-foreground">{perfil.regional_rotulo}</strong> e as linhas que o
            leitor não conseguiu classificar.
          </p>
          <div className="flex flex-wrap gap-2 text-sm">
            <Etiqueta tom="ok">{consulta.data?.totalRegional ?? 0} da minha regional</Etiqueta>
            <Etiqueta tom={consulta.data?.totalPendentes ? "alerta" : "neutro"}>
              {consulta.data?.totalPendentes ?? 0} sem regional
            </Etiqueta>
          </div>
          <input
            className={estiloEntrada}
            placeholder="Buscar rodovia, atividade, descrição..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-primary)]"
              checked={somentePendentes}
              onChange={(e) => setSomentePendentes(e.target.checked)}
            />
            Mostrar apenas linhas que precisam de conferência
          </label>
        </Cartao>

        {consulta.isFetching ? (
          <Cartao className="text-sm text-muted-foreground">Carregando...</Cartao>
        ) : null}

        {!consulta.isFetching && filtrados.length === 0 ? (
          <Cartao className="text-center text-sm text-muted-foreground">
            Nada para revisar. Importe uma programação em PDF para começar.
          </Cartao>
        ) : null}

        {filtrados.map((r) => {
          const id = String(r["id"]);
          const pendente = !r["regional_id"] || !r["regional_confirmada"];
          const emEdicao = editando === id;
          return (
            <Cartao key={id} className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-lg font-semibold">
                  {textoCampo(r, "rodovia") || "Rodovia não informada"}
                </span>
                <span className="text-sm text-muted-foreground">
                  km {textoCampo(r, "km_inicial") || "?"}
                  {textoCampo(r, "km_final") ? ` a ${textoCampo(r, "km_final")}` : ""}
                </span>
                {pendente ? (
                  <Etiqueta tom="alerta">
                    <AlertTriangle className="mr-1 size-3" /> Sem regional
                  </Etiqueta>
                ) : (
                  <Etiqueta tom="ok">{textoCampo(r, "regional_codigo").replace(/_/g, ".")}</Etiqueta>
                )}
              </div>

              {!emEdicao ? (
                <>
                  <p className="text-sm text-foreground">{textoCampo(r, "descricao") || "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {textoCampo(r, "atividade")} · {textoCampo(r, "equipe")} ·{" "}
                    {textoCampo(r, "data_inicial")}
                    {textoCampo(r, "data_final") ? ` a ${textoCampo(r, "data_final")}` : ""}
                    {textoCampo(r, "pagina_pdf") ? ` · pág. ${textoCampo(r, "pagina_pdf")}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Botao variante="contorno" onClick={() => abrirEdicao(r)}>
                      <Pencil className="size-4" /> Corrigir
                    </Botao>
                    {pendente ? (
                      <Botao
                        variante="destaque"
                        disabled={salvarCampos.isPending}
                        onClick={() =>
                          salvarCampos.mutate({
                            id,
                            campos: { regional_codigo: perfil.regional_codigo },
                          })
                        }
                      >
                        <Check className="size-4" /> Confirmar na {perfil.regional_codigo.replace(/_/g, ".")}
                      </Botao>
                    ) : null}
                    <Botao
                      variante="perigo"
                      disabled={remover.isPending}
                      onClick={() => {
                        if (window.confirm("Excluir este serviço da programação?")) remover.mutate(id);
                      }}
                    >
                      <Trash2 className="size-4" /> Excluir
                    </Botao>
                  </div>
                </>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo rotulo="Regional">
                    <select
                      className={estiloEntrada}
                      value={rascunho["regional_codigo"] ?? ""}
                      onChange={(e) =>
                        setRascunho((v) => ({ ...v, regional_codigo: e.target.value }))
                      }
                    >
                      {(regionais.data ?? []).map((reg) => (
                        <option key={reg.codigo} value={reg.codigo}>
                          {reg.rotulo}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  {CAMPOS_TEXTO.map(([chave, rotulo]) => (
                    <Campo key={chave} rotulo={rotulo}>
                      <input
                        className={estiloEntrada}
                        value={rascunho[chave] ?? ""}
                        onChange={(e) => setRascunho((v) => ({ ...v, [chave]: e.target.value }))}
                      />
                    </Campo>
                  ))}
                  <Campo rotulo="Km inicial">
                    <input
                      className={estiloEntrada}
                      inputMode="decimal"
                      value={rascunho["km_inicial"] ?? ""}
                      onChange={(e) => setRascunho((v) => ({ ...v, km_inicial: e.target.value }))}
                    />
                  </Campo>
                  <Campo rotulo="Km final">
                    <input
                      className={estiloEntrada}
                      inputMode="decimal"
                      value={rascunho["km_final"] ?? ""}
                      onChange={(e) => setRascunho((v) => ({ ...v, km_final: e.target.value }))}
                    />
                  </Campo>
                  <Campo rotulo="Data inicial">
                    <input
                      type="date"
                      className={estiloEntrada}
                      value={rascunho["data_inicial"] ?? ""}
                      onChange={(e) => setRascunho((v) => ({ ...v, data_inicial: e.target.value }))}
                    />
                  </Campo>
                  <Campo rotulo="Data final">
                    <input
                      type="date"
                      className={estiloEntrada}
                      value={rascunho["data_final"] ?? ""}
                      onChange={(e) => setRascunho((v) => ({ ...v, data_final: e.target.value }))}
                    />
                  </Campo>
                  <div className="sm:col-span-2">
                    <Campo rotulo="Descrição do serviço">
                      <textarea
                        className={`${estiloEntrada} min-h-20 py-2`}
                        value={rascunho["descricao"] ?? ""}
                        onChange={(e) => setRascunho((v) => ({ ...v, descricao: e.target.value }))}
                      />
                    </Campo>
                  </div>
                  <div className="sm:col-span-2">
                    <Campo rotulo="Observação">
                      <textarea
                        className={`${estiloEntrada} min-h-16 py-2`}
                        value={rascunho["observacao"] ?? ""}
                        onChange={(e) => setRascunho((v) => ({ ...v, observacao: e.target.value }))}
                      />
                    </Campo>
                  </div>
                  <div className="flex gap-2 sm:col-span-2">
                    <Botao
                      className="flex-1"
                      disabled={salvarCampos.isPending}
                      onClick={() => gravar(id)}
                    >
                      <Check className="size-4" /> Salvar e confirmar
                    </Botao>
                    <Botao variante="contorno" onClick={() => setEditando(null)}>
                      Cancelar
                    </Botao>
                  </div>
                </div>
              )}
            </Cartao>
          );
        })}
      </div>
    </AppShell>
  );
}
