/**
 * Job interno de conversão "rodovia + km" em geometria.
 *
 * Roda no navegador (é lá que existe o cache da malha DER e o modo offline),
 * mas lê e grava sempre no banco — nunca em estado React.
 * Nenhum serviço é removido quando a conversão falha: ele apenas muda de
 * statusGeometria e continua na Programação e na lista "Aguardando localização".
 */
import { listarPendentesGeometria, salvarGeometrias } from "@/lib/geometria.functions";
import { localizarTrecho, normalizarCodigoRodovia, normalizarKm } from "@/services/derMapService";
import type { StatusGeometria } from "@/lib/geometria/status";

export type ProgressoJob = {
  total: number;
  processando: number;
  concluidos: number;
  comErro: number;
  aguardando: number;
  fonte: string | null;
  mensagem: string;
  emAndamento: boolean;
};

export type ResultadoJob = ProgressoJob & {
  duracaoMs: number;
  executadoEm: string;
  detalhes: Array<{ id: string; status: StatusGeometria; motivo: string | null }>;
};

const PROGRESSO_INICIAL: ProgressoJob = {
  total: 0,
  processando: 0,
  concluidos: 0,
  comErro: 0,
  aguardando: 0,
  fonte: null,
  mensagem: "Nenhum serviço aguardando localização.",
  emAndamento: false,
};

let emExecucao = false;
const travados = new Set<string>();
let progressoAtual: ProgressoJob = { ...PROGRESSO_INICIAL };
const ouvintes = new Set<(p: ProgressoJob) => void>();

export function progressoGeometria() {
  return progressoAtual;
}

export function observarGeometria(fn: (p: ProgressoJob) => void) {
  ouvintes.add(fn);
  fn(progressoAtual);
  return () => ouvintes.delete(fn);
}

function publicar(parcial: Partial<ProgressoJob>) {
  progressoAtual = { ...progressoAtual, ...parcial };
  for (const fn of ouvintes) fn(progressoAtual);
}

function classificarFalha(motivo: string): StatusGeometria {
  if (/fora da faixa/i.test(motivo)) return "ERRO_KM_FORA_DA_FAIXA";
  if (/rodovia/i.test(motivo)) return "ERRO_RODOVIA_NAO_ENCONTRADA";
  return "ERRO_SERVICO_DER";
}

/**
 * Localiza os serviços pendentes da regional do funcionário.
 * Evita execução duplicada (trava global) e reprocessamento simultâneo do
 * mesmo registro (trava por id).
 */
export async function processPendingGeometries(opcoes: {
  funcionarioId: string;
  importacaoId?: string | null;
  limite?: number;
}): Promise<ResultadoJob> {
  const inicio = Date.now();
  const vazio = (mensagem: string): ResultadoJob => ({
    ...progressoAtual,
    emAndamento: false,
    mensagem,
    duracaoMs: Date.now() - inicio,
    executadoEm: new Date().toISOString(),
    detalhes: [],
  });

  if (emExecucao) return vazio("Localização já está em andamento.");
  emExecucao = true;

  try {
    const { pendentes } = await listarPendentesGeometria({
      data: {
        funcionarioId: opcoes.funcionarioId,
        importacaoId: opcoes.importacaoId ?? null,
        limite: opcoes.limite ?? 120,
      },
    });

    const fila = pendentes.filter((p) => !travados.has(p.id));
    if (!fila.length) {
      publicar({ ...PROGRESSO_INICIAL });
      return vazio("Nenhum serviço aguardando localização.");
    }

    publicar({
      total: fila.length,
      processando: 0,
      concluidos: 0,
      comErro: 0,
      aguardando: fila.length,
      emAndamento: true,
      mensagem: `Localizando serviços: 0 de ${fila.length}`,
    });

    const resultados: Array<{
      id: string;
      status: StatusGeometria;
      latitude_inicial?: number | null;
      longitude_inicial?: number | null;
      latitude_final?: number | null;
      longitude_final?: number | null;
      geometria?: unknown;
      fonte?: string | null;
      precisao?: string | null;
      erro?: string | null;
    }> = [];
    const detalhes: ResultadoJob["detalhes"] = [];
    let concluidos = 0;
    let comErro = 0;
    let ultimaFonte: string | null = null;

    for (const item of fila) {
      travados.add(item.id);
      publicar({
        processando: 1,
        aguardando: fila.length - concluidos - comErro - 1,
        mensagem: `Localizando serviços: ${concluidos + comErro} de ${fila.length}`,
      });

      try {
        if (!item.rodovia) throw new Error("Rodovia não informada no registro");
        const { codigo } = normalizarCodigoRodovia(item.rodovia);
        const kmA = normalizarKm(item.km_inicial);
        if (kmA == null) throw new Error("KM inicial inválido");
        const kmB = normalizarKm(item.km_final ?? item.km_inicial);

        const trecho = await localizarTrecho(codigo, kmA, kmB ?? kmA);
        if (!trecho) throw new Error(`Rodovia ${codigo} não encontrada na malha oficial`);

        const status: StatusGeometria =
          trecho.precisao === "oficial"
            ? trecho.fonte === "cache"
              ? "LOCALIZADA_BASE_LOCAL"
              : "LOCALIZADA_DER_OFICIAL"
            : trecho.precisao === "extrapolada"
              ? "REVISAR_MANUALMENTE"
              : "LOCALIZADA_INTERPOLADA";

        ultimaFonte = trecho.fonte === "cache" ? "Base local salva no aparelho" : "DER-SP — WebRota";
        resultados.push({
          id: item.id,
          status,
          latitude_inicial: trecho.inicio.lat,
          longitude_inicial: trecho.inicio.lon,
          latitude_final: trecho.fim.lat,
          longitude_final: trecho.fim.lon,
          geometria: { tipo: "linha", pontos: trecho.linha, extensaoKm: trecho.extensaoKm },
          fonte: ultimaFonte,
          precisao: trecho.precisao,
          erro: trecho.observacao ?? null,
        });
        detalhes.push({ id: item.id, status, motivo: trecho.observacao ?? null });
        concluidos += 1;
      } catch (erro) {
        const motivo = erro instanceof Error ? erro.message : "Falha desconhecida";
        const status = classificarFalha(motivo);
        resultados.push({ id: item.id, status, erro: motivo.slice(0, 300) });
        detalhes.push({ id: item.id, status, motivo });
        comErro += 1;
      } finally {
        travados.delete(item.id);
      }

      publicar({
        concluidos,
        comErro,
        fonte: ultimaFonte,
        processando: 0,
        aguardando: fila.length - concluidos - comErro,
        mensagem: `Localizando serviços: ${concluidos + comErro} de ${fila.length}`,
      });
    }

    if (resultados.length) {
      await salvarGeometrias({ data: { funcionarioId: opcoes.funcionarioId, itens: resultados } });
    }

    const final: ProgressoJob = {
      total: fila.length,
      processando: 0,
      concluidos,
      comErro,
      aguardando: 0,
      fonte: ultimaFonte,
      emAndamento: false,
      mensagem: `${concluidos} serviço(s) localizado(s), ${comErro} com erro.`,
    };
    publicar(final);
    return {
      ...final,
      duracaoMs: Date.now() - inicio,
      executadoEm: new Date().toISOString(),
      detalhes,
    };
  } finally {
    emExecucao = false;
    publicar({ emAndamento: false, processando: 0 });
  }
}
