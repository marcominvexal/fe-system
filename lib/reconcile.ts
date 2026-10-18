/**
 * /lib/reconcile.ts — compare Orange's monthly statement with our billing
 * (client-safe, pure). Statements arrive in different layouts, so columns are
 * found by name and by content: a work order looks like 18531881 or
 * 18531881-1, and the amount is the money column.
 */
import type { Task } from "./store";

export interface StatementRow { workOrder: string; amount: number; line: number; raw: string }
export interface ParsedStatement { rows: StatementRow[]; skipped: number; columns: { workOrder: string; amount: string } | null; error?: string }

export type MatchStatus = "matched" | "amount_differs" | "missing_ours" | "missing_theirs";
export interface ReconLine {
  workOrder:   string;
  status:      MatchStatus;
  theirs?:     number;
  ours?:       number;
  difference?: number;     // theirs − ours
  taskId?:     string;
  invoiceNumber?: string;
}

const WO_RE = /\b(\d{8}(?:-\d{1,2})?)\b/;

/** Minimal CSV reader: quotes, escaped quotes, commas or semicolons. */
function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (q) {
      if (c === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const money = (s: string) => {
  const n = Number(s.replace(/[^\d.\-]/g, ""));
  return s.trim() && isFinite(n) ? n : NaN;
};

export function parseStatement(text: string): ParsedStatement {
  const rows = parseCsv(text);
  if (rows.length < 2) return { rows: [], skipped: 0, columns: null, error: "The file has no data rows." };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const body = rows.slice(1);

  // Work order column: by name, else the column whose values look like work orders
  let woCol = header.findIndex((h) => /work\s*order|^wo\b|w\.o|flip|ticket|reference|ref\b/.test(h));
  if (woCol < 0 || !body.some((r) => WO_RE.test(r[woCol] ?? ""))) {
    let best = -1, hits = 0;
    header.forEach((_, i) => { const n = body.filter((r) => WO_RE.test(r[i] ?? "")).length; if (n > hits) { hits = n; best = i; } });
    woCol = best;
  }
  // Amount column: by name, else the right-most mostly-numeric column
  let amtCol = header.findIndex((h, i) => i !== woCol && /amount|total|charge|usd|value|price|cost/.test(h));
  if (amtCol < 0) {
    for (let i = header.length - 1; i >= 0; i--) {
      if (i === woCol) continue;
      if (body.filter((r) => !isNaN(money(r[i] ?? ""))).length >= body.length * 0.6) { amtCol = i; break; }
    }
  }
  if (woCol < 0 || amtCol < 0) {
    return { rows: [], skipped: body.length, columns: null, error: "Could not find a work order column and an amount column. Make sure the file has headers like “Work Order” and “Amount”." };
  }

  const out: StatementRow[] = [];
  let skipped = 0;
  body.forEach((r, i) => {
    const wo = (r[woCol] ?? "").match(WO_RE)?.[1];
    const amount = money(r[amtCol] ?? "");
    if (!wo || isNaN(amount)) { skipped++; return; }
    out.push({ workOrder: wo, amount, line: i + 2, raw: r.join(", ") });
  });
  return { rows: out, skipped, columns: { workOrder: rows[0][woCol], amount: rows[0][amtCol] } };
}

const base = (wo: string) => wo.split("-")[0];

/**
 * Line-by-line comparison. `ours` should be the billed work orders for the
 * statement's month; a statement line matches a job on the exact work order,
 * or on the base number when only one job has it.
 */
export function reconcile(statement: StatementRow[], ours: Task[]): ReconLine[] {
  // Combine duplicate statement lines for the same work order
  const theirs = new Map<string, number>();
  for (const r of statement) theirs.set(r.workOrder, (theirs.get(r.workOrder) ?? 0) + r.amount);

  const used = new Set<string>();
  const lines: ReconLine[] = [];
  for (const [wo, amount] of theirs) {
    const exact = ours.filter((t) => t.workOrder === wo);
    const loose = exact.length ? exact : ours.filter((t) => t.workOrder && base(t.workOrder) === base(wo));
    const t = loose.length === 1 || exact.length ? loose[0] : undefined;
    if (!t) { lines.push({ workOrder: wo, status: "missing_ours", theirs: amount }); continue; }
    used.add(t.id);
    const mine = t.customerChargeUSD ?? 0;
    const diff = Math.round((amount - mine) * 100) / 100;
    lines.push({
      workOrder: wo, theirs: amount, ours: mine, difference: diff, taskId: t.id, invoiceNumber: t.invoiceId ? t.invoiceNumber : undefined,
      status: Math.abs(diff) < 0.5 ? "matched" : "amount_differs",
    });
  }
  for (const t of ours) {
    if (used.has(t.id)) continue;
    lines.push({ workOrder: t.workOrder ?? t.id, status: "missing_theirs", ours: t.customerChargeUSD ?? 0, taskId: t.id,
      invoiceNumber: t.invoiceId ? t.invoiceNumber : undefined });
  }
  const order: Record<MatchStatus, number> = { amount_differs: 0, missing_ours: 1, missing_theirs: 2, matched: 3 };
  return lines.sort((a, b) => order[a.status] - order[b.status] || a.workOrder.localeCompare(b.workOrder));
}
