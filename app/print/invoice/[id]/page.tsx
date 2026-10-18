"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Invoice } from "@/lib/billing";
import type { Task } from "@/lib/store";
import type { PricingConfig } from "@/lib/pricing";

interface Detail { invoice: Invoice; credits: Invoice[]; original: Invoice | null; workOrders: Task[] }

const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso?: string) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
const time = (iso?: string) => iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—";
const month = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

/**
 * Printable invoice pack: the invoice, then one evidence card per visit with
 * Orange's work order details, on-site timestamps and the email trail.
 * Use the browser's Print → Save as PDF.
 */
export default function InvoicePrint() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<Detail | null>(null);
  const [cfg, setCfg] = useState<PricingConfig | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/billing/invoices/${encodeURIComponent(id)}`).then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch("/api/settings/pricing").then((r) => r.json()),
    ]).then(([detail, pricing]) => { setD(detail); setCfg(pricing.config); }).catch(() => setFailed(true));
  }, [id]);

  if (failed) return <main className="min-h-screen bg-white p-10 text-neutral-800">Invoice not found.</main>;
  if (!d || !cfg) return <main className="min-h-screen bg-white p-10 text-neutral-500">Preparing invoice…</main>;

  const inv = d.invoice;
  const issuer = cfg.issuer;
  const wo = new Map(d.workOrders.map((t) => [t.id, t]));
  const credited = d.credits.filter((c) => c.status !== "void").reduce((s, c) => s + Math.abs(c.total), 0);
  const title = inv.kind === "credit" ? "Credit note" : "Invoice";

  return (
    <main className="min-h-screen bg-neutral-100 py-8 text-[13px] leading-relaxed text-neutral-800 print:bg-white print:py-0" style={{ colorScheme: "light" }}>
      <style>{`@media print { @page { size: A4; margin: 14mm; } body { background: #fff !important; } .sheet { box-shadow: none !important; } }`}</style>

      <div className="mx-auto mb-4 flex max-w-[820px] items-center justify-between px-4 print:hidden">
        <p className="text-neutral-500">Invoice pack · {inv.number}</p>
        <button onClick={() => window.print()} className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700">Print / Save as PDF</button>
      </div>

      <div className="sheet mx-auto max-w-[820px] bg-white px-10 py-10 shadow-sm print:px-0 print:py-0">
        {/* Header */}
        <header className="flex items-start justify-between gap-8 border-b border-neutral-200 pb-6">
          <div>
            {issuer.name ? <>
              <p className="text-[17px] font-semibold text-neutral-900">{issuer.name}</p>
              {issuer.address && <p className="whitespace-pre-line text-neutral-600">{issuer.address}</p>}
              {issuer.taxId && <p className="text-neutral-600">Tax ID: {issuer.taxId}</p>}
            </> : (
              <p className="text-neutral-400 print:hidden">Add your company name and address on the Pricing rules page.</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-[24px] font-semibold tracking-tight text-neutral-900">{title}</p>
            <p className="font-mono text-[15px] text-neutral-700">{inv.number}</p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-8 py-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Bill to</p>
            <p className="mt-1 font-medium text-neutral-900">{inv.customer}</p>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-right">
            <dt className="text-neutral-500">Period</dt><dd>{month(inv.periodStart)}</dd>
            <dt className="text-neutral-500">Issued</dt><dd>{day(inv.sentAt ?? inv.createdAt)}</dd>
            {inv.dueAt && <><dt className="text-neutral-500">Due</dt><dd>{day(inv.dueAt)}</dd></>}
            {inv.kind === "credit" && d.original && <><dt className="text-neutral-500">Credits</dt><dd className="font-mono">{d.original.number}</dd></>}
            {inv.status === "draft" && <><dt className="text-neutral-500">Status</dt><dd className="font-semibold text-orange-700">Draft — not issued</dd></>}
          </dl>
        </section>

        {/* Lines */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-neutral-300 text-left text-[11px] uppercase tracking-wider text-neutral-500">
              <th className="py-2 pr-3 font-semibold">Work order</th>
              <th className="py-2 pr-3 font-semibold">Description</th>
              <th className="py-2 pr-3 font-semibold">Cleared</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l) => (
              <tr key={l.id} className="border-b border-neutral-200 align-top">
                <td className="py-2 pr-3 font-mono text-neutral-900">{l.workOrder ?? "—"}</td>
                <td className="py-2 pr-3">{l.kind === "visit" ? l.description.replace(/^WO [^·]+ · /, "") : l.description}</td>
                <td className="whitespace-nowrap py-2 pr-3 text-neutral-600">{l.date ? day(l.date) : ""}</td>
                <td className="whitespace-nowrap py-2 text-right tabular-nums">{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ml-auto mt-4 w-72 space-y-1 tabular-nums">
          {inv.kind === "invoice" && <div className="flex justify-between"><span className="text-neutral-500">Visits</span><span>{money(inv.subtotal)}</span></div>}
          {inv.adjustments !== 0 && <div className="flex justify-between"><span className="text-neutral-500">Adjustments</span><span>{money(inv.adjustments)}</span></div>}
          <div className="flex justify-between border-t border-neutral-300 pt-1 text-[15px] font-semibold text-neutral-900"><span>Total {cfg.currency}</span><span>{money(inv.total)}</span></div>
          {credited > 0 && <div className="flex justify-between text-neutral-500"><span>Less credit notes</span><span>{money(-credited)}</span></div>}
          {credited > 0 && <div className="flex justify-between font-semibold text-neutral-900"><span>Balance</span><span>{money(inv.total - credited)}</span></div>}
        </div>

        {issuer.bankDetails && (
          <section className="mt-8 rounded border border-neutral-200 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Payment details</p>
            <p className="mt-1 whitespace-pre-line">{issuer.bankDetails}</p>
          </section>
        )}
        {inv.notes && <p className="mt-6 whitespace-pre-line text-neutral-600">{inv.notes}</p>}

        {/* Evidence */}
        {inv.lines.some((l) => l.workOrderId) && (
          <section className="mt-10 break-before-page">
            <h2 className="border-b border-neutral-300 pb-2 text-[15px] font-semibold text-neutral-900">Supporting evidence</h2>
            <p className="mt-1 text-neutral-500">Taken from Orange Business OBSLink notifications for each work order on this {title.toLowerCase()}.</p>
            {inv.lines.filter((l) => l.workOrderId).map((l) => {
              const t = wo.get(l.workOrderId!);
              if (!t) return null;
              const s = t.onSiteTimes;
              return (
                <article key={l.id} className="mt-5 break-inside-avoid rounded border border-neutral-200 p-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="font-mono font-semibold text-neutral-900">WO {t.workOrder ?? t.id}</p>
                    <p className="tabular-nums font-medium">{money(l.amount)}</p>
                  </div>
                  <p className="text-neutral-700">{t.title}</p>
                  <dl className="mt-2 grid grid-cols-[140px_1fr] gap-x-4 gap-y-0.5 text-[12px]">
                    {t.endCustomer && <><dt className="text-neutral-500">End customer</dt><dd>{t.endCustomer}</dd></>}
                    <dt className="text-neutral-500">Site</dt><dd>{t.location}</dd>
                    {t.scheduledAt && <><dt className="text-neutral-500">Booked arrival</dt><dd>{day(t.scheduledAt)} {time(t.scheduledAt)}</dd></>}
                    {s && <><dt className="text-neutral-500">On site</dt><dd>Arrived {time(s.arriveOnSite)} · work {time(s.workStart)}–{time(s.workStop)} · left {time(s.leaveSite)}{t.duration ? ` (${t.duration})` : ""}</dd></>}
                    <dt className="text-neutral-500">Pricing</dt><dd>{t.maintenanceLevel} · {t.serviceLevel} · {t.distanceBand} · {t.visitDuration}</dd>
                    {t.comments && <><dt className="text-neutral-500">Closure notes</dt><dd className="whitespace-pre-line">{t.comments}</dd></>}
                  </dl>
                  {t.emailLog?.length ? (
                    <div className="mt-2 border-t border-neutral-100 pt-2 text-[11px] text-neutral-600">
                      <p className="font-semibold uppercase tracking-wider text-neutral-500">Orange emails</p>
                      <ul className="mt-0.5 space-y-0.5">
                        {t.emailLog.map((e) => <li key={e.messageId}>{day(e.at)} {time(e.at)} — {e.subject}</li>)}
                      </ul>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
