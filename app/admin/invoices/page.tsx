"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/storeContext";
import { useUser } from "@/lib/userContext";
import type { Invoice, Payout } from "@/lib/billing";
import { Icons } from "@/components/icons";
import { Badge, Button, Modal, PageHeader, Segmented, Stat, StatStrip, cx, inputCls, labelCls } from "@/components/ui";
import { INVOICE_TONE, fmtDay, isOverdue, monthLabel, statusLabel } from "@/components/billing";
import { DataTable, type Column } from "@/components/DataTable";
import { fmtUSD } from "@/lib/analytics";

interface BillingData {
  invoices: Invoice[];
  payouts: Payout[];
  unbilled: { id: string; workOrder?: string; title: string; amount: number }[];
}


/** First and last day of a YYYY-MM month. */
function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${ym}-01`, end: `${ym}-${String(last).padStart(2, "0")}` };
}

function RunModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const lastMonth = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })();
  const [month, setMonth] = useState(lastMonth);
  const [preview, setPreview] = useState<{ visits: { id: string; workOrder?: string; title: string; amount: number }[]; total: number; partners: { partner: string; visits: number; total: number }[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { start, end } = monthRange(month);

  useEffect(() => {
    let live = true;
    fetch(`/api/billing/run?start=${start}&end=${end}`)
      .then((r) => r.json())
      .then((d) => { if (live) { setPreview(d.error ? null : d); setError(d.error ?? ""); } })
      .catch(() => { if (live) setError("Could not load the preview."); });
    return () => { live = false; };
  }, [start, end]);

  const create = async () => {
    setBusy(true); setError("");
    const r = await fetch("/api/billing/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ start, end }) });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setError(d.error ?? "Could not create the invoice."); return; }
    onCreated(d.invoice.id);
  };

  return (
    <Modal onClose={onClose} label="New invoice run" width="max-w-lg">
      <h3 className="text-[15px] font-semibold text-fg">New invoice run</h3>
      <p className="mt-1 text-[13px] text-fg-muted">Groups every billed visit Orange cleared in the month into one draft invoice, and creates the matching partner payouts.</p>
      <label className={cx(labelCls, "mt-4")} htmlFor="run-month">Billing month</label>
      <input id="run-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls} />

      <div className="mt-4 overflow-hidden rounded-lg border border-line">
        {preview === null && !error && <p className="px-4 py-5 text-center text-xs text-fg-subtle">Checking {monthLabel(start)}…</p>}
        {preview && (
          <>
            <div className="grid grid-cols-2 gap-px bg-line">
              <div className="bg-panel px-4 py-3"><p className="text-2xs text-fg-subtle">Visits to invoice</p><p className="num mt-0.5 text-[18px] font-semibold text-fg">{preview.visits.length}</p></div>
              <div className="bg-panel px-4 py-3"><p className="text-2xs text-fg-subtle">Invoice total</p><p className="num mt-0.5 text-[18px] font-semibold text-fg">{fmtUSD(preview.total)}</p></div>
            </div>
            {preview.visits.length > 0 ? (
              <ul className="max-h-48 divide-y divide-line/60 overflow-y-auto border-t border-line text-xs scroll-thin">
                {preview.visits.map((v) => (
                  <li key={v.id} className="flex justify-between gap-3 px-4 py-2">
                    <span className="min-w-0 truncate text-fg-muted"><span className="font-mono text-fg">{v.workOrder ?? v.id}</span> · {v.title}</span>
                    <span className="num shrink-0 text-fg">{fmtUSD(v.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="border-t border-line px-4 py-4 text-center text-xs text-fg-subtle">No billed visits in {monthLabel(start)} are waiting for an invoice.</p>
            )}
            {preview.partners.length > 0 && (
              <p className="border-t border-line px-4 py-2 text-2xs text-fg-subtle">
                Payouts: {preview.partners.map((p) => `${p.partner} ${fmtUSD(p.total)}`).join(" · ")}
              </p>
            )}
          </>
        )}
      </div>
      {error && <p role="alert" className="mt-3 text-xs text-[#f08a84]">{error}</p>}
      <div className="mt-5 flex gap-2">
        <Button onClick={onClose} className="flex-1">Cancel</Button>
        <Button variant="primary" onClick={create} disabled={busy || !preview?.visits.length} className="flex-1">
          {busy ? "Creating…" : "Create draft invoice"}
        </Button>
      </div>
    </Modal>
  );
}

export default function BillingPage() {
  const router = useRouter();
  const { refresh } = useStore();
  const { canEdit } = useUser();
  const [data, setData] = useState<BillingData | null>(null);
  const [tab, setTab] = useState<"invoices" | "payouts">("invoices");
  const [showRun, setShowRun] = useState(false);
  const [payTarget, setPayTarget] = useState<Payout | null>(null);
  const [payRef, setPayRef] = useState("");

  const load = useCallback(() => {
    fetch("/api/billing", { cache: "no-store" }).then((r) => r.json()).then(setData).catch(() => setData({ invoices: [], payouts: [], unbilled: [] }));
  }, []);
  useEffect(() => { load(); }, [load]);

  const invoices = useMemo(() => data?.invoices ?? [], [data]);
  const payouts = useMemo(() => data?.payouts ?? [], [data]);
  const unbilledTotal = (data?.unbilled ?? []).reduce((s, u) => s + u.amount, 0);
  const real = invoices.filter((i) => i.kind === "invoice" && i.status !== "void");
  const credits = invoices.filter((i) => i.kind === "credit" && i.status !== "void");
  const creditFor = (id: string) => credits.filter((c) => c.creditFor === id).reduce((s, c) => s + Math.abs(c.total), 0);
  const outstanding = real.filter((i) => i.status === "sent").reduce((s, i) => s + i.total - creditFor(i.id), 0);
  const overdue = real.filter(isOverdue);
  const paidYtd = real.filter((i) => i.status === "paid" && i.paidAt?.startsWith(String(new Date().getFullYear())))
    .reduce((s, i) => s + i.total - creditFor(i.id), 0);
  const owedToPartners = payouts.filter((p) => p.status === "pending").reduce((s, p) => s + p.total, 0);

  const invoiceCols: Column<Invoice>[] = [
    { key: "number", header: "Invoice", sort: (i) => i.number,
      render: (i) => (
        <div>
          <p className="font-mono text-[13px] font-semibold text-fg">{i.number}</p>
          <p className="text-2xs text-fg-subtle">{i.kind === "credit" ? `Credit note for ${i.creditFor}` : `${i.lines.filter((l) => l.kind === "visit").length} visit(s)`}</p>
        </div>
      ) },
    { key: "period", header: "Period", sort: (i) => i.periodStart,
      render: (i) => <span className="whitespace-nowrap text-xs text-fg-muted">{monthLabel(i.periodStart)}</span> },
    { key: "status", header: "Status", sort: (i) => i.status,
      render: (i) => (
        <span className="flex items-center gap-1.5">
          <Badge tone={isOverdue(i) ? "crit" : INVOICE_TONE[i.status]}>{isOverdue(i) ? "Overdue" : statusLabel(i)}</Badge>
        </span>
      ) },
    { key: "dates", header: "Sent / due", className: "hidden md:table-cell",
      render: (i) => <span className="num whitespace-nowrap text-xs text-fg-subtle">{i.kind === "credit" ? `Issued ${fmtDay(i.sentAt)}` : i.sentAt ? `${fmtDay(i.sentAt)} · due ${fmtDay(i.dueAt)}` : "Not sent"}</span> },
    { key: "total", header: "Total", align: "right", sort: (i) => i.total,
      render: (i) => (
        <div className="text-right">
          <p className={cx("num font-semibold", i.total < 0 ? "text-[#f08a84]" : "text-fg")}>{fmtUSD(i.total)}</p>
          {i.kind === "invoice" && creditFor(i.id) > 0 && <p className="num text-2xs text-fg-subtle">−{fmtUSD(creditFor(i.id))} credited</p>}
        </div>
      ) },
    { key: "go", header: <span className="sr-only">Open</span>, align: "right",
      render: (i) => <Link href={`/admin/invoices/${i.id}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-xs font-medium text-fg-muted hover:bg-white/5 hover:text-fg">Open<Icons.ChevronR size={12} /></Link> },
  ];

  const payoutCols: Column<Payout>[] = [
    { key: "number", header: "Payout", sort: (p) => p.number,
      render: (p) => <div><p className="font-mono text-[13px] font-semibold text-fg">{p.number}</p><p className="text-2xs text-fg-subtle">{p.lines.length} visit(s)</p></div> },
    { key: "partner", header: "Partner", sort: (p) => p.partner, render: (p) => <span className="text-fg">{p.partner}</span> },
    { key: "period", header: "Period", sort: (p) => p.periodStart, className: "hidden md:table-cell",
      render: (p) => <span className="text-xs text-fg-muted">{monthLabel(p.periodStart)}</span> },
    { key: "status", header: "Status", sort: (p) => p.status,
      render: (p) => p.status === "paid"
        ? <span className="text-xs"><Badge tone="ok">Paid</Badge><span className="ml-2 text-fg-subtle">{fmtDay(p.paidAt)}{p.reference ? ` · ${p.reference}` : ""}</span></span>
        : <Badge tone="warn">Pending</Badge> },
    { key: "total", header: "Amount", align: "right", sort: (p) => p.total, render: (p) => <span className="num font-semibold text-fg">{fmtUSD(p.total)}</span> },
    { key: "act", header: <span className="sr-only">Action</span>, align: "right",
      render: (p) => p.status === "pending" ? <Button size="sm" onClick={() => { setPayTarget(p); setPayRef(""); }}>Mark paid</Button> : null },
  ];

  const markPaid = async () => {
    if (!payTarget) return;
    await fetch(`/api/billing/payouts/${payTarget.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pay", reference: payRef }) });
    setPayTarget(null);
    load();
  };

  return (
    <div>
      <PageHeader title="Billing" subtitle="Monthly invoices to Orange Business and payouts to field-engineer partners"
        actions={<>
          <Link href="/admin/commercials#invoice-settings"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-raised px-3.5 text-[13px] font-medium text-fg ring-1 ring-inset ring-line-strong transition-colors hover:bg-hover">
            <Icons.Edit size={14} />Invoice settings
          </Link>
          {canEdit && <Button variant="primary" onClick={() => setShowRun(true)}><Icons.Plus size={15} />New invoice run</Button>}
        </>} />

      {data && data.unbilled.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn/[0.05] px-5 py-3.5">
          <p className="flex items-center gap-2 text-[13px] text-fg">
            <Icons.Invoice size={15} className="text-[#f0bd6d]" />
            <span><span className="font-semibold">{data.unbilled.length} billed visit{data.unbilled.length === 1 ? "" : "s"}</span> worth <span className="num font-semibold">{fmtUSD(unbilledTotal)}</span> {data.unbilled.length === 1 ? "is" : "are"} not on an invoice yet.</span>
          </p>
          <Button size="sm" onClick={() => setShowRun(true)}>Invoice them</Button>
        </div>
      )}

      <StatStrip>
        <Stat label="Ready to invoice" value={fmtUSD(unbilledTotal)} foot={`${data?.unbilled.length ?? 0} billed visit(s)`} accent={unbilledTotal > 0} />
        <Stat label="Outstanding" value={fmtUSD(outstanding)} foot={overdue.length ? <span className="text-[#f08a84]">{overdue.length} overdue</span> : "Sent, not yet paid"} />
        <Stat label="Paid this year" value={fmtUSD(paidYtd)} foot="After credit notes" />
        <Stat label="Owed to partners" value={fmtUSD(owedToPartners)} foot={`${payouts.filter((p) => p.status === "pending").length} pending payout(s)`} />
      </StatStrip>

      <section className="overflow-hidden rounded-xl border border-line bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-3.5 sm:px-5">
          <Segmented label="Billing view" value={tab} onChange={setTab}
            options={[
              { value: "invoices", label: <span className="flex items-center gap-1.5">Invoices<span className="num text-fg-faint">{invoices.length}</span></span> },
              { value: "payouts", label: <span className="flex items-center gap-1.5">Partner payouts<span className="num text-fg-faint">{payouts.length}</span></span> },
            ]} />
        </div>
        {tab === "invoices" ? (
          <DataTable rows={invoices} columns={invoiceCols} rowKey={(i) => i.id} pageSize={15}
            onRowClick={(i) => router.push(`/admin/invoices/${i.id}`)} initialSort={{ key: "number", dir: "desc" }}
            empty={<div className="text-fg-subtle"><p className="text-[13px]">No invoices yet</p><p className="mt-1 text-xs">Use “New invoice run” to invoice a month of billed visits.</p></div>} />
        ) : (
          <DataTable rows={payouts} columns={payoutCols} rowKey={(p) => p.id} pageSize={15} initialSort={{ key: "number", dir: "desc" }}
            empty={<div className="text-fg-subtle"><p className="text-[13px]">No partner payouts yet</p><p className="mt-1 text-xs">Payouts are created with each invoice run.</p></div>} />
        )}
      </section>

      {showRun && <RunModal onClose={() => setShowRun(false)} onCreated={(id) => { setShowRun(false); refresh(); router.push(`/admin/invoices/${id}`); }} />}

      {payTarget && (
        <Modal onClose={() => setPayTarget(null)} label="Mark payout paid" width="max-w-sm">
          <h3 className="text-[15px] font-semibold text-fg">Mark {payTarget.number} paid</h3>
          <p className="mt-1 text-[13px] text-fg-muted">{payTarget.partner} · <span className="num">{fmtUSD(payTarget.total)}</span></p>
          <label className={cx(labelCls, "mt-4")} htmlFor="pay-ref">Payment reference <span className="normal-case tracking-normal text-fg-faint">(optional)</span></label>
          <input id="pay-ref" value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="e.g. bank transfer ID" className={inputCls} autoFocus />
          <div className="mt-4 flex gap-2">
            <Button onClick={() => setPayTarget(null)} className="flex-1">Cancel</Button>
            <Button variant="success" onClick={markPaid} className="flex-1"><Icons.Check size={14} />Mark paid</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
