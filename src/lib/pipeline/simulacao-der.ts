/**
 * Simulação de indisponibilidade do servidor oficial do DER-SP.
 *
 * Bloqueia temporariamente as consultas ao DER, executa o job de geometria em
 * modo simulação (não grava geometria) e confere que nenhum serviço foi
 * removido, duplicado ou perdido. Ao final, o bloqueio é sempre desligado e o
 * resultado é gravado em simulacoes_der.
 */
import {
  fotografarServicosImportacao,
  registrarLogAuditoria,
  salvarSimulacaoDer,
} from "@/lib/pipeline.functions";
import { processPendingGeometries } from "@/lib/geometria/job";
import { simularFalhaDer, type FalhaSimuladaDer } from "@/services/derMapService";

export type ResultadoSimulacaoDer = {
  tipoFalha: FalhaSimuladaDer;
  iniciadoEm: string;
  concluidoEm: string;
  totalAntes: number;
  totalDepois: number;
  jaLocalizados: number;
  localizadosFallback: number;
  aguardando: number;
  comErro: number;
  removidos: string[];
  duplicados: string[];
  resultado: "aprovado" | "aprovado_com_avisos" | "reprovado";
  observacoes: string;
};

export async function simularQuedaDoDer(opcoes: {
  funcionarioId: string;
  importacaoId?: string | null;
  tipoFalha?: FalhaSimuladaDer;
  limite?: number;
}): Promise<ResultadoSimulacaoDer> {
  const tipoFalha = opcoes.tipoFalha ?? "indisponivel";
  const iniciadoEm = new Date().toISOString();
  const importacaoId = opcoes.importacaoId ?? null;

  const foto = async () => {
    const { servicos } = await fotografarServicosImportacao({
      data: { funcionarioId: opcoes.funcionarioId, importacaoId },
    });
    const ids = servicos.map((s) => s.id);
    const vistos = new Set<string>();
    const duplicados: string[] = [];
    for (const id of ids) {
      if (vistos.has(id)) duplicados.push(id);
      vistos.add(id);
    }
    return {
      ids,
      duplicados,
      localizados: servicos.filter((s) => s.latitude_inicial != null).length,
      aguardando: servicos.filter((s) => s.latitude_inicial == null).length,
    };
  };

  const antes = await foto();

  simularFalhaDer(tipoFalha);
  let job;
  try {
    job = await processPendingGeometries({
      funcionarioId: opcoes.funcionarioId,
      importacaoId,
      limite: opcoes.limite ?? 60,
      simulacao: true,
    });
  } finally {
    simularFalhaDer(null);
  }

  const depois = await foto();

  const idsDepois = new Set(depois.ids);
  const removidos = antes.ids.filter((id) => !idsDepois.has(id));
  const duplicados = depois.duplicados;

  const localizadosFallback = job.detalhes.filter((d) =>
    d.status.startsWith("LOCALIZADA"),
  ).length;
  const comErro = job.comErro;

  const resultado: ResultadoSimulacaoDer["resultado"] =
    removidos.length || duplicados.length || depois.ids.length !== antes.ids.length
      ? "reprovado"
      : comErro > 0
        ? "aprovado_com_avisos"
        : "aprovado";

  const observacoes =
    resultado === "reprovado"
      ? `Falha na contingência: ${removidos.length} serviço(s) sumiram e ${duplicados.length} duplicado(s).`
      : comErro > 0
        ? `Com o DER fora do ar, ${localizadosFallback} serviço(s) foram atendidos pela base local e ${comErro} continuaram aguardando localização — nenhum serviço foi perdido.`
        : `Com o DER fora do ar, todos os serviços pendentes foram atendidos pela base local salva no aparelho.`;

  const final: ResultadoSimulacaoDer = {
    tipoFalha,
    iniciadoEm,
    concluidoEm: new Date().toISOString(),
    totalAntes: antes.ids.length,
    totalDepois: depois.ids.length,
    jaLocalizados: antes.localizados,
    localizadosFallback,
    aguardando: depois.aguardando,
    comErro,
    removidos,
    duplicados,
    resultado,
    observacoes,
  };

  await salvarSimulacaoDer({
    data: {
      funcionarioId: opcoes.funcionarioId,
      importacaoId,
      tipoFalha,
      iniciadoEm: final.iniciadoEm,
      concluidoEm: final.concluidoEm,
      totalAntes: final.totalAntes,
      totalDepois: final.totalDepois,
      jaLocalizados: final.jaLocalizados,
      localizadosFallback: final.localizadosFallback,
      aguardando: final.aguardando,
      comErro: final.comErro,
      removidos: final.removidos.length,
      duplicados: final.duplicados.length,
      resultado: final.resultado,
      observacoes: final.observacoes.slice(0, 1000),
      detalhes: { removidos: removidos.slice(0, 100), duplicados: duplicados.slice(0, 100) },
      programacaoVersao: 1,
    },
  });

  await registrarLogAuditoria({
    data: {
      funcionarioId: opcoes.funcionarioId,
      importacaoId,
      acao: "simulacao_der",
      detalhe: `${tipoFalha} · ${final.resultado}`,
      dados: { totalAntes: final.totalAntes, totalDepois: final.totalDepois, comErro },
    },
  });

  return final;
}
