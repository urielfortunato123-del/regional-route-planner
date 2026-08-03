/**
 * Rota inteligente sobre os trechos oficiais do DER-SP.
 *
 * Cada serviço da programação vira um TRECHO (km inicial → km final) com
 * geometria oficial. A rota escolhe, para cada trecho, o PONTO DE ACESSO
 * (início, fim ou ponto mais próximo do eixo), sequencia os trechos por
 * proximidade e mede o percurso pela malha viária (OSRM).
 *
 * Módulo puro do lado do navegador: só depende de geometria e da função de
 * servidor que consulta o OSRM. Nunca inventa coordenada.
 */
import { distanciaMetros, type LatLon } from "@/lib/der/geo";
import { calcularPercurso } from "@/lib/osrm.functions";
import type { TrechoLocalizado } from "@/services/derMapService";

export type TipoAcesso = "inicio" | "fim" | "proximo" | "manual";

export type PontoAcesso = {
  tipo: TipoAcesso;
  rotulo: string;
  lat: number;
  lon: number;
  km: number | null;
};

export type TrechoProgramado = {
  id: string;
  rotulo: string;
  detalhe: string;
  status: string;
  regionalCodigo: string | null;
  regionalConfirmada: boolean;
  trecho: TrechoLocalizado;
};

export type ParadaRota = {
  ordem: number;
  item: TrechoProgramado;
  acesso: PontoAcesso;
  saida: LatLon;
  distanciaKm: number | null;
  tempoMin: number | null;
};

export type RotaCalculada = {
  paradas: ParadaRota[];
  distanciaTotalKm: number;
  tempoTotalMin: number;
  geometria: LatLon[];
  pelaEstrada: boolean;
  motivo: string | null;
};

function projetarNoSegmento(p: LatLon, a: LatLon, b: LatLon): LatLon {
  const cos = Math.cos((p.lat * Math.PI) / 180);
  const ax = a.lon * cos;
  const ay = a.lat;
  const dx = b.lon * cos - ax;
  const dy = b.lat - ay;
  const den = dx * dx + dy * dy;
  const t =
    den === 0 ? 0 : Math.max(0, Math.min(1, ((p.lon * cos - ax) * dx + (p.lat - ay) * dy) / den));
  return { lat: ay + dy * t, lon: (ax + dx * t) / cos };
}

/** Ponto do eixo do trecho mais próximo de uma origem. */
export function pontoMaisProximo(trecho: TrechoLocalizado, origem: LatLon): LatLon {
  const linha = trecho.linha.length > 1 ? trecho.linha : [trecho.inicio, trecho.fim];
  let melhor: { ponto: LatLon; d: number } | null = null;
  for (let i = 1; i < linha.length; i++) {
    const proj = projetarNoSegmento(origem, linha[i - 1]!, linha[i]!);
    const d = distanciaMetros(origem, proj);
    if (!melhor || d < melhor.d) melhor = { ponto: proj, d };
  }
  return melhor?.ponto ?? { lat: trecho.inicio.lat, lon: trecho.inicio.lon };
}

function formatarKm(km: number | null) {
  return km == null ? "" : ` km ${km.toFixed(3).replace(".", ",")}`;
}

/** Opções de acesso oferecidas ao usuário para um trecho. */
export function acessosDoTrecho(item: TrechoProgramado, origem: LatLon | null): PontoAcesso[] {
  const t = item.trecho;
  const lista: PontoAcesso[] = [
    {
      tipo: "inicio",
      rotulo: `Início do trecho — ${t.rodovia}${formatarKm(t.kmInicial)}`,
      lat: t.inicio.lat,
      lon: t.inicio.lon,
      km: t.kmInicial,
    },
    {
      tipo: "fim",
      rotulo: `Fim do trecho — ${t.rodovia}${formatarKm(t.kmFinal)}`,
      lat: t.fim.lat,
      lon: t.fim.lon,
      km: t.kmFinal,
    },
  ];
  if (origem && Math.abs(t.kmFinal - t.kmInicial) > 0.001) {
    const p = pontoMaisProximo(t, origem);
    const fracao =
      distanciaMetros({ lat: t.inicio.lat, lon: t.inicio.lon }, p) /
      Math.max(1, distanciaMetros({ lat: t.inicio.lat, lon: t.inicio.lon }, { lat: t.fim.lat, lon: t.fim.lon }));
    const kmEstimado = t.kmInicial + (t.kmFinal - t.kmInicial) * Math.min(1, fracao);
    lista.push({
      tipo: "proximo",
      rotulo: `Ponto mais próximo de você — ${t.rodovia}${formatarKm(kmEstimado)}`,
      lat: p.lat,
      lon: p.lon,
      km: kmEstimado,
    });
  }
  return lista;
}

/** Ponto de saída do trecho depois de percorrê-lo, a partir do acesso usado. */
function saidaDoTrecho(item: TrechoProgramado, acesso: PontoAcesso): LatLon {
  const t = item.trecho;
  const dInicio = distanciaMetros(acesso, { lat: t.inicio.lat, lon: t.inicio.lon });
  const dFim = distanciaMetros(acesso, { lat: t.fim.lat, lon: t.fim.lon });
  return dInicio <= dFim
    ? { lat: t.fim.lat, lon: t.fim.lon }
    : { lat: t.inicio.lat, lon: t.inicio.lon };
}

