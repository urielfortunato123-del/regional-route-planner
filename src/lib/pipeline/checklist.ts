/**
 * Checklist automático de validação do pipeline.
 *
 * Roda no navegador porque precisa comparar o banco remoto com o banco local
 * do aparelho, mas TODAS as contagens vêm de dados persistidos — nunca de
 * estado de tela — e o resultado é gravado na tabela pipeline_validacoes.
 */
import { auditarImportacao } from "@/lib/auditoria.functions";
import {
  dadosChecklistPipeline,
  gravarChecklistPipeline,
  lerChecklistPipeline,
  registrarLogAuditoria,
} from "@/lib/pipeline.functions";
import { lerProgramacoes, lerRotas } from "@/lib/offline/db";
import {
  ETAPAS_PIPELINE,
  ROTULO_ETAPA,
  bloqueiosCriticos,
  pendenciasNaoCriticas,
  type ChaveEtapa,
  type EtapaChecklist,
  type StatusEtapa,
} from "@/lib/pipeline/etapas";
import { testarPersistenciaOffline } from "@/lib/pipeline/consistencia";

export type ResultadoChecklist = {
  importacaoId: string | null;
  regionalId: string;
  regionalCodigo: string;
  programacaoVersao: number;
  checklist: EtapaChecklist[];
  bloqueado: boolean;
  criticasDivergentes: EtapaChecklist[];
  pendenciasNaoCriticas: EtapaChecklist[];
  validadoEm: string;
};

type Calculada = {
  etapa: ChaveEtapa;
  status: StatusEtapa;
  esperado: number;
  encontrado: number;
  registros?: string[];
  motivo?: string | null;
};

function montar(
  calculadas: Calculada[],
  anterior: Map<string, EtapaChecklist>,
): EtapaChecklist[] {
  const agora = new Date().toISOString();
  return calculadas
    .map((c) => {
      const def = ETAPAS_PIPELINE.find((e) => e.chave === c.etapa)!;
      const antes = anterior.get(c.etapa);
      // etapa que estava divergente e voltou a bater = CORRIGIDO
      const status: StatusEtapa =
        c.status === "OK" && antes && (antes.status === "DIVERGENTE" || antes.status === "ERRO")
          ? "CORRIGIDO"
          : c.status;
      return {
        etapa: c.etapa,
        ordem: def.ordem,
        rotulo: def.rotulo,
        critica: def.critica,
        status,
        esperado: c.esperado,
        encontrado: c.encontrado,
        divergencia: Math.abs(c.esperado - c.encontrado),
        registros: c.registros ?? [],
        motivo: c.motivo ?? null,
        validadoEm: agora,
        atualizadoEm: agora,
      } satisfies EtapaChecklist;
    })
    .sort((a, b) => a.ordem - b.ordem);
}

/** Lê o checklist já gravado, sem recalcular nada. */
export async function checklistPersistido(opcoes: {
  funcionarioId: string;
  importacaoId?: string | null;
}): Promise<ResultadoChecklist> {
  const { perfil, checklist } = await lerChecklistPipeline({
    data: { funcionarioId: opcoes.funcionarioId, importacaoId: opcoes.importacaoId ?? null },
  });
  const lista: EtapaChecklist[] = checklist.map((c) => ({
    etapa: c.etapa as ChaveEtapa,
    ordem: c.ordem,
    rotulo: ROTULO_ETAPA(c.etapa),
    critica: c.critica,
    status: c.status,
    esperado: c.esperado,
    encontrado: c.encontrado,
    divergencia: c.divergencia,
    registros: c.registros,
    motivo: c.motivo,
    validadoEm: c.validadoEm,
    atualizadoEm: c.atualizadoEm,
  }));
  return {
    importacaoId: opcoes.importacaoId ?? null,
    regionalId: perfil.regional_id,
    regionalCodigo: perfil.regional_codigo,
    programacaoVersao: 1,
    checklist: lista,
    bloqueado: bloqueiosCriticos(lista).length > 0,
    criticasDivergentes: bloqueiosCriticos(lista),
    pendenciasNaoCriticas: pendenciasNaoCriticas(lista),
    validadoEm: lista.find((l) => l.validadoEm)?.validadoEm ?? "",
  };
}

/**
 * Executa o checklist. Quando `somenteEtapas` é informado, só essas etapas são
 * recalculadas e regravadas — as demais permanecem com o resultado anterior.
 */
