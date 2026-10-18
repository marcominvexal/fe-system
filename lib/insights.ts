/**
 * /lib/insights.ts — revenue leakage, anomalies and collection risks found by
 * checking work orders, the email log, invoices and payouts against each other.
 *
 * `computeFindings` is pure; `getInsights` (server-only) loads the data and
 * applies dismissals. Each finding has a stable key so it can be dismissed.
 */
import type { Task } from "./store";
import type { Invoice, Payout } from "./billing";
import type { MailLogEntry } from "./email/log";
import { calculateCommercial } from "./commercialEngine";
import { getPricing } from "./pricing";
import { pricingConfidence, REVIEW_THRESHOLD } from "./confidence";

export type Severity = "high" | "medium" | "low";
export type FindingType =
  | "cleared_not_billed" | "billed_not_invoiced" | "unlinked_thread" | "closure_without_dispatch"
  | "stale_open" | "duplicate_work_order" | "implausible_duration" | "visit_band_mismatch"
  | "price_mismatch" | "late_arrival" | "pricing_review" | "invoice_overdue" | "payout_overdue";

export const FINDING_GROUP: Record<FindingType, "Revenue leakage" | "Anomaly" | "Collections" | "Pricing review"> = {
  cleared_not_billed: "Revenue leakage", billed_not_invoiced: "Revenue leakage", unlinked_thread: "Revenue leakage",
  closure_without_dispatch: "Revenue leakage", stale_open: "Revenue leakage",
  duplicate_work_order: "Anomaly", implausible_duration: "Anomaly", visit_band_mismatch: "Anomaly",
  price_mismatch: "Anomaly", late_arrival: "Anomaly",
  pricing_review: "Pricing review",
  invoice_overdue: "Collections", payout_overdue: "Collections",
};

export interface Finding {
  key:       string;
  type:      FindingType;
  severity:  Severity;
  title:     string;
  detail:    string;
  amount?:   number;        // money at stake (USD)
  taskId?:   string;
  invoiceId?: string;
  href?:     string;        // where to fix it
  action?:   string;
  at?:       string;        // when the issue started
}

