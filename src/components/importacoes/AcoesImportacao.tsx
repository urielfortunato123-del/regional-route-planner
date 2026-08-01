/**
 * Ações de gerenciamento de um PDF importado.
 *
 * Nada é apagado sem confirmação explícita: existem duas opções distintas,
 * remover apenas o arquivo PDF ou limpar toda a importação.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Eraser, FileDown, FileText, ListChecks, Loader2, Pencil, Trash2 } from "lucide-react";

import { Botao } from "@/components/AppShell";
import {
  duplicarImportacao,
  excluirImportacao,
  obterImportacao,
  removerPdfImportacao,
  urlPdfImportacao,
} from "@/lib/importacoes.functions";
import { limparImportacaoLocal, limparPdfLocal } from "@/lib/offline/db";

type Props = {
  funcionarioId: string;
  importacaoId: string;
  nomeArquivo: string;
  temPdf?: boolean;
  aoLimpar?: () => void;
  mostrarConferir?: boolean;
};

function csv(valor: unknown) {
  const texto = valor == null ? "" : String(valor);
  return `"${texto.replace(/"/g, '""')}"`;
}

export function AcoesImportacao({
  funcionarioId,
  importacaoId,
  nomeArquivo,
  temPdf = true,
  aoLimpar,
  mostrarConferir = true,
}: Props) {
  const fila = useQueryClient();
  const navegar = useNavigate();
  const [confirmacao, setConfirmacao] = useState<"nenhuma" | "pdf" | "tudo">("nenhuma");

  const atualizarTelas = () => {
    for (const chave of [
      "importacoes",
      "importacao",
      "programacoes",
      "dias",
      "rotas",
      "mapa",
      "resumo",
      "campo",
    ]) {
      void fila.invalidateQueries({ queryKey: [chave] });
    }
  };

  const abrirPdf = useMutation({
    mutationFn: () => urlPdfImportacao({ data: { funcionarioId, importacaoId } }),
    onSuccess: (r) => {
      if (r.url) window.open(r.url, "_blank", "noopener");
      else toast.error("O arquivo PDF não está mais guardado nesta importação.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportar = useMutation({
    mutationFn: () => obterImportacao({ data: { funcionarioId, importacaoId } }),
    onSuccess: (r) => {
      const registros = (r.registros ?? []) as unknown as Array<Record<string, unknown>>;
      const colunas = [
        "regional_codigo",
        "equipe",
        "funcionario",
        "categoria",
        "contrato",
        "atividade",
        "rodovia",
        "km_inicial",
        "km_final",
        "descricao",
        "data_inicial",
        "data_final",
        "medicao",
        "observacao",
        "status_validacao",
      ];
      const linhas = [
        colunas.join(";"),
        ...registros.map((reg) => colunas.map((c) => csv(reg[c])).join(";")),
      ].join("\n");
      const url = URL.createObjectURL(
        new Blob([`\ufeff${linhas}`], { type: "text/csv;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `${nomeArquivo.replace(/\.pdf$/i, "")}-conferencia.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Dados exportados em planilha.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editar = useMutation({
    mutationFn: () => duplicarImportacao({ data: { funcionarioId, importacaoId } }),
    onSuccess: (r) => {
      toast.success(`Nova versão ${r.versao} criada para edição.`);
      void navegar({ to: "/importacoes/$id", params: { id: r.importacaoId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removerPdf = useMutation({
    mutationFn: () => removerPdfImportacao({ data: { funcionarioId, importacaoId } }),
    onSuccess: async (r) => {
      await limparPdfLocal(importacaoId);
      setConfirmacao("nenhuma");
      atualizarTelas();
      toast.success(
        r.removido
          ? "Arquivo PDF removido. Os dados processados continuam disponíveis."
          : "Esta importação já estava sem arquivo PDF.",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const limparTudo = useMutation({
    mutationFn: () => excluirImportacao({ data: { funcionarioId, importacaoId } }),
    onSuccess: async (r) => {
      await limparImportacaoLocal(importacaoId, r.idsProgramacao ?? []);
      setConfirmacao("nenhuma");
      atualizarTelas();
      toast.success(
        `Importação removida: ${r.programacoes} serviço(s), ${r.rotas} rota(s), ${r.inspecoes} inspeção(ões) e ${r.ocorrencias} ocorrência(s).`,
      );
      if (aoLimpar) aoLimpar();
      else void navegar({ to: "/importacoes" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ocupado = removerPdf.isPending || limparTudo.isPending;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Botao variante="contorno" disabled={!temPdf || abrirPdf.isPending} onClick={() => abrirPdf.mutate()}>
          <FileText className="size-4" /> Abrir PDF
        </Botao>
        {mostrarConferir ? (
          <Botao
            variante="contorno"
            onClick={() => void navegar({ to: "/importacoes/$id", params: { id: importacaoId } })}
          >
            <ListChecks className="size-4" /> Conferir dados
          </Botao>
        ) : null}
        <Botao variante="contorno" disabled={editar.isPending} onClick={() => editar.mutate()}>
          <Pencil className="size-4" /> Editar
        </Botao>
        <Botao variante="contorno" disabled={exportar.isPending} onClick={() => exportar.mutate()}>
          <FileDown className="size-4" /> Exportar
        </Botao>
        <Botao variante="contorno" disabled={ocupado} onClick={() => setConfirmacao("pdf")}>
          <Trash2 className="size-4" /> Remover PDF
        </Botao>
        <Botao variante="perigo" disabled={ocupado} onClick={() => setConfirmacao("tudo")}>
          <Eraser className="size-4" /> Limpar importação
        </Botao>
      </div>

      {confirmacao === "pdf" ? (
        <div className="rounded-md border border-warning bg-warning/10 p-3 text-sm">
          <p className="font-semibold">Remover somente o arquivo PDF?</p>
          <p className="mt-1 text-muted-foreground">
            O arquivo PDF será removido, mas os dados processados permanecerão disponíveis.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Botao variante="contorno" onClick={() => setConfirmacao("nenhuma")}>
              Cancelar
            </Botao>
            <Botao variante="perigo" disabled={removerPdf.isPending} onClick={() => removerPdf.mutate()}>
              {removerPdf.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Remover somente o PDF
            </Botao>
          </div>
        </div>
      ) : null}

      {confirmacao === "tudo" ? (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm">
          <p className="font-semibold">Tem certeza que deseja excluir esta importação?</p>
          <p className="mt-1">Esta ação removerá:</p>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            <li>o arquivo PDF;</li>
            <li>os registros extraídos;</li>
            <li>a programação gerada;</li>
            <li>as rotas vinculadas;</li>
            <li>as inspeções vinculadas;</li>
            <li>as ocorrências vinculadas.</li>
          </ul>
          <p className="mt-1 font-semibold">Esta ação não poderá ser desfeita.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Botao variante="contorno" onClick={() => setConfirmacao("nenhuma")}>
              Cancelar
            </Botao>
            <Botao variante="perigo" disabled={limparTudo.isPending} onClick={() => limparTudo.mutate()}>
              {limparTudo.isPending ? <Loader2 className="size-4 animate-spin" /> : <Eraser className="size-4" />}
              Excluir definitivamente
            </Botao>
          </div>
        </div>
      ) : null}
    </div>
  );
}
