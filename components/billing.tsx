"use client";

import type { Invoice } from "@/lib/billing";
import type { Tone } from "./ui";

export const INVOICE_TONE: Record<Invoice["status"], Tone> = { draft: "neutral", sent: "info", paid: "ok", void: "muted" };
export const INVOICE_LABEL: Record<Invoice["status"], string> = { draft: "Draft", sent: "Sent", paid: "Paid", void: "Void" };

/** Status wording: credit notes are "issued" rather than "sent". */
export const statusLabel = (i: Invoice) => (i.kind === "credit" && i.status === "sent" ? "Issued" : INVOICE_LABEL[i.status]);

export const fmtDay = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
export const monthLabel = (d: string) =>
  new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
/** The billing cycle an invoice covers, e.g. "November 2026 cycle", or its month for older invoices. */
export const periodLabel = (p: { cycle?: string; periodStart: string; periodEnd: string }) => {
  if (p.cycle) return `${p.cycle} cycle`;
  return p.periodStart.slice(8) === "01" ? monthLabel(p.periodStart) : `${fmtDay(p.periodStart)} – ${fmtDay(p.periodEnd)}`;
};
export const isOverdue = (i: Invoice) => i.status === "sent" && !!i.dueAt && new Date(i.dueAt).getTime() < Date.now();

/** CSV of an invoice's lines for accounting systems (opened by Excel). */
const LINE_LABEL: Record<Invoice["lines"][number]["kind"], string> = { mrc: "Monthly charge", visit: "Visit", hotel: "Hotel", adjustment: "Adjustment" };

/** The invoice as a spreadsheet (opens in Excel). */
export function invoiceCsv(inv: Invoice): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const period = inv.cycle ? `${inv.cycle} cycle` : `${inv.periodStart} to ${inv.periodEnd}`;
  const rows: unknown[][] = [
    ["Invoice", inv.number, inv.kind === "credit" ? "Credit note" : "Invoice", period, `${inv.periodStart} to ${inv.periodEnd}`, `Status: ${inv.status}`],
    [],
    ["Item", "Work order", "Engineer", "Cleared", "Billing", "Description", "Rate card USD", "Amount USD"],
    ...inv.lines.map((l) => [
      LINE_LABEL[l.kind], l.workOrder ?? "", l.engineer ?? "", l.date?.slice(0, 10) ?? "",
      l.kind === "visit" && l.included !== undefined ? (l.included ? "Included" : "Extra") : "",
      l.description, l.rated ?? "", l.amount.toFixed(2),
    ]),
    [],
    ["Total USD", "", "", "", "", "", "", inv.total.toFixed(2)],
  ];
  if (inv.usdToPkr) rows.push([`Total PKR at ${inv.usdToPkr}`, "", "", "", "", "", "", Math.round(inv.total * inv.usdToPkr)]);
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

export function downloadText(name: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
