"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { DataCentre } from "@/lib/geo";

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  color: string;        // badge fill
  ring?: boolean;       // red outline (e.g. an engineer is late)
  count?: number;       // jobs at this spot, shown on the badge
  label: string;        // tooltip
  html: string;         // popup body (already escaped)
  link?: { lat: number; lng: number; km: number };  // line to the nearest data centre
}

export interface MapLabel { name: string; lat: number; lng: number; strong?: boolean }

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
export { esc as escapeHtml };

// Pakistan, with a little room around it
const PAKISTAN: [[number, number], [number, number]] = [[23.4, 60.7], [37.2, 77.9]];
const PROVINCE_LABELS: MapLabel[] = [
  { name: "Punjab", lat: 30.9, lng: 72.4 },
  { name: "Sindh", lat: 26.1, lng: 68.6 },
  { name: "Balochistan", lat: 28.2, lng: 65.4 },
  { name: "Khyber Pakhtunkhwa", lat: 34.6, lng: 71.2 },
  { name: "Gilgit-Baltistan", lat: 35.9, lng: 74.9 },
];

type L = typeof import("leaflet");

function label(Lf: L, l: MapLabel, kind: "city" | "province") {
  const style = kind === "province"
    ? "font:600 11px/1 Helvetica,Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#a3a3a3;white-space:nowrap;transform:translate(-50%,-50%)"
    : `font:${l.strong ? 700 : 400} 12px/1 Helvetica,Arial,sans-serif;color:${l.strong ? "#000" : "#595959"};white-space:nowrap;transform:translate(8px,-50%);text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff`;
  const dot = kind === "city" ? `<div style="position:absolute;left:-3px;top:-3px;width:6px;height:6px;border-radius:50%;background:${l.strong ? "#000" : "#8a8a8a"}"></div>` : "";
  return Lf.marker([l.lat, l.lng], {
    interactive: false, keyboard: false,
    icon: Lf.divIcon({ className: "", html: `<div style="position:relative;width:0;height:0">${dot}<div style="position:absolute;left:0;top:0;${style}">${esc(l.name)}</div></div>`, iconSize: [0, 0] }),
  });
}

function drawLayer(Lf: L, m: import("leaflet").Map, g: import("leaflet").LayerGroup,
  points: MapPoint[], centres: DataCentre[], roadFactor: number, cities: MapLabel[]) {
  g.clearLayers();
  const f = roadFactor > 0 ? roadFactor : 1;

  // Reference cities first, so badges and data centres sit on top
  for (const c of cities) label(Lf, c, "city").addTo(g);

  for (const c of centres) {
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
    Lf.circle([c.lat, c.lng], { radius: (100 / f) * 1000, color: "#ff7900", weight: 1, opacity: 0.7, dashArray: "4 4", fillColor: "#ff7900", fillOpacity: 0.05, interactive: false }).addTo(g);
    Lf.circle([c.lat, c.lng], { radius: (50 / f) * 1000, color: "#ff7900", weight: 1.5, opacity: 0.9, fillColor: "#ff7900", fillOpacity: 0.12, interactive: false }).addTo(g);
  }

  // Distance lines from each city's jobs to the nearest data centre
  for (const p of points) {
    if (!p.link) continue;
    const line = Lf.polyline([[p.lat, p.lng], [p.link.lat, p.link.lng]], { color: "#000", weight: 1.5, opacity: 0.55, dashArray: "2 5", interactive: false }).addTo(g);
    if (p.link.km > 50) line.bindTooltip(`${p.link.km} km`, { permanent: true, direction: "center", className: "fe-km-label" });
  }

  for (const c of centres) {
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
    Lf.marker([c.lat, c.lng], {
      icon: Lf.divIcon({
        className: "",
        html: '<div style="width:16px;height:16px;background:#000;border:3px solid #ff7900;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>',
        iconSize: [16, 16], iconAnchor: [8, 8],
      }),
      zIndexOffset: 1000,
    }).bindTooltip(esc(c.name), { direction: "top", offset: [0, -10] })
      .bindPopup(`<b>${esc(c.name)}</b><br><span style="color:#595959">Multinet data centre. Inner ring: under 50 km by road. Outer ring: 50–100 km.</span>`)
      .addTo(g);
  }

  for (const p of points) {
    // Exact spot, then a numbered badge up and to the right so it never covers a data centre
    Lf.circleMarker([p.lat, p.lng], { radius: 3, color: "#000", weight: 1, fillColor: p.color, fillOpacity: 1, interactive: false }).addTo(g);
    const text = p.color === "#000000" ? "#fff" : "#000";
    Lf.marker([p.lat, p.lng], {
      icon: Lf.divIcon({
        className: "",
        html: `<div style="position:relative;width:0;height:0">
          <div style="position:absolute;left:2px;top:-14px;width:16px;height:1px;background:#000;transform:rotate(-45deg);transform-origin:left center"></div>
          <div style="position:absolute;left:12px;top:-36px;min-width:26px;height:26px;padding:0 7px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;background:${p.color};color:${text};font:700 13px/1 Helvetica,Arial,sans-serif;border:${p.ring ? "3px solid #cd3c14" : "2px solid #fff"};box-shadow:0 1px 4px rgba(0,0,0,.35);white-space:nowrap;cursor:pointer">${p.count ?? 1}</div>
        </div>`,
        iconSize: [0, 0], iconAnchor: [0, 0],
      }),
      zIndexOffset: 2000,
    }).bindTooltip(esc(p.label), { direction: "top", offset: [25, -38] })
      .bindPopup(p.html, { minWidth: 250, maxHeight: 340, offset: [25, -32] })
      .addTo(g);
  }
}

