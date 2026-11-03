"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { knownEngineer, type Task } from "@/lib/store";
import { placeSite, type DataCentre } from "@/lib/geo";
import { inCycle, type Cycle } from "@/lib/cycle";
import { clearedAt, plainStatus } from "@/lib/report";
import { stages } from "@/lib/workflow";
import { Panel, Segmented, cx } from "./ui";
import type { MapPoint } from "./SiteMap";

// Leaflet needs the browser, so the map loads on the client only
const SiteMap = dynamic(() => import("./SiteMap"), {
  ssr: false,
  loading: () => <div style={{ height: 420 }} className="grid w-full place-items-center border border-line bg-[#f2f2f2] text-[13px] text-fg-subtle">Loading map…</div>,
});

type View = "open" | "cycle" | "all";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const isOpen = (t: Task) => ["assigned", "accepted", "in_progress", "completed"].includes(t.status);
const isLate = (t: Task) => isOpen(t) && stages(t).some((s) => s.state === "late");
const BAND_TEXT: Record<string, string> = { "<50km": "Under 50 km", "50-100km": "50–100 km", ">100km": "Over 100 km" };

/** Where the work is: job sites, Multinet data centres and their distance bands. */
export function WorkMap({ tasks, cycle, centres, roadFactor }: {
  tasks: Task[]; cycle: Cycle; centres: DataCentre[]; roadFactor: number;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("cycle");

  const shown = useMemo(() => tasks.filter((t) =>
    view === "all" ? true
      : view === "open" ? isOpen(t)
        : t.status !== "cancelled" && (isOpen(t) || inCycle(clearedAt(t), cycle) || inCycle(t.openedAt ?? t.createdAt, cycle))), [tasks, view, cycle]);

  const placed = useMemo(() => shown.flatMap((t) => {
    const at = placeSite({ siteId: t.siteId, location: [t.location, t.title].filter(Boolean).join(" · ") });
    return at ? [{ t, ...at }] : [];
  }), [shown]);

  // One badge per city: the most urgent state sets its colour, the popup lists every job there
  const points: MapPoint[] = useMemo(() => {
    const groups = new Map<string, typeof placed>();
    for (const p of placed) groups.set(p.city, [...(groups.get(p.city) ?? []), p]);
    return [...groups].map(([city, list]) => {
      const tasksHere = list.map((x) => x.t).sort((x, y) => Number(isOpen(y)) - Number(isOpen(x)));
      const late = tasksHere.filter(isLate).length;
      const open = tasksHere.filter(isOpen).length;
      const rows = tasksHere.slice(0, 12).map((t) => {
        const engineer = knownEngineer(t);
        const status = isLate(t) ? "Engineer late" : plainStatus(t);
        return `<div style="padding:7px 0;border-top:1px solid #e2e2e2">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline">
            <b>${esc(t.workOrder ?? t.id)}</b>
            <button data-open="${esc(t.id)}" style="border:1px solid #000;background:#fff;padding:1px 8px;font-weight:700;cursor:pointer">Open ›</button>
          </div>
          <div style="color:#595959">${esc(t.endCustomer ?? t.title)}${t.siteId ? " · " + esc(t.siteId) : ""}</div>
          <div>${esc(engineer ?? "Engineer not named yet")} · <b style="color:${isLate(t) ? "#b0300c" : "#000"}">${esc(status)}</b></div>
        </div>`;
      }).join("");
      const band = BAND_TEXT[tasksHere[0].distanceBand] ?? tasksHere[0].distanceBand;
      return {
        id: city,
        lat: list.reduce((n, x) => n + x.lat, 0) / list.length,
        lng: list.reduce((n, x) => n + x.lng, 0) / list.length,
        color: open ? "#ff7900" : "#000000",
        ring: late > 0,
        count: tasksHere.length,
        label: `${city}: ${tasksHere.length} job${tasksHere.length === 1 ? "" : "s"}${open ? `, ${open} open` : ""}${late ? `, ${late} late` : ""}`,
        html: `<div style="font:13px/1.45 'Helvetica Neue',Helvetica,Arial,sans-serif;color:#000">
          <b style="font-size:15px">${esc(city)}</b> <span style="color:#595959">· ${esc(band)} from Multinet</span>
          <div style="color:#595959;margin-bottom:2px">${tasksHere.length} job${tasksHere.length === 1 ? "" : "s"}${open ? ` · ${open} open` : ""}</div>
          ${rows}${tasksHere.length > 12 ? `<div style="padding-top:6px;color:#595959">and ${tasksHere.length - 12} more</div>` : ""}
        </div>`,
      };
    });
  }, [placed]);

  // Side lists: visits by city and by engineer, for what is on the map
  const byCity = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of placed) m.set(p.city, (m.get(p.city) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [placed]);
  const byEngineer = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of shown) for (const n of (knownEngineer(t) ?? "Not named yet").split(/,\s*/)) m.set(n, (m.get(n) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [shown]);
  const max = Math.max(1, ...byCity.map(([, n]) => n));
  const unplaced = shown.length - placed.length;

  return (
    <Panel title="Where the work is" subtitle="Job sites and Multinet data centres. Rings show the distance bands: inside the solid ring is under 50 km by road, inside the dashed ring 50–100 km."
      actions={<Segmented<View> label="Jobs on the map" value={view} onChange={setView}
        options={[{ value: "open", label: "Open now" }, { value: "cycle", label: "This cycle" }, { value: "all", label: "All" }]} />}
      className="mb-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <SiteMap points={points} centres={centres} roadFactor={roadFactor} onOpen={(id) => router.push(`/admin/jobs/${id}`)} />
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-fg-subtle">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 border-2 border-brand bg-black" />Multinet data centre</span>
            <span className="flex items-center gap-1.5"><span className="grid h-4 min-w-4 place-items-center bg-brand px-1 text-[10px] font-bold text-black">2</span>Jobs in a city, some open</span>
            <span className="flex items-center gap-1.5"><span className="grid h-4 min-w-4 place-items-center border-2 border-crit bg-brand px-1 text-[10px] font-bold text-black">1</span>Engineer late</span>
            <span className="flex items-center gap-1.5"><span className="grid h-4 min-w-4 place-items-center bg-black px-1 text-[10px] font-bold text-white">5</span>All finished</span>
            <span className="ml-auto">Sites are placed by city{unplaced > 0 ? ` · ${unplaced} without a known city not shown` : ""}</span>
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <p className="mb-2 text-[13px] font-bold">Jobs by city</p>
            {byCity.length ? (
              <ul className="space-y-2">
                {byCity.map(([city, n]) => (
                  <li key={city}>
                    <div className="flex justify-between text-[13px]"><span>{city}</span><span className="num font-bold">{n}</span></div>
                    <div className="mt-1 h-1.5 bg-black/[0.08]"><div className="h-full bg-brand" style={{ width: `${(n / max) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-[13px] text-fg-subtle">No jobs in this view.</p>}
          </div>
          <div>
            <p className="mb-2 text-[13px] font-bold">Engineers</p>
            <ul className="divide-y divide-line border-y border-line">
              {byEngineer.map(([name, n]) => (
                <li key={name} className="flex justify-between py-1.5 text-[13px]">
                  <span className={cx(name === "Not named yet" ? "text-warn-fg" : "text-fg")}>{name}</span>
                  <span className="num text-fg-subtle">{n} job{n === 1 ? "" : "s"}</span>
                </li>
              ))}
              {!byEngineer.length && <li className="py-2 text-[13px] text-fg-subtle">None in this view.</li>}
            </ul>
          </div>
        </div>
      </div>
    </Panel>
  );
}
