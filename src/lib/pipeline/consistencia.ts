/**
 * Verificação de consistência do pipeline
 * Importação → Persistência → Programação → Mapa → Rota.
 *
 * Todas as contagens saem de dados PERSISTIDOS: banco remoto (auditoria) e
 * banco local do aparelho (IndexedDB/Dexie). Nada aqui olha estado React.
 */
import { auditarImportacao, registrarValidacaoPipeline } from "@/lib/auditoria.functions";
import { banco, lerProgramacoes, lerRotas } from "@/lib/offline/db";

export type Divergencia = {
  etapa: string;
  esperado: number;
  encontrado: number;
  diferenca: number;
  registros: string[];
  detalhe: string;
};

export type ResultadoConsistencia = {
  importacaoId: string | null;
  regionalId: string;
  regionalCodigo: string;
  totalPersistido: number;
  totalRegional: number;
  totalProgramacao: number;
  totalMapa: number;
  totalRotaElegivel: number;
  aguardandoLocalizacao: number;
  comGeometria: number;
  concluidos: number;
  cancelados: number;
  totalLocal: number;
  rotasLocais: number;
  divergencias: Divergencia[];
  validadoEm: string;
};

const localizado = (r: Record<string, unknown>) =>
  typeof r["latitude_inicial"] === "number" && typeof r["longitude_inicial"] === "number";

export const elegivelParaRota = (r: Record<string, unknown>, dia?: string | null) => {
  if (!localizado(r)) return false;
  if (r["regional_confirmada"] !== true) return false;
  const status = String(r["status"] ?? "pendente");
  if (status === "cancelado" || status === "concluido") return false;
  if (dia) {
    const inicio = String(r["data_inicial"] ?? "");
    const fim = String(r["data_final"] ?? inicio);
    if (!(inicio <= dia && dia <= (fim || inicio))) return false;
  }
  return true;
};

/**
 * Compara banco remoto × banco local × regras de cada tela.
 * Devolve as divergências com os ids envolvidos — sem alterar nenhum registro.
 */
export async function validatePipelineConsistency(opcoes: {
  funcionarioId: string;
  importacaoId?: string | null;
  regionalCodigo: string;
  dia?: string | null;
  registrar?: boolean;
}): Promise<ResultadoConsistencia> {
  const auditoria = await auditarImportacao({
    data: { funcionarioId: opcoes.funcionarioId, importacaoId: opcoes.importacaoId ?? null },
  });

  const locais = (await lerProgramacoes(opcoes.regionalCodigo)) as Array<Record<string, unknown>>;
  const rotas = await lerRotas(opcoes.regionalCodigo);
  const doRecorte = opcoes.importacaoId
    ? locais.filter((r) => r["importacao_id"] === opcoes.importacaoId)
    : locais;

  const persistidosRegional = auditoria.registros.filter(
    (r) => r.status_persistencia === "persistido" && r.no_mapa,
  );
  const divergencias: Divergencia[] = [];
  const idsRemotos = new Set(persistidosRegional.map((r) => r.id));
  const idsLocais = new Set(doRecorte.map((r) => String(r["id"])));

  const faltandoNoAparelho = [...idsRemotos].filter((id) => !idsLocais.has(id));
  if (faltandoNoAparelho.length) {
    divergencias.push({
      etapa: "Persistência no aparelho",
      esperado: idsRemotos.size,
      encontrado: idsLocais.size,
      diferenca: faltandoNoAparelho.length,
      registros: faltandoNoAparelho.slice(0, 50),
      detalhe: "Serviços gravados no banco que ainda não estão salvos no aparelho.",
    });
  }

  const exibidosProgramacao = persistidosRegional.filter((r) => r.na_programacao).length;
  if (exibidosProgramacao !== auditoria.etapas.exibidosProgramacao) {
    divergencias.push({
      etapa: "Programação",
      esperado: auditoria.etapas.exibidosProgramacao,
      encontrado: exibidosProgramacao,
      diferenca: Math.abs(auditoria.etapas.exibidosProgramacao - exibidosProgramacao),
      registros: [],
      detalhe: "Contagem exibida diferente da contagem persistida da regional.",
    });
  }

  const semRegionalConfirmada = persistidosRegional.filter((r) => !r.na_programacao);
  if (semRegionalConfirmada.length) {
    divergencias.push({
      etapa: "Regional não confirmada",
      esperado: persistidosRegional.length,
      encontrado: exibidosProgramacao,
      diferenca: semRegionalConfirmada.length,
      registros: semRegionalConfirmada.map((r) => r.id).slice(0, 50),
      detalhe:
        "Serviços persistidos que ainda não aparecem na Programação porque a regional não foi confirmada.",
    });
  }

  const elegiveisLocais = doRecorte.filter((r) => elegivelParaRota(r, opcoes.dia ?? null)).length;

  const resultado: ResultadoConsistencia = {
    importacaoId: opcoes.importacaoId ?? null,
    regionalId: auditoria.perfil.regional_id,
    regionalCodigo: auditoria.perfil.regional_codigo,
    totalPersistido: auditoria.etapas.registrosSalvos,
    totalRegional: auditoria.etapas.servicosRegionalAtual,
    totalProgramacao: auditoria.etapas.exibidosProgramacao,
    totalMapa: auditoria.etapas.exibidosMapa,
    totalRotaElegivel: auditoria.etapas.elegiveisRota,
    aguardandoLocalizacao: auditoria.etapas.aguardandoLocalizacao,
    comGeometria: auditoria.etapas.comGeometria,
    concluidos: auditoria.etapas.concluidos,
    cancelados: auditoria.etapas.cancelados,
    totalLocal: doRecorte.length,
    rotasLocais: rotas.length,
    divergencias,
    validadoEm: new Date().toISOString(),
  };

  if (opcoes.dia && elegiveisLocais !== resultado.totalRotaElegivel) {
    // recorte por dia é esperado; registrado apenas como informação
    resultado.divergencias.push({
      etapa: "Rota (dia selecionado)",
      esperado: resultado.totalRotaElegivel,
      encontrado: elegiveisLocais,
      diferenca: Math.abs(resultado.totalRotaElegivel - elegiveisLocais),
      registros: [],
      detalhe: "Diferença esperada quando há filtro por dia: só o dia selecionado entra na rota.",
    });
  }

  if (opcoes.registrar && opcoes.importacaoId) {
    await registrarValidacaoPipeline({
      data: {
        funcionarioId: opcoes.funcionarioId,
        importacaoId: opcoes.importacaoId,
        resultado: { ...resultado, divergencias: resultado.divergencias },
      },
    });
  }

  return resultado;
}

