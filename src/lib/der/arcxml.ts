/**
 * Leitura das respostas ArcXML do serviço cartográfico do DER-SP.
 * Módulo puro (sem rede) — usado pelo servidor.
 */
import { paraLatLon, type LatLon } from "./geo";

/** Números do serviço vêm com vírgula decimal (locale pt-BR). */
export function numeroDer(valor: string | undefined | null): number | null {
  if (valor == null) return null;
  const n = Number(String(valor).trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function erroArcxml(xml: string): string | null {
  const m = xml.match(/<ERROR[^>]*>([^<]*)<\/ERROR>/i);
  return m?.[1] ? m[1].trim() : null;
}

function atributos(tag: string): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const m of tag.matchAll(/([#A-Za-z0-9_]+)="([^"]*)"/g)) saida[m[1]!] = m[2]!;
  return saida;
}

export type FeatureDer = {
  campos: Record<string, string>;
  pontos: LatLon[];
  linhas: LatLon[][];
};

function lerCoords(bloco: string): LatLon[] {
  const pontos: LatLon[] = [];
  for (const m of bloco.matchAll(/<COORDS[^>]*>([\s\S]*?)<\/COORDS>/gi)) {
    const nums = (m[1] ?? "").trim().split(/[\s;]+/).filter(Boolean);
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = numeroDer(nums[i]);
      const y = numeroDer(nums[i + 1]);
      if (x == null || y == null) continue;
      pontos.push(paraLatLon({ x, y }));
    }
  }
  return pontos;
}

export function lerFeatures(xml: string): FeatureDer[] {
  const saida: FeatureDer[] = [];
  for (const bloco of xml.matchAll(/<FEATURE>([\s\S]*?)<\/FEATURE>/gi)) {
    const corpo = bloco[1] ?? "";
    const campos = corpo.match(/<FIELDS\s[^>]*\/>/i);
    const linhas: LatLon[][] = [];
    for (const caminho of corpo.matchAll(/<PATH>([\s\S]*?)<\/PATH>/gi)) {
      const pts = lerCoords(caminho[1] ?? "");
      if (pts.length > 1) linhas.push(pts);
    }
    const pontos = linhas.length ? [] : lerCoords(corpo);
    saida.push({ campos: campos ? atributos(campos[0]) : {}, pontos, linhas });
  }
  return saida;
}

/** Escapa valores usados dentro de cláusulas WHERE do ArcXML. */
export function escaparValor(valor: string): string {
  return valor.replace(/[<>&"']/g, " ").trim();
}
