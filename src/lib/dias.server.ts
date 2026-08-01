/**
 * Indicadores por dia da programação (usado na etapa "Selecione o dia").
 * Função pura: recebe as linhas já filtradas pela regional no servidor.
 */
export type LinhaDia = {
  id: string;
  rodovia: string | null;
  km_inicial: number | string | null;
  km_final: number | string | null;
  data_inicial: string | null;
  data_final: string | null;
  status: string | null;
  latitude_inicial: number | null;
  longitude_inicial: number | null;
};

export type ResumoDia = {
  data: string;
  servicos: number;
  rodovias: number;
  extensaoKm: number;
  semLocalizacao: number;
  concluidos: number;
  pendentes: number;
};

function paraNumero(v: number | string | null) {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Um serviço com data inicial e final entra em todos os dias do intervalo. */
export function montarDias(linhas: LinhaDia[]): ResumoDia[] {
  const porDia = new Map<string, LinhaDia[]>();

  for (const l of linhas) {
    if (!l.data_inicial) continue;
    const inicio = new Date(`${l.data_inicial}T12:00:00`);
    const fim = new Date(`${l.data_final ?? l.data_inicial}T12:00:00`);
    if (Number.isNaN(inicio.getTime())) continue;
    const ultimo = Number.isNaN(fim.getTime()) || fim < inicio ? inicio : fim;
    for (let d = new Date(inicio); d <= ultimo; d.setDate(d.getDate() + 1)) {
      const chave = d.toISOString().slice(0, 10);
      const lista = porDia.get(chave) ?? [];
      lista.push(l);
      porDia.set(chave, lista);
      if (lista.length > 2000) break;
    }
  }

  return [...porDia.entries()]
    .map(([data, lista]) => {
      const rodovias = new Set(lista.map((l) => l.rodovia).filter(Boolean));
      const extensaoKm = lista.reduce((soma, l) => {
        const a = paraNumero(l.km_inicial);
        const b = paraNumero(l.km_final);
        if (a == null || b == null) return soma;
        return soma + Math.abs(b - a);
      }, 0);
      const concluidos = lista.filter((l) => l.status === "concluido").length;
      return {
        data,
        servicos: lista.length,
        rodovias: rodovias.size,
        extensaoKm: Number(extensaoKm.toFixed(1)),
        semLocalizacao: lista.filter((l) => l.latitude_inicial == null).length,
        concluidos,
        pendentes: lista.filter((l) => l.status !== "concluido" && l.status !== "cancelado").length,
      };
    })
    .sort((a, b) => a.data.localeCompare(b.data));
}
