"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { knownEngineer } from "@/lib/store";
import { useStore } from "@/lib/storeContext";
import { getPricing } from "@/lib/pricing";
import { recentCycles } from "@/lib/cycle";
import {
  cycleBillCsv, cycleSummary, engineersCsv, fmtDate, fmtMinutes, fmtPkr, workOrdersCsv, inCycleTask,
} from "@/lib/report";
import { fmtUSD } from "@/lib/analytics";
import { downloadText } from "@/components/billing";
import { Icons } from "@/components/icons";
import { Panel, Select, cx } from "@/components/ui";

function Action({ onClick, href, children }: { onClick?: () => void; href?: string; children: React.ReactNode }) {
  const cls = "inline-flex h-9 items-center gap-1.5 border border-black bg-white px-3.5 text-[13px] font-bold text-black transition-colors hover:bg-black hover:text-white disabled:opacity-40";
  return href
    ? <Link href={href} target="_blank" className={cls}>{children}</Link>
    : <button onClick={onClick} className={cls}>{children}</button>;
}

export default function ReportsPage() {
  const { tasks } = useStore();
  const contract = getPricing().contract;
  const [now] = useState(() => Date.now());
  const cycles = useMemo(() => recentCycles(12, contract?.cycleStartDay ?? 25, now), [contract?.cycleStartDay, now]);
  const [key, setKey] = useState(cycles[0].key);
  const cycle = cycles.find((c) => c.key === key) ?? cycles[0];
  const s = useMemo(() => cycleSummary(tasks, cycle, contract ?? null), [tasks, cycle, contract]);
  const cycleJobs = useMemo(() => tasks.filter((t) => inCycleTask(t, cycle)), [tasks, cycle]);
  const file = (what: string) => `${what}-${cycle.key}.csv`;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-fg">Reports</h1>
          <p className="mt-1 text-[15px] text-fg-subtle">Billing cycles run from the {contract?.cycleStartDay ?? 25}th to the {(contract?.cycleStartDay ?? 25) - 1}th. Download any report to Excel, or print it as a PDF.</p>
        </div>
        <label className="flex items-center gap-2 text-[13px] font-bold text-fg">
          Billing cycle
          <Select value={key} onChange={(e) => setKey(e.target.value)} className="min-w-[260px]">
            {cycles.map((c, i) => <option key={c.key} value={c.key}>{c.name} · {c.range}{i === 0 ? " (current)" : ""}</option>)}
          </Select>
        </label>
      </div>

      {/* Summary */}
      <section aria-label="Cycle summary" className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="border-t-4 border-brand bg-panel px-5 py-4">
          <p className="text-[13px] font-bold">Visits</p>
          {s.contract ? <>
            <p className="num mt-2 text-[30px] font-bold leading-none">{s.done}<span className="text-[18px] text-fg-faint"> of {s.committed} included</span></p>
            <p className="mt-2 text-[13px] text-fg-subtle">In-city {s.inCity.done} of {s.inCity.committed} · Intercity {s.interCity.done} of {s.interCity.committed}
              {s.inCity.extra + s.interCity.extra > 0 && <> · <b className="text-fg">{s.inCity.extra + s.interCity.extra} extra</b></>}</p>
          </> : <>
            <p className="num mt-2 text-[30px] font-bold leading-none">{s.done}</p>
            <p className="mt-2 text-[13px] text-fg-subtle">In-city {s.inCity.done} · Intercity {s.interCity.done} · {fmtUSD(s.visitsValue)} at the rate card</p>
          </>}
        </div>
        <div className="border-t-4 border-black bg-panel px-5 py-4">
          <p className="text-[13px] font-bold">Amount to bill</p>
          <p className="num mt-2 text-[30px] font-bold leading-none">{fmtUSD(s.total)}</p>
          <p className="mt-2 text-[13px] text-fg-subtle">{fmtPkr(s.totalPkr)} at {s.usdToPkr} PKR per USD</p>
        </div>
        <div className="border-t-4 border-black bg-panel px-5 py-4">
          <p className="text-[13px] font-bold">Engineers</p>
          <p className="num mt-2 text-[30px] font-bold leading-none">{s.engineers.filter((e) => !e.name.startsWith("Name not")).length}</p>
          <p className="mt-2 text-[13px] text-fg-subtle">{fmtMinutes(s.engineers.reduce((m, e) => m + e.minutes, 0)) || "No time"} on site in total</p>
        </div>
      </section>

      {/* The bill */}
      <Panel title="Bill for this cycle" subtitle={s.contract ? "Monthly charge, then every visit Orange closed in the cycle, then hotel stays" : "Every visit Orange closed in the cycle at the rate card, then hotel stays"} className="mb-6" bodyClass="p-0"
        actions={<div className="flex flex-wrap gap-2">
          <Action onClick={() => downloadText(file("cycle-bill"), cycleBillCsv(s))}><Icons.Download size={14} />Excel</Action>
          <Action href={`/print/report?cycle=${cycle.key}`}><Icons.Print size={14} />Print / PDF</Action>
        </div>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[14px]">
            <thead>
              <tr className="border-b border-line text-[12px] font-bold text-fg-subtle">
                <th className="px-5 py-2.5">Item</th><th className="px-3 py-2.5">Engineer</th><th className="px-3 py-2.5">Finished</th>
                <th className="px-3 py-2.5">Billing</th><th className="px-5 py-2.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {s.mrc > 0 && (
                <tr className="border-b border-line bg-brand-tint">
                  <td className="px-5 py-3 font-bold" colSpan={3}>Monthly recurring charge <span className="font-normal text-fg-subtle">· covers {s.committed} visits ({s.inCity.committed} in-city, {s.interCity.committed} intercity)</span></td>
                  <td className="px-3 py-3 text-fg-subtle">Fixed</td>
                  <td className="num px-5 py-3 text-right font-bold">{fmtUSD(s.mrc)}</td>
                </tr>
              )}
              {s.visits.map((v) => (
                <tr key={v.task.id} className="border-b border-line align-top">
                  <td className="px-5 py-3">
                    <Link href={`/admin/jobs/${v.task.id}`} className="font-bold hover:underline">{v.task.workOrder ?? v.task.id}</Link>
                    <p className="text-[12px] text-fg-subtle">{v.task.endCustomer ?? v.task.title} · {v.area === "in_city" ? "In-city" : "Intercity"} · {v.task.visitDuration}</p>
                  </td>
                  <td className="px-3 py-3">{knownEngineer(v.task) ?? <span className="text-warn-fg">Not received</span>}</td>
                  <td className="whitespace-nowrap px-3 py-3">{fmtDate(v.cleared)}</td>
                  <td className="px-3 py-3">
                    {!s.contract
                      ? <span className="text-fg-muted">{v.task.maintenanceLevel === "Planned Activity" ? "Planned" : "Reactive"} {v.task.serviceLevel} · {v.task.distanceBand}</span>
                      : v.included ? <span className="text-fg-muted">Included</span> : <span className="font-bold">Extra visit</span>}
                    {!v.billed && <p className="text-[12px] text-warn-fg">Price not confirmed yet</p>}
                  </td>
                  <td className={cx("num px-5 py-3 text-right", v.included ? "text-fg-faint" : "font-bold")}>
                    {v.included ? <span title={`Rate card ${fmtUSD(v.rated)}`}>$0</span> : fmtUSD(v.charge)}
                  </td>
                </tr>
              ))}
              {s.visits.filter((v) => v.hotel > 0).map((v) => (
                <tr key={`${v.task.id}-hotel`} className="border-b border-line">
                  <td className="px-5 py-3" colSpan={2}>Hotel · {v.task.workOrder ?? v.task.id} <span className="text-fg-subtle">· {v.task.hotelNights} night{v.task.hotelNights === 1 ? "" : "s"}</span></td>
                  <td className="px-3 py-3">{fmtDate(v.cleared)}</td><td className="px-3 py-3">Overnight stay</td>
                  <td className="num px-5 py-3 text-right font-bold">{fmtUSD(v.hotel)}</td>
                </tr>
              ))}
              {!s.visits.length && (
                <tr><td colSpan={5} className="px-5 py-6 text-center text-fg-subtle">No visits closed in this cycle yet. The monthly charge still applies.</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black">
                <td className="px-5 py-3 font-bold" colSpan={4}>Total</td>
                <td className="num px-5 py-3 text-right text-[16px] font-bold">{fmtUSD(s.total)}</td>
              </tr>
              <tr><td className="px-5 pb-3 text-fg-subtle" colSpan={4}>In Pakistani rupees at {s.usdToPkr}</td>
                <td className="num px-5 pb-3 text-right font-bold">{fmtPkr(s.totalPkr)}</td></tr>
            </tfoot>
          </table>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Engineers" subtitle="Visits and time on site in this cycle" bodyClass="p-0"
          actions={<Action onClick={() => downloadText(file("engineers"), engineersCsv(s))}><Icons.Download size={14} />Excel</Action>}>
          {s.engineers.length ? (
            <table className="w-full text-left text-[14px]">
              <thead><tr className="border-b border-line text-[12px] font-bold text-fg-subtle">
                <th className="px-5 py-2.5">Engineer</th><th className="px-3 py-2.5 text-right">Visits</th><th className="px-5 py-2.5 text-right">Time on site</th>
              </tr></thead>
              <tbody>
                {s.engineers.map((e) => (
                  <tr key={e.name} className="border-b border-line last:border-0">
                    <td className={cx("px-5 py-3", e.name.startsWith("Name not") ? "text-warn-fg" : "font-bold")}>{e.name}</td>
                    <td className="num px-3 py-3 text-right">{e.visits}</td>
                    <td className="num px-5 py-3 text-right">{fmtMinutes(e.minutes) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="px-5 py-6 text-center text-fg-subtle">No visits in this cycle yet.</p>}
        </Panel>

        <Panel title="Work orders" subtitle="Every job, with engineer, times, status and price">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
              <div><p className="font-bold">This cycle</p><p className="text-[13px] text-fg-subtle">{cycleJobs.length} work order{cycleJobs.length === 1 ? "" : "s"} opened or closed in {cycle.name}</p></div>
              <Action onClick={() => downloadText(file("work-orders"), workOrdersCsv(cycleJobs))}><Icons.Download size={14} />Excel</Action>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="font-bold">All work orders</p><p className="text-[13px] text-fg-subtle">{tasks.length} in total, since the start</p></div>
              <Action onClick={() => downloadText(`work-orders-all-${new Date().toISOString().slice(0, 10)}.csv`, workOrdersCsv(tasks))}><Icons.Download size={14} />Excel</Action>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
