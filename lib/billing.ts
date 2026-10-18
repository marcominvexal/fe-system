/**
 * /lib/billing.ts — Server-side only. Monthly invoices to Orange Business,
 * credit notes, and payouts to field-engineer partners.
 *
 *   Billed work order ──(invoice run)──▶ Draft invoice ─▶ Sent ─▶ Paid
 *                                         └─ adjustments     └─ credit notes
 *                    └──────────────────▶ Partner payout: Pending ─▶ Paid
 *
 * Amounts on an invoice are copied from each work order's locked billing, so
 * later pricing changes never alter an issued invoice.
 */
import { getDb } from "./db/client";
import type { Task } from "./store";
import { getTask, listTasks, saveTask, type Actor } from "./repo";
import { getPricing } from "./pricing";

export type InvoiceStatus = "draft" | "sent" | "paid" | "void";
export type PayoutStatus  = "pending" | "paid";

export interface InvoiceLine {
  id:          string;
  kind:        "visit" | "adjustment";
  workOrderId?: string;
  workOrder?:  string;
  date?:       string;     // cleared date
  description: string;
  amount:      number;     // USD, negative for discounts and credits
  fePay?:      number;
}

export interface Invoice {
  id:          string;
  number:      string;
  kind:        "invoice" | "credit";
  status:      InvoiceStatus;
  customer:    string;
  periodStart: string;     // YYYY-MM-DD
  periodEnd:   string;     // YYYY-MM-DD (inclusive)
  lines:       InvoiceLine[];
  subtotal:    number;     // visit lines
  adjustments: number;     // adjustment lines
  total:       number;
  createdAt:   string;
  sentAt?:     string;
  dueAt?:      string;
  paidAt?:     string;
  voidedAt?:   string;
  creditFor?:  string;     // credit note: id of the invoice it reduces
  notes?:      string;
}