export type EscolhaAcesso = { itemId: string; tipo: TipoAcesso; lat: number; lon: number; km: number | null; rotulo: string };

/**
 * Sequencia os trechos partindo da posição informada, escolhendo para cada um
 * o acesso mais próximo do ponto onde o veículo estará, e mede o percurso
 * real pela malha viária. Sem OSRM, devolve a mesma ordem com distância
 * aproximada em linha reta, sinalizando `pelaEstrada: false`.
 */
export async function gerarRotaInteligente(opcoes: {
  itens: TrechoProgramado[];
  origem: LatLon;
  acessosFixos?: Record<string, EscolhaAcesso | undefined>;
  otimizarOrdem?: boolean;
}): Promise<RotaCalculada> {
  const { itens, origem } = opcoes;
  const fixos = opcoes.acessosFixos ?? {};
  const otimizar = opcoes.otimizarOrdem ?? true;

  const restantes = [...itens];
  const sequencia: Array<{ item: TrechoProgramado; acesso: PontoAcesso; saida: LatLon }> = [];
  let atual: LatLon = origem;

  const acessoEscolhido = (item: TrechoProgramado, de: LatLon): PontoAcesso => {
    const fixo = fixos[item.id];
    if (fixo) return { tipo: fixo.tipo, rotulo: fixo.rotulo, lat: fixo.lat, lon: fixo.lon, km: fixo.km };
    const opcoesAcesso = acessosDoTrecho(item, de);
    let melhor = opcoesAcesso[0]!;
    let menorDistancia = distanciaMetros(de, melhor);
    for (const acesso of opcoesAcesso.slice(1)) {
      const d = distanciaMetros(de, acesso);
      if (d < menorDistancia) {
        menorDistancia = d;
        melhor = acesso;
      }
    }
    return melhor;
  };

  // 1ª passada: vizinho mais próximo.
  while (restantes.length) {
    let indice = 0;
    if (otimizar) {
      let menor = Number.POSITIVE_INFINITY;
      restantes.forEach((item, i) => {
        const d = distanciaMetros(atual, acessoEscolhido(item, atual));
        if (d < menor) {
          menor = d;
          indice = i;
        }
      });
    }
    const item = restantes.splice(indice, 1)[0]!;
    const acesso = acessoEscolhido(item, atual);
    const saida = saidaDoTrecho(item, acesso);
    sequencia.push({ item, acesso, saida });
    atual = saida;
  }

  // 2ª passada: melhoria 2-opt para desfazer cruzamentos e idas e voltas.
  if (otimizar && sequencia.length > 2) {
    const melhorada = melhorar2opt(
      sequencia.map((s) => s.item),
      origem,
      acessoEscolhido,
    );
    sequencia.length = 0;
    let posicao: LatLon = origem;
    for (const item of melhorada) {
      const acesso = acessoEscolhido(item, posicao);
      const saida = saidaDoTrecho(item, acesso);
      sequencia.push({ item, acesso, saida });
      posicao = saida;
    }
  }

  const pontos: LatLon[] = [origem];
  for (const s of sequencia) {
    pontos.push({ lat: s.acesso.lat, lon: s.acesso.lon });
    if (distanciaMetros(s.acesso, s.saida) > 60) pontos.push(s.saida);
  }


  let pelaEstrada = false;
  let motivo: string | null = null;
  let geometria: LatLon[] = pontos;
  let distanciaTotalKm = 0;
  let tempoTotalMin = 0;
  const pernasPorParada: Array<{ distanciaKm: number; tempoMin: number } | null> = sequencia.map(
    () => null,
  );

  if (pontos.length >= 2 && pontos.length <= 60) {
    try {
      const r = await calcularPercurso({ data: { pontos, otimizar: false } });
      if (r.disponivel) {
        pelaEstrada = true;
        geometria = r.geometria;
        distanciaTotalKm = r.distanciaTotalKm;
        tempoTotalMin = r.tempoTotalMin;
        // reparte as pernas: cada parada consome a perna até o seu acesso
        let idxPerna = 0;
        sequencia.forEach((s, i) => {
          const perna = r.pernas[idxPerna];
          pernasPorParada[i] = perna ? { ...perna } : null;
          idxPerna += distanciaMetros(s.acesso, s.saida) > 60 ? 2 : 1;
        });
      } else {
        motivo = r.motivo ?? "Serviço de rotas indisponível.";
      }
    } catch (e) {
      motivo = e instanceof Error ? e.message : "Serviço de rotas indisponível.";
    }
  }

  if (!pelaEstrada) {
    let anterior: LatLon = origem;
    sequencia.forEach((s, i) => {
      const d = distanciaMetros(anterior, s.acesso) / 1000;
      pernasPorParada[i] = { distanciaKm: d, tempoMin: Math.round((d / 50) * 60) };
      distanciaTotalKm += d;
      anterior = s.saida;
    });
    tempoTotalMin = Math.round((distanciaTotalKm / 50) * 60) + sequencia.length * 20;
  }

  return {
    paradas: sequencia.map((s, i) => ({
      ordem: i + 1,
      item: s.item,
      acesso: s.acesso,
      saida: s.saida,
      distanciaKm: pernasPorParada[i]?.distanciaKm ?? null,
      tempoMin: pernasPorParada[i]?.tempoMin ?? null,
    })),
    distanciaTotalKm,
    tempoTotalMin,
    geometria,
    pelaEstrada,
    motivo,
  };
}
