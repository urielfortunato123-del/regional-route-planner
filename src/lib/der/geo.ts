/**
 * Conversão de coordenadas da base cartográfica do DER-SP (WebRota / ArcIMS)
 * para WGS84 (latitude e longitude) e vice-versa.
 *
 * A base do WebRota entrega coordenadas em Policônica (SAD69), com meridiano
 * central -54°, latitude de origem 0° e sem falso leste/norte — por isso os
 * valores de Y aparecem negativos (ex.: 545649,50 / -2453041,20).
 *
 * Módulo puro: sem DOM, sem rede. Usado no servidor e no navegador.
 */

const A = 6378160.0; // semi-eixo maior SAD69
const F = 1 / 298.25;
const E2 = 2 * F - F * F;
const LON0 = (-54 * Math.PI) / 180;

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export type LatLon = { lat: number; lon: number };
export type PontoDer = { x: number; y: number };

function distanciaMeridional(phi: number): number {
  const e4 = E2 * E2;
  const e6 = e4 * E2;
  return (
    A *
    ((1 - E2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi -
      ((3 * E2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) -
      ((35 * e6) / 3072) * Math.sin(6 * phi))
  );
}

function raioNormal(phi: number): number {
  return A / Math.sqrt(1 - E2 * Math.sin(phi) * Math.sin(phi));
}

/** WGS84 → coordenada projetada usada pelo DER. */
export function paraDer({ lat, lon }: LatLon): PontoDer {
  const phi = lat * RAD;
  const lam = lon * RAD - LON0;
  if (Math.abs(phi) < 1e-10) return { x: A * lam, y: 0 };
  const n = raioNormal(phi);
  const cot = 1 / Math.tan(phi);
  const e = lam * Math.sin(phi);
  return {
    x: n * cot * Math.sin(e),
    y: distanciaMeridional(phi) + n * cot * (1 - Math.cos(e)),
  };
}

/** Coordenada projetada do DER → WGS84. */
export function paraLatLon({ x, y }: PontoDer): LatLon {
  // y = M(phi) + N.cot(phi).(1 - cos E) e x = N.cot(phi).sen E
  // logo tan(E/2) = (y - M(phi)) / x  →  resolvemos phi por bisseção.
  const alvo = (phi: number) => {
    if (Math.abs(phi) < 1e-9) return -x;
    const m = distanciaMeridional(phi);
    const e = 2 * Math.atan2(y - m, x);
    const n = raioNormal(phi);
    return n * (1 / Math.tan(phi)) * Math.sin(e) - x;
  };

  let baixo = -40 * RAD;
  let alto = 6 * RAD;
  let fBaixo = alvo(baixo);
  for (let i = 0; i < 120; i++) {
    const meio = (baixo + alto) / 2;
    const fMeio = alvo(meio);
    if (fBaixo * fMeio <= 0) {
      alto = meio;
    } else {
      baixo = meio;
      fBaixo = fMeio;
    }
  }
  const phi = (baixo + alto) / 2;
  const m = distanciaMeridional(phi);
  const e = 2 * Math.atan2(y - m, x);
  const lam = Math.abs(phi) < 1e-9 ? x / A : e / Math.sin(phi);
  return { lat: phi * DEG, lon: (lam + LON0) * DEG };
}

/** Distância aproximada em metros entre dois pontos WGS84. */
export function distanciaMetros(a: LatLon, b: LatLon): number {
  const r = 6371000;
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(s)));
}