export async function executarChecklistPipeline(opcoes: {
  funcionarioId: string;
  importacaoId?: string | null;
  regionalCodigo: string;
  dia?: string | null;
  somenteEtapas?: ChaveEtapa[];
  registrarLog?: boolean;
}): Promise<ResultadoChecklist> {
  const importacaoId = opcoes.importacaoId ?? null;

  const [auditoria, extras, anteriorBruto] = await Promise.all([
    auditarImportacao({ data: { funcionarioId: opcoes.funcionarioId, importacaoId } }),
    dadosChecklistPipeline({ data: { funcionarioId: opcoes.funcionarioId, importacaoId } }),
    lerChecklistPipeline({ data: { funcionarioId: opcoes.funcionarioId, importacaoId } }),
  ]);

  const anterior = new Map<string, EtapaChecklist>(
    anteriorBruto.checklist.map((c) => [
      c.etapa,
      {
        etapa: c.etapa as ChaveEtapa,
        ordem: c.ordem,
        rotulo: ROTULO_ETAPA(c.etapa),
        critica: c.critica,
        status: c.status,
        esperado: c.esperado,
        encontrado: c.encontrado,
        divergencia: c.divergencia,
        registros: c.registros,
        motivo: c.motivo,
        validadoEm: c.validadoEm,
        atualizadoEm: c.atualizadoEm,
      },
    ]),
  );

  const etapas = auditoria.etapas;
  const registros = auditoria.registros;
  const daRegional = registros.filter((r) => r.no_mapa);
  const persistidos = registros.filter((r) => r.status_persistencia === "persistido");
  const semRegional = registros.filter((r) => !r.regional_codigo);

  const locais = (await lerProgramacoes(opcoes.regionalCodigo)) as Array<Record<string, unknown>>;
  const recorteLocal = importacaoId
    ? locais.filter((r) => r["importacao_id"] === importacaoId)
    : locais;
  const rotasLocais = await lerRotas(opcoes.regionalCodigo);

  const versaoImportacao = auditoria.importacao?.programacao_versao ?? 1;

  const precisa = (chave: ChaveEtapa) =>
    !opcoes.somenteEtapas || opcoes.somenteEtapas.includes(chave);

  const calculadas: Calculada[] = [];

  if (precisa("PDF_LIDO")) {
    const ok = Boolean(auditoria.importacao) && etapas.paginasPdf > 0;
    calculadas.push({
      etapa: "PDF_LIDO",
      status: ok ? "OK" : auditoria.importacao ? "DIVERGENTE" : "ERRO",
      esperado: etapas.paginasPdf,
      encontrado: etapas.paginasPdf,
      motivo: ok ? null : "Importação sem páginas registradas no banco.",
    });
  }

  if (precisa("LINHAS_EXTRAIDAS")) {
    const esperado = etapas.linhasBrutas;
    const encontrado = etapas.registrosSalvos + etapas.linhasConferencia;
    calculadas.push({
      etapa: "LINHAS_EXTRAIDAS",
      status: encontrado >= esperado ? "OK" : "DIVERGENTE",
      esperado,
      encontrado,
      motivo:
        encontrado >= esperado
          ? null
          : "Há linhas lidas do PDF que não estão gravadas nem na conferência nem na programação.",
    });
  }

  if (precisa("LINHAS_CLASSIFICADAS")) {
    calculadas.push({
      etapa: "LINHAS_CLASSIFICADAS",
      status: semRegional.length ? "DIVERGENTE" : "OK",
      esperado: registros.length,
      encontrado: registros.length - semRegional.length,
      registros: semRegional.map((r) => r.id).slice(0, 200),
      motivo: semRegional.length
        ? `${semRegional.length} linha(s) sem regional identificada.`
        : null,
    });
  }

  if (precisa("REGISTROS_PERSISTIDOS")) {
    const duplicados = extras.duplicados;
    const esperado = etapas.linhasBrutas || persistidos.length;
    const encontrado = persistidos.length + etapas.linhasConferencia;
    const falha = duplicados.length > 0 || encontrado < esperado;
    calculadas.push({
      etapa: "REGISTROS_PERSISTIDOS",
      status: falha ? "DIVERGENTE" : "OK",
      esperado,
      encontrado,
      registros: duplicados.slice(0, 200),
      motivo: duplicados.length
        ? `${duplicados.length} registro(s) duplicado(s) na regional.`
        : falha
          ? "Quantidade persistida menor que a quantidade lida do PDF."
          : null,
    });
  }

  if (precisa("PROGRAMACAO_CARREGADA")) {
    const esperado = etapas.servicosRegionalAtual;
    const encontrado = etapas.exibidosProgramacao;
    const semConfirmacao = daRegional.filter((r) => !r.na_programacao);
    calculadas.push({
      etapa: "PROGRAMACAO_CARREGADA",
      status: esperado === encontrado ? "OK" : "DIVERGENTE",
      esperado,
      encontrado,
      registros: semConfirmacao.map((r) => r.id).slice(0, 200),
      motivo:
        esperado === encontrado
          ? null
          : `${semConfirmacao.length} serviço(s) da regional não aparecem na Programação (regional não confirmada).`,
    });
  }

  if (precisa("MAPA_CARREGADO")) {
    const esperado = etapas.servicosRegionalAtual;
    const encontrado = recorteLocal.length;
    const idsRemotos = new Set(daRegional.map((r) => r.id));
    const idsLocais = new Set(recorteLocal.map((r) => String(r["id"])));
    const faltando = [...idsRemotos].filter((id) => !idsLocais.has(id));
    calculadas.push({
      etapa: "MAPA_CARREGADO",
      status: faltando.length ? "DIVERGENTE" : "OK",
      esperado,
      encontrado,
      registros: faltando.slice(0, 200),
      motivo: faltando.length
        ? `${faltando.length} serviço(s) gravados no banco ainda não estão salvos no aparelho.`
        : null,
    });
  }

  if (precisa("AGUARDANDO_LOCALIZACAO")) {
    const aguardando = daRegional.filter((r) => r.latitude_inicial == null);
    calculadas.push({
      etapa: "AGUARDANDO_LOCALIZACAO",
      status: aguardando.length ? "DIVERGENTE" : "OK",
      esperado: 0,
      encontrado: aguardando.length,
      registros: aguardando.map((r) => r.id).slice(0, 200),
      motivo: aguardando.length
        ? `${aguardando.length} serviço(s) aguardando localização — pendência não crítica, permite rota parcial.`
        : null,
    });
  }

  if (precisa("GEOMETRIAS_VALIDAS")) {
    calculadas.push({
      etapa: "GEOMETRIAS_VALIDAS",
      status: etapas.comGeometria === etapas.servicosRegionalAtual ? "OK" : "DIVERGENTE",
      esperado: etapas.servicosRegionalAtual,
      encontrado: etapas.comGeometria,
      motivo:
        etapas.comGeometria === etapas.servicosRegionalAtual
          ? null
          : "Nem todos os serviços têm geometria válida gravada.",
    });
  }

  if (precisa("ELEGIVEIS_ROTA")) {
    const bloqueados = daRegional.filter((r) => !r.elegivel_rota);
    calculadas.push({
      etapa: "ELEGIVEIS_ROTA",
      status: etapas.elegiveisRota > 0 ? "OK" : "DIVERGENTE",
      esperado: etapas.servicosRegionalAtual,
      encontrado: etapas.elegiveisRota,
      registros: bloqueados.map((r) => r.id).slice(0, 200),
      motivo:
        etapas.elegiveisRota > 0
          ? null
          : "Nenhum serviço elegível para rota nesta importação/regional.",
    });
  }

  if (precisa("ROTA_CONSISTENTE")) {
    calculadas.push({
      etapa: "ROTA_CONSISTENTE",
      status: extras.rotasComOrfao.length ? "DIVERGENTE" : "OK",
      esperado: extras.rotas.length,
      encontrado: extras.rotas.length - extras.rotasComOrfao.length,
      registros: extras.rotasComOrfao.slice(0, 200),
      motivo: extras.rotasComOrfao.length
        ? `${extras.rotasComOrfao.length} rota(s) apontam para serviços que não existem mais.`
        : null,
    });
  }

  if (precisa("PERSISTENCIA_OFFLINE")) {
    const offline = await testarPersistenciaOffline({
      regionalCodigo: opcoes.regionalCodigo,
      dia: opcoes.dia ?? null,
    });
    calculadas.push({
      etapa: "PERSISTENCIA_OFFLINE",
      status: offline.status === "reprovado" ? "ERRO" : "OK",
      esperado: offline.antes.mapa,
      encontrado: offline.depois.mapa,
      registros: offline.naoRecuperados.slice(0, 200),
      motivo:
        offline.status === "reprovado"
          ? `${offline.naoRecuperados.length} serviço(s) não voltaram do banco do aparelho.`
          : offline.divergencias.join(" · ") || null,
    });
  }

  if (precisa("VERSIONAMENTO")) {
    const rotasFora = extras.rotas.filter(
      (r) =>
        r.importacaoId === importacaoId &&
        r.versaoProgramacao != null &&
        r.versaoProgramacao !== versaoImportacao,
    );
    const semImportacao = importacaoId
      ? persistidos.filter((r) => r.importacao_id !== importacaoId)
      : [];
    const falha = rotasFora.length > 0 || semImportacao.length > 0 || !auditoria.importacao;
    calculadas.push({
      etapa: "VERSIONAMENTO",
      status: falha ? "DIVERGENTE" : "OK",
      esperado: versaoImportacao,
      encontrado: versaoImportacao,
      registros: [...rotasFora.map((r) => r.id), ...semImportacao.map((r) => r.id)].slice(0, 200),
      motivo: falha
        ? rotasFora.length
          ? `${rotasFora.length} rota(s) salvas com versão diferente da programação atual.`
          : "Registros persistidos sem vínculo com a importação atual."
        : null,
    });
  }

  const novas = montar(calculadas, anterior);

  await gravarChecklistPipeline({
    data: {
      funcionarioId: opcoes.funcionarioId,
      importacaoId,
      programacaoVersao: versaoImportacao,
      etapas: novas.map((e) => ({
        etapa: e.etapa,
        ordem: e.ordem,
        critica: e.critica,
        status: e.status,
        esperado: e.esperado,
        encontrado: e.encontrado,
        divergencia: e.divergencia,
        registros: e.registros,
        motivo: e.motivo,
      })),
    },
  });

  // etapas não recalculadas mantêm o resultado anterior
  const completo: EtapaChecklist[] = ETAPAS_PIPELINE.map((def) => {
    const nova = novas.find((n) => n.etapa === def.chave);
    if (nova) return nova;
    const antes = anterior.get(def.chave);
    return (
      antes ?? {
        etapa: def.chave,
        ordem: def.ordem,
        rotulo: def.rotulo,
        critica: def.critica,
        status: "PENDENTE" as StatusEtapa,
        esperado: 0,
        encontrado: 0,
        divergencia: 0,
        registros: [],
        motivo: null,
        validadoEm: null,
        atualizadoEm: null,
      }
    );
  }).sort((a, b) => a.ordem - b.ordem);

  const criticas = bloqueiosCriticos(completo);

  if (opcoes.registrarLog !== false) {
    await registrarLogAuditoria({
      data: {
        funcionarioId: opcoes.funcionarioId,
        importacaoId,
        acao: opcoes.somenteEtapas ? "pipeline_atualizacao_parcial" : "pipeline_validacao",
        detalhe: `${completo.filter((e) => e.status === "OK" || e.status === "CORRIGIDO").length} etapa(s) OK · ${criticas.length} divergência(s) crítica(s)`,
        dados: {
          etapas: completo.map((e) => ({ etapa: e.etapa, status: e.status })),
          somenteEtapas: opcoes.somenteEtapas ?? null,
        },
      },
    });
  }

  return {
    importacaoId,
    regionalId: auditoria.perfil.regional_id,
    regionalCodigo: auditoria.perfil.regional_codigo,
    programacaoVersao: versaoImportacao,
    checklist: completo,
    bloqueado: criticas.length > 0,
    criticasDivergentes: criticas,
    pendenciasNaoCriticas: pendenciasNaoCriticas(completo),
    validadoEm: new Date().toISOString(),
  };
}

/** Reprocessa apenas as etapas com status DIVERGENTE ou ERRO. */
export async function atualizarEtapasDivergentes(opcoes: {
  funcionarioId: string;
  importacaoId?: string | null;
  regionalCodigo: string;
  dia?: string | null;
}): Promise<ResultadoChecklist & { reprocessadas: ChaveEtapa[] }> {
  const atual = await checklistPersistido({
    funcionarioId: opcoes.funcionarioId,
    importacaoId: opcoes.importacaoId ?? null,
  });
  const alvo = atual.checklist
    .filter((e) => e.status === "DIVERGENTE" || e.status === "ERRO")
    .map((e) => e.etapa);

  if (!alvo.length) return { ...atual, reprocessadas: [] };

  const resultado = await executarChecklistPipeline({ ...opcoes, somenteEtapas: alvo });
  return { ...resultado, reprocessadas: alvo };
}