// ------------------------------------------------------- teste offline

export type ResultadoTesteOffline = {
  status: "aprovado" | "aprovado_com_avisos" | "reprovado";
  antes: { programacao: number; mapa: number; rota: number; aguardando: number; rotas: number };
  depois: { programacao: number; mapa: number; rota: number; aguardando: number; rotas: number };
  geometriasSalvas: number;
  naoRecuperados: string[];
  divergencias: string[];
  duracaoMs: number;
  executadoEm: string;
};

/**
 * Simula fechar e reabrir o aplicativo: fecha a conexão com o IndexedDB,
 * descarta tudo o que estava em memória e relê Programação, Mapa e Rota
 * exclusivamente do banco local. Não apaga nada e não relê o PDF.
 */
export async function testarPersistenciaOffline(opcoes: {
  regionalCodigo: string;
  dia?: string | null;
}): Promise<ResultadoTesteOffline> {
  const inicio = Date.now();
  const contar = (registros: Array<Record<string, unknown>>, rotas: number) => ({
    programacao: registros.filter((r) => r["regional_confirmada"] === true).length,
    mapa: registros.length,
    rota: registros.filter((r) => elegivelParaRota(r, opcoes.dia ?? null)).length,
    aguardando: registros.filter((r) => !localizado(r)).length,
    rotas,
  });

  const antesRegistros = (await lerProgramacoes(opcoes.regionalCodigo)) as Array<
    Record<string, unknown>
  >;
  const antesRotas = await lerRotas(opcoes.regionalCodigo);
  const antes = contar(antesRegistros, antesRotas.length);
  const idsAntes = antesRegistros.map((r) => String(r["id"]));

  // fecha e reabre a conexão: nada permanece em memória
  const db = banco();
  db?.close();
  await new Promise((r) => setTimeout(r, 120));
  await db?.open();

  const depoisRegistros = (await lerProgramacoes(opcoes.regionalCodigo)) as Array<
    Record<string, unknown>
  >;
  const depoisRotas = await lerRotas(opcoes.regionalCodigo);
  const depois = contar(depoisRegistros, depoisRotas.length);

  const idsDepois = new Set(depoisRegistros.map((r) => String(r["id"])));
  const naoRecuperados = idsAntes.filter((id) => !idsDepois.has(id));

  const divergencias: string[] = [];
  if (antes.programacao !== depois.programacao)
    divergencias.push(`Programação: ${antes.programacao} antes × ${depois.programacao} depois`);
  if (antes.mapa !== depois.mapa) divergencias.push(`Mapa: ${antes.mapa} × ${depois.mapa}`);
  if (antes.rota !== depois.rota) divergencias.push(`Rota: ${antes.rota} × ${depois.rota}`);
  if (antes.rotas !== depois.rotas)
    divergencias.push(`Rotas salvas: ${antes.rotas} × ${depois.rotas}`);

  const status: ResultadoTesteOffline["status"] = naoRecuperados.length
    ? "reprovado"
    : divergencias.length
      ? "aprovado_com_avisos"
      : depois.aguardando > 0
        ? "aprovado_com_avisos"
        : "aprovado";

  return {
    status,
    antes,
    depois,
    geometriasSalvas: depoisRegistros.filter((r) => localizado(r)).length,
    naoRecuperados,
    divergencias,
    duracaoMs: Date.now() - inicio,
    executadoEm: new Date().toISOString(),
  };
}
