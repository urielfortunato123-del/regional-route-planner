/**
 * Mapa interativo (Leaflet + OpenStreetMap) — somente navegador.
 * Carregado por lazy import a partir de src/routes/mapa.tsx.
 */
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MarcadorMapa = {
  id: string;
  lat: number;
  lon: number;
  rotulo: string;
  detalhe?: string;
  cor?: string;
  numero?: number;
  destacado?: boolean;
};

export type LinhaMapa = {
  id: string;
  pontos: Array<{ lat: number; lon: number }>;
  cor?: string;
  tracejada?: boolean;
};

export type FocoMapa = { lat: number; lon: number; zoom?: number; chave: string };

type Props = {
  marcadores: MarcadorMapa[];
  linhas: LinhaMapa[];
  posicaoUsuario?: { lat: number; lon: number; precisao?: number } | null;
  foco?: FocoMapa | null;
  aoClicar?: (p: { lat: number; lon: number }) => void;
  aoSelecionar?: (id: string) => void;
  altura?: string;
};

const CENTRO_SP: [number, number] = [-22.6, -48.8];

function icone(m: MarcadorMapa) {
  const cor = m.cor ?? "#1d4ed8";
  const conteudo = m.numero != null ? String(m.numero) : "";
  return L.divIcon({
    className: "",
    html: `<div style="
      width:26px;height:26px;border-radius:50% 50% 50% 4px;transform:rotate(-45deg);
      background:${cor};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45);
      display:flex;align-items:center;justify-content:center;
      ${m.destacado ? "outline:3px solid rgba(250,204,21,.9);outline-offset:1px;" : ""}">
      <span style="transform:rotate(45deg);color:#fff;font:700 11px/1 system-ui,sans-serif">${conteudo}</span>
    </div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  });
}

export default function MapaLeaflet({
  marcadores,
  linhas,
  posicaoUsuario,
  foco,
  aoClicar,
  aoSelecionar,
  altura = "60vh",
}: Props) {
  const div = useRef<HTMLDivElement | null>(null);
  const mapa = useRef<L.Map | null>(null);
  const camadaMarcadores = useRef<L.LayerGroup | null>(null);
  const camadaLinhas = useRef<L.LayerGroup | null>(null);
  const camadaUsuario = useRef<L.LayerGroup | null>(null);
  const cliqueRef = useRef(aoClicar);
  const selecionarRef = useRef(aoSelecionar);
  cliqueRef.current = aoClicar;
  selecionarRef.current = aoSelecionar;

  useEffect(() => {
    if (!div.current || mapa.current) return;
    const m = L.map(div.current, { zoomControl: true, attributionControl: true }).setView(
      CENTRO_SP,
      7,
    );
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; colaboradores do <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
    }).addTo(m);
    camadaLinhas.current = L.layerGroup().addTo(m);
    camadaMarcadores.current = L.layerGroup().addTo(m);
    camadaUsuario.current = L.layerGroup().addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) =>
      cliqueRef.current?.({ lat: e.latlng.lat, lon: e.latlng.lng }),
    );
    mapa.current = m;
    setTimeout(() => m.invalidateSize(), 120);
    return () => {
      m.remove();
      mapa.current = null;
    };
  }, []);

  useEffect(() => {
    const grupo = camadaMarcadores.current;
    if (!grupo) return;
    grupo.clearLayers();
    for (const m of marcadores) {
      const marcador = L.marker([m.lat, m.lon], { icon: icone(m) })
        .bindPopup(
          `<strong>${m.rotulo}</strong>${m.detalhe ? `<br/><span style="font-size:12px">${m.detalhe}</span>` : ""}`,
        )
        .on("click", () => selecionarRef.current?.(m.id));
      grupo.addLayer(marcador);
    }
  }, [marcadores]);

  useEffect(() => {
    const grupo = camadaLinhas.current;
    if (!grupo) return;
    grupo.clearLayers();
    for (const linha of linhas) {
      if (linha.pontos.length < 2) continue;
      grupo.addLayer(
        L.polyline(
          linha.pontos.map((p) => [p.lat, p.lon] as [number, number]),
          {
            color: linha.cor ?? "#dc2626",
            weight: 5,
            opacity: 0.85,
            dashArray: linha.tracejada ? "8 8" : undefined,
          },
        ),
      );
    }
  }, [linhas]);

  useEffect(() => {
    const grupo = camadaUsuario.current;
    if (!grupo) return;
    grupo.clearLayers();
    if (!posicaoUsuario) return;
    grupo.addLayer(
      L.circleMarker([posicaoUsuario.lat, posicaoUsuario.lon], {
        radius: 7,
        color: "#fff",
        weight: 2,
        fillColor: "#0ea5e9",
        fillOpacity: 1,
      }).bindPopup("Minha localização"),
    );
    if (posicaoUsuario.precisao) {
      grupo.addLayer(
        L.circle([posicaoUsuario.lat, posicaoUsuario.lon], {
          radius: posicaoUsuario.precisao,
          color: "#0ea5e9",
          weight: 1,
          fillOpacity: 0.08,
        }),
      );
    }
  }, [posicaoUsuario]);

  useEffect(() => {
    if (!mapa.current || !foco) return;
    mapa.current.flyTo([foco.lat, foco.lon], foco.zoom ?? 14, { duration: 0.8 });
  }, [foco?.chave]);

  return <div ref={div} style={{ height: altura }} className="w-full rounded-xl" />;
}
