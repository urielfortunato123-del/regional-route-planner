/**
 * Validações obrigatórias antes de salvar qualquer rota.
 * Módulo puro: roda no navegador (aviso imediato) e no servidor (garantia).
 */

export type ItemRota = {
  programacaoId: string;
  rotulo: string;
  regionalCodigo: string | null;
  regionalConfirmada: boolean;
  latitude: number | null;
  longitude: number | null;
  ordem: number;
};

export type PontoInicial = {
  rotulo: string;
  latitude: number | null;
  longitude: number | null;
} | null;

export type ProblemaRota = {
  codigo:
    | "sem_itens"
    | "regional_divergente"
    | "sem_regional"
    | "ponto_inicial_invalido"
    | "sem_coordenada"
    | "duplicado"
    | "sequencia_invalida";
  mensagem: string;
  registros: string[];
};

function coordenadaValida(lat: number | null, lon: number | null): boolean {
  return (
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -34 &&
    lat <= 6 &&
    lon >= -74 &&
    lon <= -32
  );
}

export function validarRota(
  itens: ItemRota[],
  pontoInicial: PontoInicial,
  regionalEsperada: string,
): ProblemaRota[] {
  const problemas: ProblemaRota[] = [];

  if (itens.length < 1) {
    problemas.push({
      codigo: "sem_itens",
      mensagem: "A rota precisa de pelo menos um serviço.",
      registros: [],
    });
    return problemas;
  }

  const outraRegional = itens.filter(
    (i) => (i.regionalCodigo ?? "") !== regionalEsperada,
  );
  if (outraRegional.length) {
    problemas.push({
      codigo: "regional_divergente",
      mensagem: `Todos os serviços da rota precisam ser da regional ${regionalEsperada}.`,
      registros: outraRegional.map((i) => i.rotulo),
    });
  }

  const semRegional = itens.filter((i) => !i.regionalCodigo || !i.regionalConfirmada);
  if (semRegional.length) {
    problemas.push({
      codigo: "sem_regional",
      mensagem:
        "Há serviços sem regional confirmada. Confirme-os em “Revisar dados da programação”.",
      registros: semRegional.map((i) => i.rotulo),
    });
  }

  if (!pontoInicial || !coordenadaValida(pontoInicial.latitude, pontoInicial.longitude)) {
    problemas.push({
      codigo: "ponto_inicial_invalido",
      mensagem:
        "Defina um ponto de partida válido (sua localização, a sede da regional ou um dos serviços).",
      registros: [],
    });
  }

  const semCoordenada = itens.filter((i) => !coordenadaValida(i.latitude, i.longitude));
  if (semCoordenada.length) {
    problemas.push({
      codigo: "sem_coordenada",
      mensagem:
        "Há serviços sem coordenada válida. Corrija a rodovia e o km na revisão e posicione no mapa.",
      registros: semCoordenada.map((i) => i.rotulo),
    });
  }

  const vistos = new Set<string>();
  const duplicados = new Set<string>();
  for (const i of itens) {
    if (vistos.has(i.programacaoId)) duplicados.add(i.rotulo);
    vistos.add(i.programacaoId);
  }
  if (duplicados.size) {
    problemas.push({
      codigo: "duplicado",
      mensagem: "Existem serviços repetidos na rota.",
      registros: [...duplicados],
    });
  }

  const ordens = itens.map((i) => i.ordem).sort((a, b) => a - b);
  const sequenciaOk = ordens.every((o, idx) => o === idx + 1);
  if (!sequenciaOk) {
    problemas.push({
      codigo: "sequencia_invalida",
      mensagem: "A sequência das paradas está inconsistente. Reordene a rota e tente de novo.",
      registros: [],
    });
  }

  return problemas;
}

export function textoDosProblemas(problemas: ProblemaRota[]): string {
  return problemas
    .map((p) => `${p.mensagem}${p.registros.length ? ` (${p.registros.slice(0, 5).join("; ")})` : ""}`)
    .join(" ");
}