/**
 * Map of Pakistan's provinces (no third-party map tiles) with Multinet's
 * data centres, their distance-band rings, reference cities and job sites.
 * Ring radii are the straight-line equivalent of 50 km and 100 km by road,
 * so a site inside the inner ring is billed as under 50 km.
 */
export default function SiteMap({ points, centres, roadFactor, cities, onOpen, height = 480 }: {
  points: MapPoint[]; centres: DataCentre[]; roadFactor: number; cities: MapLabel[];
  onOpen?: (id: string) => void; height?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  const layer = useRef<import("leaflet").LayerGroup | null>(null);
  const openRef = useRef(onOpen);
  const data = useRef({ points, centres, roadFactor, cities });
  useEffect(() => { openRef.current = onOpen; data.current = { points, centres, roadFactor, cities }; });

  // Create the map once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const Lf = (await import("leaflet")).default;
      if (cancelled || !el.current || map.current) return;
      const m = Lf.map(el.current, {
        zoomControl: true, scrollWheelZoom: false, attributionControl: false, zoomSnap: 0.25,
        minZoom: 4.5, maxZoom: 11, maxBounds: [[20, 56], [40, 82]], maxBoundsViscosity: 0.8,
      });
      map.current = m;
      m.fitBounds(Lf.latLngBounds(PAKISTAN), { padding: [8, 8] });

      // Provinces from a bundled outline
      try {
        const shapes = await (await fetch("/geo/pakistan-provinces.json")).json();
        if (cancelled) return;
        Lf.geoJSON(shapes, { interactive: false, style: { color: "#bdbdbd", weight: 1, fillColor: "#ffffff", fillOpacity: 1 } }).addTo(m);
        for (const p of PROVINCE_LABELS) label(Lf, p, "province").addTo(m);
      } catch { /* the map still works without the outline */ }

      layer.current = Lf.layerGroup().addTo(m);
      m.on("popupopen", (e) => {
        (e.popup.getElement() as HTMLElement | undefined)?.querySelectorAll<HTMLButtonElement>("[data-open]")
          .forEach((btn) => btn.addEventListener("click", () => openRef.current?.(btn.dataset.open!)));
      });
      const d = data.current;
      drawLayer(Lf, m, layer.current, d.points, d.centres, d.roadFactor, d.cities);
    })();
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
  }, []);

  // Redraw markers when the data changes
  useEffect(() => {
    (async () => {
      if (!map.current || !layer.current) return;
      drawLayer((await import("leaflet")).default, map.current, layer.current, points, centres, roadFactor, cities);
    })();
  }, [points, centres, roadFactor, cities]);

  const reset = async () => {
    if (!map.current) return;
    const Lf = (await import("leaflet")).default;
    map.current.closePopup();
    map.current.fitBounds(Lf.latLngBounds(PAKISTAN), { padding: [8, 8] });
  };

  return (
    <div className="relative">
      <style>{`.fe-km-label{background:#000;color:#fff;border:0;border-radius:0;padding:2px 6px;font:700 11px/1.2 Helvetica,Arial,sans-serif;box-shadow:none}.fe-km-label::before{display:none}.leaflet-container{background:#eef1f4;font-family:Helvetica,Arial,sans-serif}`}</style>
      <div ref={el} style={{ height }} className="z-0 w-full border border-line" role="region" aria-label="Map of Pakistan with job sites and Multinet data centres" />
      <button type="button" onClick={reset}
        className="absolute right-3 top-3 z-[500] border border-black bg-white px-3 py-1.5 text-[12px] font-bold text-black hover:bg-black hover:text-white">
        Reset view
      </button>
    </div>
  );
}