const DAY = 86_400_000;
const GRACE_MS = 30 * 60_000;
const ts = (iso?: string) => (iso ? new Date(iso).getTime() : NaN);
const clearedAt = (t: Task) => t.emailLog?.find((e) => e.kind === "cleared")?.at ?? t.checkOutTime;
const woLabel = (t: Task) => t.workOrder ? `WO ${t.workOrder}` : t.id;
const jobHref = (t: Task) => `/admin/jobs/${t.id}`;
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export function computeFindings(
  tasks: Task[], invoices: Invoice[], payouts: Payout[], mail: MailLogEntry[], now = Date.now(),
): Finding[] {
  const out: Finding[] = [];
  const live = tasks.filter((t) => t.status !== "cancelled");

  for (const t of live) {
    const cleared = clearedAt(t);

    // Cleared by Orange but never billed
    if (t.status === "completed") {
      const v = calculateCommercial(t.maintenanceLevel, t.serviceLevel, t.distanceBand, t.visitDuration).customerChargeUSD;
      out.push({ key: `cleared_not_billed:${t.id}`, type: "cleared_not_billed", severity: "high",
        title: `${woLabel(t)} cleared but not billed`, detail: "Orange closed the visit, but billing was never locked. Check the price and bill it.",
        amount: v, taskId: t.id, href: jobHref(t), action: "Review & bill", at: cleared });
    }

    // Billed but sitting off any invoice for too long
    if (t.status === "approved" && !t.invoiceId && cleared && now - ts(cleared) > 35 * DAY) {
      out.push({ key: `billed_not_invoiced:${t.id}`, type: "billed_not_invoiced", severity: "high",
        title: `${woLabel(t)} billed ${Math.floor((now - ts(cleared)) / DAY)} days ago, not invoiced`,
        detail: "Include it in an invoice run so the revenue is collected.",
        amount: t.customerChargeUSD, taskId: t.id, href: "/admin/invoices", action: "Invoice it", at: cleared });
    }

    // Dispatched, booked time long past, still no closure from Orange
    if (["assigned", "accepted", "in_progress"].includes(t.status) && t.scheduledAt && now - ts(t.scheduledAt) > 3 * DAY) {
      const v = calculateCommercial(t.maintenanceLevel, t.serviceLevel, t.distanceBand, t.visitDuration).customerChargeUSD;
      out.push({ key: `stale_open:${t.id}`, type: "stale_open", severity: "medium",
        title: `${woLabel(t)} still open ${Math.floor((now - ts(t.scheduledAt)) / DAY)} days after the booked visit`,
        detail: "No cleared notification has arrived. Ask Orange to close it in OBSLink, or cancel it if the visit did not happen.",
        amount: v, taskId: t.id, href: jobHref(t), action: "Open job", at: t.scheduledAt });
    }

    // Closed without a dispatch email: pricing inputs were guessed
    if (t.source === "email" && cleared && !t.emailLog?.some((e) => e.kind === "dispatch") && !t.pricingReviewed) {
      out.push({ key: `closure_without_dispatch:${t.id}`, type: "closure_without_dispatch", severity: "medium",
        title: `${woLabel(t)} has a closure but no dispatch email`,
        detail: "Booking time, site and product were never received, so the price is based on defaults. Upload the dispatch email or confirm the price.",
        amount: t.customerChargeUSD, taskId: t.id, href: jobHref(t), action: "Check pricing", at: cleared });
    }

    // On-site times that do not make sense
    const s = t.onSiteTimes;
    const inAt = s?.arriveOnSite ?? t.checkInTime, outAt = s?.leaveSite ?? t.checkOutTime;
    if (inAt && outAt) {
      const mins = (ts(outAt) - ts(inAt)) / 60_000;
      if (mins < 15 || mins > 14 * 60) {
        out.push({ key: `implausible_duration:${t.id}`, type: "implausible_duration", severity: "medium",
          title: `${woLabel(t)} shows ${mins < 60 ? `${Math.round(mins)} min` : `${(mins / 60).toFixed(1)} h`} on site`,
          detail: "The arrival and departure times look wrong. Check Orange's timestamps before invoicing.",
          amount: t.customerChargeUSD, taskId: t.id, href: jobHref(t), action: "Check times", at: outAt });
      }
      // Billed visit length differs from what the timestamps support
      const { twoHourMaxMin, halfDayMaxMin } = getPricing().rules.visitBands;
      const band = mins <= twoHourMaxMin ? "2h" : mins <= halfDayMaxMin ? "Half Day" : "Full Day";
      if (t.status === "approved" && band !== t.visitDuration && !t.pricingReviewed) {
        const right = calculateCommercial(t.maintenanceLevel, t.serviceLevel, t.distanceBand, band).customerChargeUSD;
        const diff = right - (t.customerChargeUSD ?? 0);
        out.push({ key: `visit_band_mismatch:${t.id}`, type: "visit_band_mismatch", severity: diff > 0 ? "high" : "medium",
          title: `${woLabel(t)} billed as ${t.visitDuration}, timestamps say ${band}`,
          detail: diff > 0 ? `Likely under-billed by ${usd(diff)}.` : `Likely over-billed by ${usd(-diff)}, which Orange may dispute.`,
          amount: Math.abs(diff), taskId: t.id, href: jobHref(t), action: "Adjust pricing", at: outAt });
      }
    }

    // Billed price no longer matches the rate card for its inputs (rates edited since)
    if (t.status === "approved" && !t.invoiceId && t.customerChargeUSD != null) {
      const now$ = calculateCommercial(t.maintenanceLevel, t.serviceLevel, t.distanceBand, t.visitDuration).customerChargeUSD;
      if (now$ !== t.customerChargeUSD) {
        out.push({ key: `price_mismatch:${t.id}:${now$}`, type: "price_mismatch", severity: "low",
          title: `${woLabel(t)} billed at ${usd(t.customerChargeUSD)}, rate card now says ${usd(now$)}`,
          detail: "The rate card changed after this visit was billed. Billed prices are kept; adjust it only if the new rate should apply.",
          amount: Math.abs(now$ - t.customerChargeUSD), taskId: t.id, href: jobHref(t), action: "Review" });
      }
    }

    // Arrived after Orange's booked window: possible SLA penalty
    if (t.scheduledAt && inAt) {
      const late = ts(inAt) - (ts(t.scheduledAt) + GRACE_MS);
      if (late > 0) {
        const mins = Math.round(late / 60_000);
        out.push({ key: `late_arrival:${t.id}`, type: "late_arrival", severity: mins > 60 ? "high" : "low",
          title: `${woLabel(t)} arrived ${mins < 60 ? `${mins} min` : `${(mins / 60).toFixed(1)} h`} after the booked window`,
          detail: "Orange may apply an SLA penalty. Note the reason now, in case it is disputed.",
          taskId: t.id, href: jobHref(t), action: "Open job", at: inAt });
      }
    }

    // Price confidence too low to invoice without a look
    if (["approved", "completed"].includes(t.status) && !t.invoiceId) {
      const c = pricingConfidence(t);
      if (c.score < REVIEW_THRESHOLD) {
        out.push({ key: `pricing_review:${t.id}`, type: "pricing_review", severity: c.score < 50 ? "high" : "medium",
          title: `${woLabel(t)} price confidence ${c.score}%`, detail: c.reasons.map((r) => r.text).join(" · "),
          amount: t.customerChargeUSD, taskId: t.id, href: jobHref(t), action: "Review price" });
      }
    }
  }

  // Same Orange work order on more than one job
  const byWo = new Map<string, Task[]>();
  for (const t of live) if (t.workOrder) {
    const base = t.workOrder.split("-")[0];
    byWo.set(base, [...(byWo.get(base) ?? []), t]);
  }
  for (const [base, list] of byWo) {
    if (list.length < 2) continue;
    // Distinct visit numbers (-1, -2) are legitimate revisits; identical numbers are duplicates
    const ids = new Set(list.map((t) => t.workOrder));
    if (ids.size === list.length) continue;
    out.push({ key: `duplicate_work_order:${base}`, type: "duplicate_work_order", severity: "high",
      title: `Work order ${base} appears on ${list.length} jobs`, detail: `${list.map((t) => t.id).join(", ")} — billing it twice would be rejected by Orange.`,
      amount: list.slice(1).reduce((s, t) => s + (t.customerChargeUSD ?? 0), 0), taskId: list[0].id, href: jobHref(list[0]), action: "Compare jobs" });
  }

  // Orange-related emails the system read but could not tie to a job
  for (const e of mail) {
    if (e.outcome !== "ignored" || !e.reason) continue;
    if (!/AI: relevant|AI reading is off|AI could not read|Skipped: AI limit/i.test(e.reason)) continue;
    out.push({ key: `unlinked_thread:${e.messageId}`, type: "unlinked_thread", severity: "medium",
      title: `Orange email not linked to a job`, detail: `“${e.subject}” — ${e.reason}`,
      href: "/admin/inbox", action: "Open inbox", at: e.date });
  }

  // Collections
  for (const i of invoices) {
    if (i.kind === "invoice" && i.status === "sent" && i.dueAt && ts(i.dueAt) < now) {
      const credited = invoices.filter((c) => c.kind === "credit" && c.creditFor === i.id && c.status !== "void").reduce((s, c) => s + Math.abs(c.total), 0);
      const days = Math.floor((now - ts(i.dueAt)) / DAY);
      out.push({ key: `invoice_overdue:${i.id}`, type: "invoice_overdue", severity: days > 30 ? "high" : "medium",
        title: `${i.number} is ${days} day${days === 1 ? "" : "s"} overdue`, detail: `Due ${new Date(i.dueAt).toLocaleDateString("en-GB")}. Chase Orange for payment.`,
        amount: i.total - credited, invoiceId: i.id, href: `/admin/invoices/${i.id}`, action: "Open invoice", at: i.dueAt });
    }
  }
  for (const p of payouts) {
    if (p.status === "pending" && now - ts(p.createdAt) > 30 * DAY) {
      out.push({ key: `payout_overdue:${p.id}`, type: "payout_overdue", severity: "medium",
        title: `${p.number} to ${p.partner} pending ${Math.floor((now - ts(p.createdAt)) / DAY)} days`,
        detail: "Partners are owed for completed visits. Pay it or record the payment.", amount: p.total, href: "/admin/invoices", action: "Open payouts", at: p.createdAt });
    }
  }

  const rank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || (b.amount ?? 0) - (a.amount ?? 0));
}

