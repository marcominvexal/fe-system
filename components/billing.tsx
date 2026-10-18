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
export const isOverdue = (i: Invoice) => i.status === "sent" && !!i.dueAt && new Date(i.dueAt).getTime() < Date.now();

/** CSV of an invoice's lines for accounting systems (opened by Excel). */
export function invoiceCsv(inv: Invoice): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [
    ["Invoice", "Type", "Status", "Period start", "Period end", "Line type", "Work order", "Cleared", "Description", "Amount USD"],
    ...inv.lines.map((l) => [inv.number, inv.kind, inv.status, inv.periodStart, inv.periodEnd, l.kind, l.workOrder ?? "", l.date?.slice(0, 10) ?? "", l.description, l.amount.toFixed(2)]),
    [inv.number, inv.kind, inv.status, inv.periodStart, inv.periodEnd, "total", "", "", "Total", inv.total.toFixed(2)],
  ];
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