export interface PayoutLine { workOrderId: string; workOrder?: string; date?: string; description: string; amount: number }
export interface Payout {
  id:          string;
  number:      string;
  partner:     string;
  status:      PayoutStatus;
  periodStart: string;
  periodEnd:   string;
  lines:       PayoutLine[];
  total:       number;
  createdAt:   string;
  paidAt?:     string;
  reference?:  string;     // bank / payment reference
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const parse = <T,>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;
const lineId = () => Math.random().toString(36).slice(2, 10);

/** Date Orange cleared the visit (falls back to check-out). */
export function clearedDate(t: Task): string | undefined {
  return t.emailLog?.find((e) => e.kind === "cleared")?.at ?? t.checkOutTime;
}

/** Billed visits not yet on an invoice, cleared within [start, end]. */
export async function unbilled(start?: string, end?: string): Promise<Task[]> {
  const tasks = await listTasks();
  const from = start ? new Date(`${start}T00:00:00+05:00`).getTime() : -Infinity;
  const to   = end ? new Date(`${end}T23:59:59.999+05:00`).getTime() : Infinity;
  return tasks.filter((t) => {
    if (t.status !== "approved" || t.invoiceId || t.customerChargeUSD == null) return false;
    const d = clearedDate(t);
    const ms = d ? new Date(d).getTime() : NaN;
    return !isNaN(ms) ? ms >= from && ms <= to : !start;
  });
}

function partnerOf(t: Task) {
  return t.asp ?? t.engineerName ?? "Unassigned";
}

function totals(lines: InvoiceLine[]) {
  const subtotal = round2(lines.filter((l) => l.kind === "visit").reduce((s, l) => s + l.amount, 0));
  const adjustments = round2(lines.filter((l) => l.kind === "adjustment").reduce((s, l) => s + l.amount, 0));
  return { subtotal, adjustments, total: round2(subtotal + adjustments) };
}

// ── Numbering ────────────────────────────────────────────────────────────────
async function nextNumber(prefix: "INV" | "CN" | "PO", periodStart: string): Promise<string> {
  const db = await getDb();
  const ym = periodStart.slice(0, 7).replace("-", "");
  const key = `seq_${prefix}_${ym}`;
  const [row] = await db.query<{ value: unknown }>(
    `INSERT INTO app_state (key, value) VALUES ($1, '1'::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = to_jsonb((app_state.value)::text::int + 1)
     RETURNING value`,
    [key],
  );
  const n = Number(parse<number>(row.value));
  return `${prefix}-${ym}-${String(n).padStart(2, "0")}`;
}

// ── Persistence ──────────────────────────────────────────────────────────────
async function audit(entity: "invoice" | "payout", id: string, actor: Actor, action: string, reason?: string, changes?: object) {
  const db = await getDb();
  await db.query(
    `INSERT INTO audit_log (entity, entity_id, actor, action, changes, reason) VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
    [entity, id, actor, action, changes ? JSON.stringify(changes) : null, reason ?? null],
  );
}

async function putInvoice(inv: Invoice) {
  const db = await getDb();
  await db.query(
    `INSERT INTO invoices (id, number, kind, status, customer, period_start, period_end, total_usd, created_at, data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
     ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, total_usd = EXCLUDED.total_usd, data = EXCLUDED.data`,
    [inv.id, inv.number, inv.kind, inv.status, inv.customer, inv.periodStart, inv.periodEnd, inv.total, inv.createdAt, JSON.stringify(inv)],
  );
}

async function putPayout(p: Payout) {
  const db = await getDb();
  await db.query(
    `INSERT INTO payouts (id, number, partner, status, period_start, period_end, total_usd, created_at, data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
     ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, total_usd = EXCLUDED.total_usd, data = EXCLUDED.data`,
    [p.id, p.number, p.partner, p.status, p.periodStart, p.periodEnd, p.total, p.createdAt, JSON.stringify(p)],
  );
}

export async function listInvoices(): Promise<Invoice[]> {
  const db = await getDb();
  const rows = await db.query<{ data: unknown }>("SELECT data FROM invoices ORDER BY period_start DESC, created_at DESC");
  return rows.map((r) => parse<Invoice>(r.data));
}
export async function getInvoice(id: string): Promise<Invoice | null> {
  const db = await getDb();
  const [row] = await db.query<{ data: unknown }>("SELECT data FROM invoices WHERE id = $1 OR number = $1", [id]);
  return row ? parse<Invoice>(row.data) : null;
}
export async function listPayouts(): Promise<Payout[]> {
  const db = await getDb();
  const rows = await db.query<{ data: unknown }>("SELECT data FROM payouts ORDER BY period_start DESC, partner");
  return rows.map((r) => parse<Payout>(r.data));
}

// ── Invoice run ──────────────────────────────────────────────────────────────
export interface RunPreview { periodStart: string; periodEnd: string; visits: Task[]; total: number; partners: { partner: string; visits: number; total: number }[] }

export async function previewRun(periodStart: string, periodEnd: string): Promise<RunPreview> {
  const visits = await unbilled(periodStart, periodEnd);
  const byPartner = new Map<string, { visits: number; total: number }>();
  for (const t of visits) {
    const p = partnerOf(t);
    const cur = byPartner.get(p) ?? { visits: 0, total: 0 };
    byPartner.set(p, { visits: cur.visits + 1, total: round2(cur.total + (t.engineerPaymentUSD ?? 0)) });
  }
  return {
    periodStart, periodEnd, visits,
    total: round2(visits.reduce((s, t) => s + (t.customerChargeUSD ?? 0), 0)),
    partners: [...byPartner].map(([partner, v]) => ({ partner, ...v })),
  };
}

/** Create a draft invoice for every uninvoiced billed visit in the period, plus partner payouts. */
export async function createRun(periodStart: string, periodEnd: string, actor: Actor = "admin") {
  const { visits } = await previewRun(periodStart, periodEnd);
  if (!visits.length) return { invoice: null, payouts: [] as Payout[] };

  const now = new Date().toISOString();
  const number = await nextNumber("INV", periodStart);
  const lines: InvoiceLine[] = visits
    .sort((a, b) => (clearedDate(a) ?? "").localeCompare(clearedDate(b) ?? ""))
    .map((t) => ({
      id: lineId(),
      kind: "visit",
      workOrderId: t.id,
      workOrder: t.workOrder ?? t.id,
      date: clearedDate(t),
      description: `${t.workOrder ? `WO ${t.workOrder} · ` : ""}${t.title} · ${t.maintenanceLevel === "Planned Activity" ? "Planned" : "Reactive"} ${t.serviceLevel} · ${t.distanceBand} · ${t.visitDuration}`,
      amount: t.customerChargeUSD ?? 0,
      fePay: t.engineerPaymentUSD,
    }));
  const invoice: Invoice = {
    id: number, number, kind: "invoice", status: "draft", customer: "Orange Business",
    periodStart, periodEnd, lines, ...totals(lines), createdAt: now,
  };
  await putInvoice(invoice);
  await audit("invoice", invoice.id, actor, "created", `Invoice run for ${periodStart} – ${periodEnd}: ${lines.length} visit(s)`);

  // Payouts: one per partner for visits not already paid out
  const groups = new Map<string, Task[]>();
  for (const t of visits) {
    if (t.payoutId) continue;
    const p = partnerOf(t);
    groups.set(p, [...(groups.get(p) ?? []), t]);
  }
  const payouts: Payout[] = [];
  for (const [partner, list] of groups) {
    const pnum = await nextNumber("PO", periodStart);
    const plines: PayoutLine[] = list.map((t) => ({
      workOrderId: t.id, workOrder: t.workOrder ?? t.id, date: clearedDate(t),
      description: t.title, amount: t.engineerPaymentUSD ?? 0,
    }));
    const payout: Payout = {
      id: pnum, number: pnum, partner, status: "pending", periodStart, periodEnd,
      lines: plines, total: round2(plines.reduce((s, l) => s + l.amount, 0)), createdAt: now,
    };
    await putPayout(payout);
    await audit("payout", payout.id, actor, "created", `Payout for ${partner}: ${plines.length} visit(s)`);
    payouts.push(payout);
  }

  // Link work orders to their invoice and payout
  const payoutFor = new Map(payouts.flatMap((p) => p.lines.map((l) => [l.workOrderId, p.id] as const)));
  for (const t of visits) {
    await saveTask({ ...t, invoiceId: invoice.id, invoiceNumber: invoice.number, payoutId: t.payoutId ?? payoutFor.get(t.id) }, actor,
      `Added to invoice ${invoice.number}`, t);
  }
  return { invoice, payouts };
}

// ── Invoice lifecycle ────────────────────────────────────────────────────────
export class BillingError extends Error {}

export async function updateInvoice(
  id: string,
  action: "send" | "pay" | "void" | "add_adjustment" | "remove_line" | "credit" | "notes",
  body: { amount?: number; description?: string; lineId?: string; reason?: string; paidAt?: string; notes?: string },
  actor: Actor = "admin",
): Promise<Invoice> {
  const inv = await getInvoice(id);
  if (!inv) throw new BillingError("Invoice not found.");
  const now = new Date().toISOString();

  switch (action) {
    case "add_adjustment": {
      if (inv.status !== "draft") throw new BillingError("Only draft invoices can be adjusted. Issue a credit note instead.");
      const amount = Number(body.amount);
      if (!isFinite(amount) || amount === 0) throw new BillingError("Enter a non-zero amount (negative for a discount).");
      if (!body.description?.trim()) throw new BillingError("Describe the adjustment.");
      inv.lines.push({ id: lineId(), kind: "adjustment", description: body.description.trim(), amount: round2(amount) });
      Object.assign(inv, totals(inv.lines));
      await putInvoice(inv);
      await audit("invoice", inv.id, actor, "adjusted", `${body.description.trim()} (${amount >= 0 ? "+" : ""}${amount})`);
      return inv;
    }
    case "remove_line": {
      if (inv.status !== "draft") throw new BillingError("Lines can only be removed from a draft.");
      const line = inv.lines.find((l) => l.id === body.lineId);
      if (!line) throw new BillingError("Line not found.");
      inv.lines = inv.lines.filter((l) => l.id !== line.id);
      Object.assign(inv, totals(inv.lines));
      await putInvoice(inv);
      if (line.workOrderId) {
        const t = await getTask(line.workOrderId);
        if (t) await saveTask({ ...t, invoiceId: undefined, invoiceNumber: undefined }, actor, `Removed from invoice ${inv.number}`, t);
      }
      await audit("invoice", inv.id, actor, "line removed", line.description);
      return inv;
    }
    case "send": {
      if (inv.status !== "draft") throw new BillingError("Only a draft can be marked as sent.");
      if (!inv.lines.length) throw new BillingError("This invoice has no lines.");
      inv.status = "sent";
      inv.sentAt = now;
      inv.dueAt = new Date(Date.now() + getPricing().paymentTermsDays * 86_400_000).toISOString();
      await putInvoice(inv);
      await audit("invoice", inv.id, actor, "sent", `Due ${inv.dueAt.slice(0, 10)}`);
      return inv;
    }
    case "pay": {
      if (inv.status !== "sent") throw new BillingError("Only a sent invoice can be marked as paid.");
      inv.status = "paid";
      inv.paidAt = body.paidAt ? new Date(body.paidAt).toISOString() : now;
      await putInvoice(inv);
      await audit("invoice", inv.id, actor, "paid", body.reason);
      return inv;
    }
    case "void": {
      if (!["draft", "sent"].includes(inv.status)) throw new BillingError("Paid or already void invoices cannot be voided. Issue a credit note.");
      if (!body.reason?.trim()) throw new BillingError("Give a reason for voiding.");
      inv.status = "void";
      inv.voidedAt = now;
      await putInvoice(inv);
      // Release the visits so they can go on a new invoice
      for (const l of inv.lines) {
        if (!l.workOrderId) continue;
        const t = await getTask(l.workOrderId);
        if (t && t.invoiceId === inv.id) {
          await saveTask({ ...t, invoiceId: undefined, invoiceNumber: undefined }, actor, `Invoice ${inv.number} voided`, t);
        }
      }
      await audit("invoice", inv.id, actor, "voided", body.reason);
      return inv;
    }
    case "credit": {
      if (!["sent", "paid"].includes(inv.status)) throw new BillingError("Credit notes apply to sent or paid invoices.");
      const amount = Math.abs(Number(body.amount));
      if (!isFinite(amount) || amount === 0) throw new BillingError("Enter the amount to credit.");
      const credited = (await listInvoices()).filter((c) => c.kind === "credit" && c.creditFor === inv.id && c.status !== "void")
        .reduce((s, c) => s + Math.abs(c.total), 0);
      if (amount > inv.total - credited + 0.001) throw new BillingError(`You can credit at most ${round2(inv.total - credited)} on this invoice.`);
      if (!body.reason?.trim()) throw new BillingError("Give a reason for the credit.");
      const number = await nextNumber("CN", inv.periodStart);
      const lines: InvoiceLine[] = [{ id: lineId(), kind: "adjustment", description: `Credit against ${inv.number}: ${body.reason.trim()}`, amount: -round2(amount) }];
      const cn: Invoice = {
        id: number, number, kind: "credit", status: "sent", customer: inv.customer,
        periodStart: inv.periodStart, periodEnd: inv.periodEnd, lines, ...totals(lines),
        createdAt: now, sentAt: now, creditFor: inv.id,
      };
      await putInvoice(cn);
      await audit("invoice", cn.id, actor, "created", `Credit note for ${inv.number}: ${body.reason.trim()}`);
      await audit("invoice", inv.id, actor, "credited", `${number} for ${amount}: ${body.reason.trim()}`);
      return cn;
    }
    case "notes": {
      inv.notes = body.notes?.slice(0, 2000);
      await putInvoice(inv);
      return inv;
    }
  }
}

export async function updatePayout(id: string, action: "pay", body: { reference?: string; paidAt?: string }, actor: Actor = "admin") {
  const db = await getDb();
  const [row] = await db.query<{ data: unknown }>("SELECT data FROM payouts WHERE id = $1", [id]);
  if (!row) throw new BillingError("Payout not found.");
  const p = parse<Payout>(row.data);
  if (action === "pay") {
    if (p.status !== "pending") throw new BillingError("This payout is already paid.");
    p.status = "paid";
    p.paidAt = body.paidAt ? new Date(body.paidAt).toISOString() : new Date().toISOString();
    p.reference = body.reference?.trim() || undefined;
    await putPayout(p);
    await audit("payout", p.id, actor, "paid", p.reference ? `Reference ${p.reference}` : undefined);
  }
  return p;
}

export async function billingAudit(entity: "invoice" | "payout", id: string) {
  const db = await getDb();
  const rows = await db.query<{ id: number; at: string; actor: string; action: string; reason: string | null }>(
    `SELECT id, at, actor, action, reason FROM audit_log WHERE entity = $1 AND entity_id = $2 ORDER BY at DESC, id DESC`,
    [entity, id],
  );
  return rows.map((r) => ({ ...r, id: Number(r.id), at: new Date(r.at).toISOString() }));
}
