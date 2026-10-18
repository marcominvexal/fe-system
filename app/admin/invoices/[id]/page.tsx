"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Invoice, InvoiceLine } from "@/lib/billing";
import type { Task } from "@/lib/store";
import { useStore } from "@/lib/storeContext";
import { Icons } from "@/components/icons";
import { Badge, Button, Modal, Panel, cx, inputCls, labelCls, textareaCls } from "@/components/ui";
import { INVOICE_TONE, downloadText, fmtDay, invoiceCsv, isOverdue, monthLabel, statusLabel } from "@/components/billing";
import { fmtUSD } from "@/lib/analytics";

interface Detail {
  invoice: Invoice;
  history: { id: number; at: string; actor: string; action: string; reason: string | null }[];
  credits: Invoice[];
  original: Invoice | null;
  workOrders: Task[];
}

type Dialog = null | "adjust" | "credit" | "void" | "pay";

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const { refresh } = useStore();
  const [d, setD] = useState<Detail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [amount, setAmount] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/billing/invoices/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (r) => { if (r.status === 404) { setNotFound(true); return; } setD(await r.json()); })
      .catch(() => setNotFound(true));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const act = async (action: string, body: object = {}) => {
    setBusy(true); setError("");
    const r = await fetch(`/api/billing/invoices/${encodeURIComponent(id)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }),
    });
    const res = await r.json();
    setBusy(false);
    if (!r.ok) { setError(res.error ?? "Something went wrong."); return false; }
    setDialog(null); setAmount(""); setText("");
    load(); refresh();
    return true;
  };

  if (notFound) return (
    <div className="py-24 text-center">
      <p className="text-[15px] font-medium text-fg">Invoice not found</p>
      <Link href="/admin/invoices" className="mt-2 inline-block text-[13px] text-brand-soft hover:text-brand">Back to billing</Link>
    </div>
  );
  if (!d) return <p className="py-24 text-center text-[13px] text-fg-subtle">Loading invoice…</p>;

  const inv = d.invoice;
  const credited = d.credits.filter((c) => c.status !== "void").reduce((s, c) => s + Math.abs(c.total), 0);
  const net = inv.total - credited;
  const overdue = isOverdue(inv);
  const visits = inv.lines.filter((l) => l.kind === "visit");
  const adjustments = inv.lines.filter((l) => l.kind === "adjustment");
  const woById = new Map(d.workOrders.map((t) => [t.id, t]));
  const fePay = visits.reduce((s, l) => s + (l.fePay ?? 0), 0);
  const openDialog = (k: Dialog) => { setDialog(k); setError(""); setAmount(""); setText(""); };

  const lineRow = (l: InvoiceLine) => {
    const t = l.workOrderId ? woById.get(l.workOrderId) : undefined;
    return (
      <tr key={l.id} className="group">
        <td className="border-b border-line/70 px-4 py-2.5 align-top sm:px-5">
          {l.kind === "visit" ? (
            <>
              <Link href={`/admin/jobs/${l.workOrderId}`} className="font-mono text-[13px] font-semibold text-fg hover:text-brand-soft">{l.workOrder}</Link>
              <p className="mt-0.5 max-w-[520px] text-xs text-fg-muted">{l.description.replace(/^WO [^·]+ · /, "")}</p>
              {t?.emailLog?.length ? <p className="mt-0.5 text-2xs text-fg-subtle">{t.emailLog.length} Orange email(s) on file{t.duration ? ` · ${t.duration} on site` : ""}</p> : null}
            </>
          ) : (
            <p className="text-[13px] text-fg">{l.description}<span className="ml-2 text-2xs text-fg-subtle">Adjustment</span></p>
          )}
        </td>
        <td className="num hidden border-b border-line/70 px-3 py-2.5 align-top text-xs text-fg-subtle sm:table-cell">{l.date ? fmtDay(l.date) : "—"}</td>
        <td className={cx("num border-b border-line/70 px-4 py-2.5 text-right align-top font-medium sm:px-5", l.amount < 0 ? "text-[#f08a84]" : "text-fg")}>
          {fmtUSD(l.amount)}
          {inv.status === "draft" && (
            <button onClick={() => act("remove_line", { lineId: l.id })} title={l.kind === "visit" ? "Remove from this invoice (the visit goes back to ready to invoice)" : "Remove adjustment"}
              className="ml-2 inline-grid h-5 w-5 place-items-center rounded text-fg-faint opacity-0 transition-opacity hover:bg-white/5 hover:text-[#f08a84] group-hover:opacity-100 focus:opacity-100">
              <Icons.X size={12} />
            </button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div>
      <Link href="/admin/invoices" className="mb-3 inline-flex items-center gap-1 text-xs text-fg-subtle hover:text-fg">
        <Icons.ChevronL size={13} />Billing
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-mono text-[22px] font-semibold tracking-tight text-fg">{inv.number}</h1>
            <Badge tone={overdue ? "crit" : INVOICE_TONE[inv.status]}>{overdue ? "Overdue" : statusLabel(inv)}</Badge>
            {inv.kind === "credit" && <Badge tone="warn" dot={false}>Credit note</Badge>}
          </div>
          <p className="mt-1 text-[14px] text-fg-muted">{inv.customer} · {monthLabel(inv.periodStart)}</p>
          <p className="mt-0.5 text-xs text-fg-subtle">
            {inv.kind === "credit" && d.original ? <>Reduces <Link href={`/admin/invoices/${d.original.id}`} className="text-brand-soft hover:text-brand">{d.original.number}</Link> · </> : null}
            Created {fmtDay(inv.createdAt)}{inv.sentAt && ` · sent ${fmtDay(inv.sentAt)}`}{inv.dueAt && ` · due ${fmtDay(inv.dueAt)}`}{inv.paidAt && ` · paid ${fmtDay(inv.paidAt)}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xs font-medium uppercase tracking-[0.07em] text-fg-subtle">{credited ? "Net after credits" : "Total"}</p>
          <p className={cx("num text-[28px] font-semibold leading-tight tracking-tight", net < 0 ? "text-[#f08a84]" : "text-fg")}>{fmtUSD(net)}</p>
          {credited > 0 && <p className="num text-2xs text-fg-subtle">{fmtUSD(inv.total)} − {fmtUSD(credited)} credited</p>}
        </div>
      </div>

      {/* Actions */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {inv.status === "draft" && <>
          <Button variant="primary" onClick={() => act("send")} disabled={busy || !inv.lines.length}><Icons.Mail size={14} />Mark as sent</Button>
          <Button onClick={() => openDialog("adjust")}><Icons.Plus size={14} />Add adjustment</Button>
        </>}
        {inv.status === "sent" && <Button variant="success" onClick={() => openDialog("pay")}><Icons.Check size={14} />Mark as paid</Button>}
        {inv.kind === "invoice" && ["sent", "paid"].includes(inv.status) && <Button onClick={() => openDialog("credit")}>Issue credit note</Button>}
        {["draft", "sent"].includes(inv.status) && inv.kind === "invoice" && <Button variant="danger" onClick={() => openDialog("void")}>Void</Button>}
        <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
        <Button onClick={() => downloadText(`${inv.number}.csv`, invoiceCsv(inv))}><Icons.Invoice size={14} />Download CSV</Button>
        <a href={`/print/invoice/${encodeURIComponent(inv.id)}`} target="_blank" rel="noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-raised px-3.5 text-[13px] font-medium text-fg ring-1 ring-inset ring-line-strong transition-colors hover:bg-hover">
          <Icons.Upload size={14} className="rotate-180" />Invoice pack (PDF)
        </a>
        {error && !dialog && <p role="alert" className="text-xs text-[#f08a84]">{error}</p>}
      </div>
      {inv.status === "draft" && (
        <p className="mb-4 rounded-lg border border-line bg-panel px-4 py-2.5 text-xs text-fg-subtle">
          This is a draft. You can remove lines or add adjustments; once marked as sent the amounts are fixed and changes go through credit notes.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-8">
          <section className="overflow-hidden rounded-xl border border-line bg-panel">
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 text-[13px]">
                <thead>
                  <tr className="text-2xs uppercase tracking-[0.06em] text-fg-subtle">
                    <th className="border-b border-line bg-raised px-4 py-2 text-left font-medium sm:px-5">{inv.kind === "credit" ? "Credit" : `Visits (${visits.length})`}</th>
                    <th className="hidden border-b border-line bg-raised px-3 py-2 text-left font-medium sm:table-cell">Cleared</th>
                    <th className="border-b border-line bg-raised px-4 py-2 text-right font-medium sm:px-5">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {visits.map(lineRow)}
                  {adjustments.map(lineRow)}
                  {!inv.lines.length && <tr><td colSpan={3} className="px-5 py-10 text-center text-xs text-fg-subtle">No lines on this invoice.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col items-end gap-1 border-t border-line bg-raised/50 px-5 py-4 text-[13px]">
              {inv.kind === "invoice" && <p className="num text-fg-muted">Visits <span className="ml-6 text-fg">{fmtUSD(inv.subtotal)}</span></p>}
              {inv.adjustments !== 0 && <p className="num text-fg-muted">Adjustments <span className="ml-6 text-fg">{fmtUSD(inv.adjustments)}</span></p>}
              <p className="num text-[15px] font-semibold text-fg">Total <span className="ml-6">{fmtUSD(inv.total)}</span></p>
              {credited > 0 && <p className="num text-fg-muted">Credit notes <span className="ml-6 text-[#f08a84]">−{fmtUSD(credited)}</span></p>}
            </div>
          </section>
        </div>

        <div className="min-w-0 space-y-4 lg:col-span-4">
          {inv.kind === "invoice" && (
            <Panel title="Margin" subtitle="From the locked billing of each visit">
              <dl className="space-y-1.5 text-[13px]">
                <div className="flex justify-between"><dt className="text-fg-subtle">Charged to Orange</dt><dd className="num text-fg">{fmtUSD(net)}</dd></div>
                <div className="flex justify-between"><dt className="text-fg-subtle">Partner payouts</dt><dd className="num text-fg-muted">−{fmtUSD(fePay)}</dd></div>
                <div className="flex justify-between border-t border-line pt-1.5"><dt className="font-medium text-fg">Profit</dt><dd className="num font-semibold text-[#7bcfa2]">{fmtUSD(net - fePay)}</dd></div>
              </dl>
            </Panel>
          )}
          {d.credits.length > 0 && (
            <Panel title="Credit notes">
              <ul className="space-y-1.5 text-[13px]">
                {d.credits.map((c) => (
                  <li key={c.id} className="flex justify-between gap-3">
                    <Link href={`/admin/invoices/${c.id}`} className="font-mono text-fg hover:text-brand-soft">{c.number}</Link>
                    <span className="num text-[#f08a84]">{fmtUSD(c.total)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel title="History">
            <ol className="space-y-2.5">
              {d.history.map((h) => (
                <li key={h.id} className="text-[13px]">
                  <div className="flex justify-between gap-3">
                    <span className="text-fg"><span className="capitalize">{h.action}</span><span className="text-fg-subtle"> · {h.actor === "admin" ? "Admin" : h.actor}</span></span>
                    <span className="num shrink-0 text-2xs text-fg-faint">{fmtDay(h.at)}</span>
                  </div>
                  {h.reason && <p className="mt-0.5 text-2xs text-fg-subtle">{h.reason}</p>}
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>

      {dialog && (
        <Modal onClose={() => setDialog(null)} label="Invoice action" width="max-w-md">
          {dialog === "adjust" && <>
            <h3 className="text-[15px] font-semibold text-fg">Add adjustment</h3>
            <p className="mt-1 text-[13px] text-fg-muted">Use a negative amount for a discount or penalty, positive for an extra charge.</p>
            <label className={cx(labelCls, "mt-4")} htmlFor="adj-amt">Amount (USD)</label>
            <input id="adj-amt" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="-20" className={inputCls} autoFocus />
            <label className={cx(labelCls, "mt-3")} htmlFor="adj-desc">Description</label>
            <input id="adj-desc" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. SLA penalty — late arrival on WO 18531881-1" className={inputCls} />
          </>}
          {dialog === "credit" && <>
            <h3 className="text-[15px] font-semibold text-fg">Issue credit note</h3>
            <p className="mt-1 text-[13px] text-fg-muted">Reduces what Orange owes on {inv.number}. Up to <span className="num">{fmtUSD(inv.total - credited)}</span> can still be credited.</p>
            <label className={cx(labelCls, "mt-4")} htmlFor="cn-amt">Amount to credit (USD)</label>
            <input id="cn-amt" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} autoFocus />
            <label className={cx(labelCls, "mt-3")} htmlFor="cn-why">Reason</label>
            <textarea id="cn-why" value={text} onChange={(e) => setText(e.target.value)} rows={2} className={textareaCls} placeholder="Shown on the credit note" />
          </>}
          {dialog === "void" && <>
            <h3 className="text-[15px] font-semibold text-fg">Void {inv.number}</h3>
            <p className="mt-1 text-[13px] text-fg-muted">The invoice stays on record as void, and its visits return to “ready to invoice” so they can go on a new invoice.</p>
            <label className={cx(labelCls, "mt-4")} htmlFor="void-why">Reason</label>
            <textarea id="void-why" value={text} onChange={(e) => setText(e.target.value)} rows={2} className={textareaCls} autoFocus />
          </>}
          {dialog === "pay" && <>
            <h3 className="text-[15px] font-semibold text-fg">Mark {inv.number} as paid</h3>
            <p className="mt-1 text-[13px] text-fg-muted">Amount due <span className="num">{fmtUSD(net)}</span>.</p>
            <label className={cx(labelCls, "mt-4")} htmlFor="paid-on">Payment date</label>
            <input id="paid-on" type="date" value={amount || new Date().toISOString().slice(0, 10)} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
            <label className={cx(labelCls, "mt-3")} htmlFor="paid-ref">Note <span className="normal-case tracking-normal text-fg-faint">(optional)</span></label>
            <input id="paid-ref" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. remittance reference" className={inputCls} />
          </>}
          {error && <p role="alert" className="mt-3 text-xs text-[#f08a84]">{error}</p>}
          <div className="mt-5 flex gap-2">
            <Button onClick={() => setDialog(null)} className="flex-1">Cancel</Button>
            <Button variant={dialog === "void" ? "danger" : dialog === "pay" ? "success" : "primary"} disabled={busy} className="flex-1"
              onClick={() => {
                if (dialog === "adjust") act("add_adjustment", { amount: Number(amount), description: text });
                if (dialog === "credit") act("credit", { amount: Number(amount), reason: text });
                if (dialog === "void") act("void", { reason: text });
                if (dialog === "pay") act("pay", { paidAt: amount || undefined, reason: text || undefined });
              }}>
              {busy ? "Saving…" : dialog === "adjust" ? "Add adjustment" : dialog === "credit" ? "Issue credit note" : dialog === "void" ? "Void invoice" : "Mark as paid"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
