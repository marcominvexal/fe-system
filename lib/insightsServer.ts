/**
 * /lib/insightsServer.ts — Server-side only. Loads everything the checks need,
 * applies dismissals, and records dismiss/restore in the audit trail.
 */
import { getDb } from "./db/client";
import { listTasks } from "./repo";
import { listInvoices, listPayouts } from "./billing";
import { readMailLog } from "./email/log";
import { loadPricing } from "./settings";
import { computeFindings, FINDING_GROUP, type Finding } from "./insights";
import { writeAudit } from "@/lib/audit";

interface Dismissal { at: string; reason: string }

async function readDismissed(): Promise<Record<string, Dismissal>> {
  const db = await getDb();
  const [row] = await db.query<{ value: unknown }>("SELECT value FROM app_state WHERE key = 'dismissed_findings'");
  return row ? (typeof row.value === "string" ? JSON.parse(row.value) : row.value) as Record<string, Dismissal> : {};
}

async function writeDismissed(d: Record<string, Dismissal>) {
  const db = await getDb();
  await db.query(
    `INSERT INTO app_state (key, value) VALUES ('dismissed_findings', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(d)],
  );
}

export async function getInsights() {
  await loadPricing();
  const [tasks, invoices, payouts, mail, dismissed] = await Promise.all([
    listTasks(), listInvoices(), listPayouts(), readMailLog(), readDismissed(),
  ]);
  const all = computeFindings(tasks, invoices, payouts, mail.entries);
  const active = all.filter((f) => !dismissed[f.key]);
  const hidden = all.filter((f) => dismissed[f.key]).map((f) => ({ ...f, dismissed: dismissed[f.key] }));

  const atRisk = active
    .filter((f) => FINDING_GROUP[f.type] !== "Collections" && f.severity !== "low")
    .reduce((s, f) => s + (f.amount ?? 0), 0);
  const overdue = active.filter((f) => f.type === "invoice_overdue").reduce((s, f) => s + (f.amount ?? 0), 0);
  const byGroup = Object.fromEntries(
    ["Revenue leakage", "Anomaly", "Pricing review", "Collections"].map((g) => [g, active.filter((f) => FINDING_GROUP[f.type] === g).length]),
  );
  return {
    findings: active,
    dismissed: hidden,
    summary: { atRisk, overdue, high: active.filter((f) => f.severity === "high").length, total: active.length, byGroup },
  };
}

export async function dismissFinding(f: Pick<Finding, "key" | "title">, reason: string) {
  const d = await readDismissed();
  d[f.key] = { at: new Date().toISOString(), reason };
  await writeDismissed(d);
  await writeAudit({ entity: "finding", entityId: f.key, actor: "admin", action: "dismissed", reason: `${f.title} — ${reason}` });
}

export async function restoreFinding(key: string) {
  const d = await readDismissed();
  delete d[key];
  await writeDismissed(d);
  await writeAudit({ entity: "finding", entityId: key, actor: "admin", action: "restored" });
}
