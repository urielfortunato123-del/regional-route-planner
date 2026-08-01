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

export type LinhaDerMapa = {
  codigo: string;
  nome: string | null;
  classe: string | null;
  pista: string | null;
  extensao: number | null;
  pontos: Array<{ lat: number; lon: number }>;
};

export type MarcoDerMapa = { codigo: string; km: number; lat: number; lon: number };

export type CliqueRodoviaDer = {
  rodovia: LinhaDerMapa;
  lat: number;
  lon: number;
};

export type AreaMapa = {
  bbox: { sul: number; oeste: number; norte: number; leste: number };
  zoom: number;
};

type Props = {
  marcadores: MarcadorMapa[];
  linhas: LinhaMapa[];
  posicaoUsuario?: { lat: number; lon: number; precisao?: number } | null;
  foco?: FocoMapa | null;
  aoClicar?: (p: { lat: number; lon: number }) => void;
  aoSelecionar?: (id: string) => void;
  altura?: string;
  /** Camadas técnicas oficiais do DER-SP. */
  derRodovias?: LinhaDerMapa[];
  derMarcos?: MarcoDerMapa[];
  derLimite?: Array<Array<{ lat: number; lon: number }>>;
  mostrarDerRodovias?: boolean;
  mostrarDerMarcos?: boolean;
  mostrarDerLimite?: boolean;
  aoMover?: (area: AreaMapa) => void;
  aoClicarRodoviaDer?: (c: CliqueRodoviaDer) => void;
  aoClicarMarcoDer?: (m: MarcoDerMapa) => void;
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

/** Cor por classe oficial da malha DER-SP. */
function corClasse(classe: string | null) {
  const c = (classe ?? "").toLowerCase();
  if (c.includes("acesso")) return "#f97316";
  if (c.includes("municipal")) return "#64748b";
  if (c.includes("federal")) return "#065f46";
  return "#1e3a8a";
}

export default function MapaLeaflet({
  marcadores,
  linhas,
  posicaoUsuario,
  foco,
  aoClicar,
  aoSelecionar,
  altura = "60vh",
  derRodovias = [],
  derMarcos = [],
  derLimite = [],
  mostrarDerRodovias = true,
  mostrarDerMarcos = true,
  mostrarDerLimite = true,
  aoMover,
  aoClicarRodoviaDer,
  aoClicarMarcoDer,
}: Props) {
  const div = useRef<HTMLDivElement | null>(null);
  const mapa = useRef<L.Map | null>(null);
  const camadaMarcadores = useRef<L.LayerGroup | null>(null);
  const camadaLinhas = useRef<L.LayerGroup | null>(null);
  const camadaUsuario = useRef<L.LayerGroup | null>(null);
  const camadaDerRodovias = useRef<L.LayerGroup | null>(null);
  const camadaDerMarcos = useRef<L.LayerGroup | null>(null);
  const camadaDerLimite = useRef<L.LayerGroup | null>(null);
  const cliqueRef = useRef(aoClicar);
  const selecionarRef = useRef(aoSelecionar);
  const moverRef = useRef(aoMover);
  const cliqueRodoviaRef = useRef(aoClicarRodoviaDer);
  const cliqueMarcoRef = useRef(aoClicarMarcoDer);
  cliqueRef.current = aoClicar;
  selecionarRef.current = aoSelecionar;
  moverRef.current = aoMover;
  cliqueRodoviaRef.current = aoClicarRodoviaDer;
  cliqueMarcoRef.current = aoClicarMarcoDer;

  useEffect(() => {
    if (!div.current || mapa.current) return;
    const m = L.map(div.current, { zoomControl: true, attributionControl: true }).setView(
      CENTRO_SP,
      7,
    );
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; colaboradores do <a href="https://www.openstreetmap.org/">OpenStreetMap</a> (mapa-base) &middot; malha rodoviária, marcos e regionais: DER-SP (WebRota)',
    }).addTo(m);
    m.createPane("der-limite").style.zIndex = "380";
    m.createPane("der-rodovias").style.zIndex = "400";
    m.createPane("der-marcos").style.zIndex = "420";
    camadaDerLimite.current = L.layerGroup([], { pane: "der-limite" }).addTo(m);
    camadaDerRodovias.current = L.layerGroup([], { pane: "der-rodovias" }).addTo(m);
    camadaDerMarcos.current = L.layerGroup([], { pane: "der-marcos" }).addTo(m);
    camadaLinhas.current = L.layerGroup().addTo(m);
    camadaMarcadores.current = L.layerGroup().addTo(m);
    camadaUsuario.current = L.layerGroup().addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) =>
      cliqueRef.current?.({ lat: e.latlng.lat, lon: e.latlng.lng }),
    );
    const avisarArea = () => {
      const b = m.getBounds();
      moverRef.current?.({
        bbox: { sul: b.getSouth(), oeste: b.getWest(), norte: b.getNorth(), leste: b.getEast() },
        zoom: m.getZoom(),
      });
    };
    m.on("moveend", avisarArea);
    mapa.current = m;
    setTimeout(() => {
      m.invalidateSize();
      avisarArea();
    }, 120);
    return () => {
      m.remove();
      mapa.current = null;
    };
  }, []);

  // malha rodoviária oficial DER-SP
  useEffect(() => {
    const grupo = camadaDerRodovias.current;
    if (!grupo) return;
    grupo.clearLayers();
    if (!mostrarDerRodovias) return;
    for (const r of derRodovias) {
      if (r.pontos.length < 2) continue;
      const dupla = (r.pista ?? "").toLowerCase().includes("dupl");
      const linha = L.polyline(
        r.pontos.map((p) => [p.lat, p.lon] as [number, number]),
        {
          pane: "der-rodovias",
          color: corClasse(r.classe),
          weight: dupla ? 6 : 4,
          opacity: 0.9,
          ...(dupla ? {} : {}),
        },
      );
      linha.on("click", (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        cliqueRodoviaRef.current?.({ rodovia: r, lat: e.latlng.lat, lon: e.latlng.lng });
      });
      linha.bindTooltip(`${r.codigo}${r.nome ? ` — ${r.nome}` : ""}`, { sticky: true });
      grupo.addLayer(linha);
    }
  }, [derRodovias, mostrarDerRodovias]);

  // marcos quilométricos oficiais
  useEffect(() => {
    const grupo = camadaDerMarcos.current;
    if (!grupo) return;
    grupo.clearLayers();
    if (!mostrarDerMarcos) return;
    for (const marco of derMarcos) {
      const ponto = L.marker([marco.lat, marco.lon], {
        pane: "der-marcos",
        icon: L.divIcon({
          className: "",
          html: `<div style="display:flex;align-items:center;gap:3px">
            <span style="width:9px;height:9px;border-radius:2px;background:#facc15;border:1.5px solid #1e293b"></span>
            <span style="font:700 10px/1 system-ui,sans-serif;color:#0f172a;background:rgba(255,255,255,.85);padding:1px 3px;border-radius:3px">km ${String(marco.km).replace(".", ",")}</span>
          </div>`,
          iconSize: [70, 14],
          iconAnchor: [5, 7],
        }),
      });
      ponto.on("click", (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        cliqueMarcoRef.current?.(marco);
      });
      grupo.addLayer(ponto);
    }
  }, [derMarcos, mostrarDerMarcos]);

  // limite oficial da regional
  useEffect(() => {
    const grupo = camadaDerLimite.current;
    if (!grupo) return;
    grupo.clearLayers();
    if (!mostrarDerLimite) return;
    for (const anel of derLimite) {
      if (anel.length < 3) continue;
      grupo.addLayer(
        L.polygon(
          anel.map((p) => [p.lat, p.lon] as [number, number]),
          {
            pane: "der-limite",
            color: "#0f766e",
            weight: 2,
            dashArray: "6 6",
            fillColor: "#14b8a6",
            fillOpacity: 0.05,
            interactive: false,
          },
        ),
      );
    }
  }, [derLimite, mostrarDerLimite]);


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
