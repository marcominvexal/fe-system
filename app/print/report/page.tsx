"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { knownEngineer, type Task } from "@/lib/store";
import type { PricingConfig } from "@/lib/pricing";
import { cycleByKey, cycleFor } from "@/lib/cycle";
import { cycleSummary, fmtDate, fmtDateTime, fmtMinutes, fmtPkr, minutesOnSite } from "@/lib/report";
import { ExponentiaLogo, OrangeMark } from "@/components/brand";

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/**
 * Printable billing-cycle report: the cycle's bill (monthly charge, visits
 * included or extra, hotel), then visits per engineer. Print → Save as PDF.
 */
function Report() {
  const params = useSearchParams();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [cfg, setCfg] = useState<PricingConfig | null>(null);
  const [failed, setFailed] = useState(false);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    Promise.all([
      fetch("/api/tasks", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch("/api/settings/pricing").then((r) => r.json()),
    ]).then(([t, p]) => { setTasks(t); setCfg(p.config); }).catch(() => setFailed(true));
  }, []);

  if (failed) return <main className="min-h-screen bg-white p-10 text-neutral-800">Could not load the report. Sign in and try again.</main>;
  if (!tasks || !cfg) return <main className="min-h-screen bg-white p-10 text-neutral-500">Preparing report…</main>;

  const startDay = cfg.contract.cycleStartDay;
  const key = params.get("cycle");
  const cycle = key && /^\d{4}-\d{2}$/.test(key) ? cycleByKey(key, startDay) : cycleFor(now, startDay);
  const s = cycleSummary(tasks, cycle, cfg.contract);
  const th = "border-b-2 border-black px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide";
  const td = "border-b border-neutral-200 px-2 py-1.5 align-top";

  return (
    <main className="min-h-screen bg-neutral-100 py-8 text-[12.5px] leading-relaxed text-black print:bg-white print:py-0"
      style={{ colorScheme: "light", fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' }}>
      <style>{`@media print { @page { size: A4; margin: 12mm; } body { background: #fff !important; } .sheet { box-shadow: none !important; } }`}</style>

      <div className="mx-auto mb-4 flex max-w-[860px] items-center justify-between px-4 print:hidden">
        <p className="text-neutral-600">Billing cycle report · {cycle.name}</p>
        <button onClick={() => window.print()} className="bg-[#ff7900] px-4 py-2 text-sm font-bold text-black hover:bg-[#f16e00]">Print / Save as PDF</button>
      </div>

      <div className="sheet mx-auto max-w-[860px] bg-white px-10 py-9 shadow-sm print:px-0 print:py-0">
        <header className="flex items-start justify-between gap-6 border-b-4 border-[#ff7900] pb-5">
          <div className="flex items-center gap-3">
            <OrangeMark size={44} />
            <div>
              <p className="text-[20px] font-bold leading-tight">Billing cycle report</p>
              <p className="text-neutral-600">{cycle.name} · {cycle.range}</p>
            </div>
          </div>
          <div className="text-right">
            <ExponentiaLogo height={28} onLight />
            <p className="mt-1 text-[11px] text-neutral-500">Prepared {fmtDateTime(new Date(now).toISOString())}</p>
          </div>
        </header>

        {/* Summary */}
        <section className="mt-5 grid grid-cols-3 gap-3">
          {[
            ...(s.contract ? [
              ["Visits", `${s.done} of ${s.committed} included`, `In-city ${s.inCity.done}/${s.inCity.committed} · Intercity ${s.interCity.done}/${s.interCity.committed}`],
              ["Extra visits", String(s.inCity.extra + s.interCity.extra), usd(s.extras)],
            ] : [
              ["Visits", String(s.done), `In-city ${s.inCity.done} · Intercity ${s.interCity.done}`],
              ["Visits at rate card", usd(s.visitsValue), s.hotel ? `plus hotel ${usd(s.hotel)}` : "No hotel stays"],
            ]),
            ["Amount to bill", usd(s.total), fmtPkr(s.totalPkr)],
          ].map(([l, v, f]) => (
            <div key={l} className="border-t-4 border-black bg-neutral-50 px-3 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-600">{l}</p>
              <p className="text-[18px] font-bold">{v}</p>
              <p className="text-[11px] text-neutral-600">{f}</p>
            </div>
          ))}
        </section>

        {/* Bill */}
        <h2 className="mt-7 text-[14px] font-bold">Bill</h2>
        <table className="mt-2 w-full border-collapse">
          <thead><tr><th className={th}>Item</th><th className={th}>Engineer</th><th className={th}>Finished</th><th className={th}>Billing</th><th className={`${th} text-right`}>USD</th></tr></thead>
          <tbody>
            {s.mrc > 0 && (
              <tr><td className={`${td} font-bold`} colSpan={3}>Monthly recurring charge · covers {s.committed} visits ({s.inCity.committed} in-city, {s.interCity.committed} intercity)</td>
                <td className={td}>Fixed</td><td className={`${td} text-right font-bold`}>{usd(s.mrc)}</td></tr>
            )}
            {s.visits.map((v) => (
              <tr key={v.task.id}>
                <td className={td}><b>{v.task.workOrder ?? v.task.id}</b><br /><span className="text-neutral-600">{v.task.endCustomer ?? v.task.title} · {v.area === "in_city" ? "In-city" : "Intercity"} · {v.task.visitDuration}</span></td>
                <td className={td}>{knownEngineer(v.task) ?? "Not received"}</td>
                <td className={td}>{fmtDate(v.cleared)}</td>
                <td className={td}>{!s.contract ? `${v.task.maintenanceLevel === "Planned Activity" ? "Planned" : "Reactive"} ${v.task.serviceLevel}` : v.included ? "Included" : "Extra visit"}{!v.billed && <><br /><span className="text-[#8a5300]">Price not confirmed</span></>}</td>
                <td className={`${td} text-right ${v.included ? "text-neutral-400" : "font-bold"}`}>{v.included ? "0" : usd(v.charge)}</td>
              </tr>
            ))}
            {s.visits.filter((v) => v.hotel > 0).map((v) => (
              <tr key={`${v.task.id}-h`}><td className={td} colSpan={2}>Hotel · {v.task.workOrder ?? v.task.id} · {v.task.hotelNights} night(s)</td>
                <td className={td}>{fmtDate(v.cleared)}</td><td className={td}>Overnight stay</td><td className={`${td} text-right font-bold`}>{usd(v.hotel)}</td></tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td className="border-t-2 border-black px-2 py-2 font-bold" colSpan={4}>Total</td><td className="border-t-2 border-black px-2 py-2 text-right text-[14px] font-bold">{usd(s.total)}</td></tr>
            <tr><td className="px-2 text-neutral-600" colSpan={4}>In Pakistani rupees at {s.usdToPkr}</td><td className="whitespace-nowrap px-2 text-right font-bold">{fmtPkr(s.totalPkr)}</td></tr>
          </tfoot>
        </table>

        {/* Engineers */}
        <h2 className="mt-7 text-[14px] font-bold">Visits by engineer</h2>
        <table className="mt-2 w-full border-collapse">
          <thead><tr><th className={th}>Engineer</th><th className={th}>Work order</th><th className={th}>Arrived</th><th className={th}>Left</th><th className={`${th} text-right`}>On site</th></tr></thead>
          <tbody>
            {s.visits.slice().sort((a, b) => (knownEngineer(a.task) ?? "~").localeCompare(knownEngineer(b.task) ?? "~")).map((v) => (
              <tr key={v.task.id}>
                <td className={td}>{knownEngineer(v.task) ?? "Not received"}</td>
                <td className={td}>{v.task.workOrder ?? v.task.id}</td>
                <td className={td}>{fmtDateTime(v.task.checkInTime) || "—"}</td>
                <td className={td}>{fmtDateTime(v.task.checkOutTime) || "—"}</td>
                <td className={`${td} text-right`}>{fmtMinutes(minutesOnSite(v.task)) || "—"}</td>
              </tr>
            ))}
            {!s.visits.length && <tr><td className={td} colSpan={5}>No visits closed in this cycle.</td></tr>}
          </tbody>
        </table>

        <p className="mt-8 border-t border-neutral-200 pt-3 text-[10.5px] text-neutral-500">
          {s.contract
            ? <>Monthly charge {usd(cfg.contract.mrcUSD)} covers {s.committed} visits; additional visits are charged at the agreed rate card; overnight stays are {usd(cfg.contract.hotelPerNightUSD)} per night.</>
            : <>Each visit is charged at the agreed rate card by service level, distance from the nearest Multinet data centre and visit length; overnight stays are {usd(cfg.contract.hotelPerNightUSD)} per night.</>}
          FE Management System · Orange Business · Powered by Exponentia Global · Made by Invexal
        </p>
      </div>
    </main>
  );
}

export default function ReportPrint() {
  return <Suspense><Report /></Suspense>;
}
