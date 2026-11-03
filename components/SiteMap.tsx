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
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
export { esc as escapeHtml };

// Never frame more than Pakistan
const PAKISTAN: [[number, number], [number, number]] = [[23.6, 60.9], [37.1, 77.8]];

function drawLayer(L: typeof import("leaflet"), m: import("leaflet").Map, g: import("leaflet").LayerGroup,
  points: MapPoint[], centres: DataCentre[], roadFactor: number) {
  g.clearLayers();
  const f = roadFactor > 0 ? roadFactor : 1;
  for (const c of centres) {
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
    L.circle([c.lat, c.lng], { radius: (100 / f) * 1000, color: "#ff7900", weight: 1, opacity: 0.6, dashArray: "4 4", fillColor: "#ff7900", fillOpacity: 0.05 }).addTo(g);
    L.circle([c.lat, c.lng], { radius: (50 / f) * 1000, color: "#ff7900", weight: 1.5, opacity: 0.9, fillColor: "#ff7900", fillOpacity: 0.1 }).addTo(g);
    L.marker([c.lat, c.lng], {
      icon: L.divIcon({
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
    L.circleMarker([p.lat, p.lng], { radius: 3, color: "#000", weight: 1, fillColor: p.color, fillOpacity: 1 }).addTo(g);
    const text = p.color === "#000000" ? "#fff" : "#000";
    L.marker([p.lat, p.lng], {
      icon: L.divIcon({
        className: "",
        html: `<div style="position:relative;width:0;height:0">
          <div style="position:absolute;left:2px;top:-14px;width:16px;height:1px;background:#000;transform:rotate(-45deg);transform-origin:left center"></div>
          <div style="position:absolute;left:12px;top:-36px;min-width:24px;height:24px;padding:0 6px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;background:${p.color};color:${text};font:700 12px/1 Helvetica,Arial,sans-serif;border:${p.ring ? "3px solid #cd3c14" : "2px solid #fff"};box-shadow:0 1px 4px rgba(0,0,0,.35);white-space:nowrap;cursor:pointer">${p.count ?? 1}</div>
        </div>`,
        iconSize: [0, 0], iconAnchor: [0, 0],
      }),
      zIndexOffset: 2000,
    }).bindTooltip(esc(p.label), { direction: "top", offset: [24, -36] })
      .bindPopup(p.html, { minWidth: 240, maxHeight: 320, offset: [24, -30] })
      .addTo(g);
  }
  const all = [...centres.filter((c) => Number.isFinite(c.lat)).map((c) => [c.lat, c.lng] as [number, number]), ...points.map((p) => [p.lat, p.lng] as [number, number])];
  const pakistan = L.latLngBounds(PAKISTAN);
  const target = all.length ? L.latLngBounds(all).pad(0.2) : pakistan;
  m.fitBounds(pakistan.contains(target) ? target : pakistan, { maxZoom: 9 });
}

/**
 * Map of Pakistan with Multinet's data centres, their distance-band rings and
 * job sites. Ring radii are the straight-line equivalent of 50 km and 100 km
 * by road, so a site inside the inner ring is billed as under 50 km.
 */
export default function SiteMap({ points, centres, roadFactor, onOpen, height = 420 }: {
  points: MapPoint[]; centres: DataCentre[]; roadFactor: number; onOpen?: (id: string) => void; height?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  const layer = useRef<import("leaflet").LayerGroup | null>(null);
  const openRef = useRef(onOpen);
  const data = useRef({ points, centres, roadFactor });
  useEffect(() => { openRef.current = onOpen; data.current = { points, centres, roadFactor }; });

  // Create the map once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current || map.current) return;
      const m = L.map(el.current, { zoomControl: true, scrollWheelZoom: false, attributionControl: true, minZoom: 4 }).setView([30.2, 69.3], 5);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(m);
      // Grey base map, so Orange markers carry the colour
      const tiles = m.getPane("tilePane");
      if (tiles) tiles.style.filter = "grayscale(1) brightness(1.04) contrast(0.92)";
      map.current = m;
      layer.current = L.layerGroup().addTo(m);
      m.on("popupopen", (e) => {
        const btn = (e.popup.getElement() as HTMLElement | undefined)?.querySelector<HTMLButtonElement>("[data-open]");
        btn?.addEventListener("click", () => openRef.current?.(btn.dataset.open!));
      });
      const d = data.current;
      drawLayer(L, m, layer.current, d.points, d.centres, d.roadFactor);
    })();
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
  }, []);

  // Redraw markers when the data changes
  useEffect(() => {
    (async () => {
      if (!map.current || !layer.current) return;
      drawLayer((await import("leaflet")).default, map.current, layer.current, points, centres, roadFactor);
    })();
  }, [points, centres, roadFactor]);

  return <div ref={el} style={{ height }} className="z-0 w-full border border-line bg-[#f2f2f2]" role="region" aria-label="Map of job sites and Multinet data centres" />;
}
