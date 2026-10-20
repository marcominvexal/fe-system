/**
 * /lib/repo.ts — Server-side only. Work orders in Postgres, with every change
 * written to the audit trail (what changed, who or what changed it, and why).
 */
import type { Task } from "./store";
import { getDb } from "./db/client";
import { taskRow } from "./db/rows";
import { writeAudit } from "./audit";

/** Who made a change: Orange email template, Gemini, a person, or the system. */
export type Actor = "email" | "ai" | "admin" | "system";

export interface AuditEntry {
  id:       number;
  at:       string;
  actor:    Actor;
  action:   string;
  changes:  Record<string, [unknown, unknown]> | null;
  reason:   string | null;
  /** The signed-in person, for changes made by hand */
  userName?:  string | null;
  userEmail?: string | null;
}

const UPSERT = `
  INSERT INTO work_orders (id, work_order, status, source, customer, end_customer, charge_usd, fe_pay_usd, profit_usd, invoice_no, created_at, cleared_at, data, updated_at)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb, now())
  ON CONFLICT (id) DO UPDATE SET
    work_order = EXCLUDED.work_order, status = EXCLUDED.status, source = EXCLUDED.source,
    customer = EXCLUDED.customer, end_customer = EXCLUDED.end_customer,
    charge_usd = EXCLUDED.charge_usd, fe_pay_usd = EXCLUDED.fe_pay_usd, profit_usd = EXCLUDED.profit_usd,
    invoice_no = EXCLUDED.invoice_no, created_at = EXCLUDED.created_at, cleared_at = EXCLUDED.cleared_at,
    data = EXCLUDED.data, updated_at = now()`;

export async function listTasks(): Promise<Task[]> {
  const db = await getDb();
  const rows = await db.query<{ data: Task | string }>("SELECT data FROM work_orders ORDER BY created_at");
  return rows.map((r) => (typeof r.data === "string" ? JSON.parse(r.data) : r.data));
}

export async function getTask(id: string): Promise<Task | null> {
  const db = await getDb();
  const [row] = await db.query<{ data: Task | string }>("SELECT data FROM work_orders WHERE id = $1", [id]);
  return row ? (typeof row.data === "string" ? JSON.parse(row.data) : row.data) : null;
}

// Fields worth showing in history; large or derived ones are summarised instead
const SUMMARISE = new Set(["emailLog", "onSiteTimes", "pricingBasis", "description", "comments", "aiSummary"]);

/** Field-by-field difference between two versions of a work order. */
export function diff(before: Task | null, after: Task): Record<string, [unknown, unknown]> {
  const out: Record<string, [unknown, unknown]> = {};
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after)]);
  for (const k of keys) {
    const a = (before as unknown as Record<string, unknown> | null)?.[k];
    const b = (after as unknown as Record<string, unknown>)[k];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (SUMMARISE.has(k)) {
      const size = (v: unknown) => Array.isArray(v) ? `${v.length} item${v.length === 1 ? "" : "s"}` : v ? "set" : "empty";
      out[k] = [size(a), size(b)];
    } else {
      out[k] = [a ?? null, b ?? null];
    }
  }
  return out;
}

/** Insert or update one work order and record what changed. */
export async function saveTask(task: Task, actor: Actor, reason?: string, before?: Task | null) {
  const db = await getDb();
  const prev = before === undefined ? await getTask(task.id) : before;
  const changes = diff(prev, task);
  if (prev && Object.keys(changes).length === 0) return;
  await db.query(UPSERT, taskRow(task));
  await writeAudit({ entity: "work_order", entityId: task.id, actor, action: prev ? "updated" : "created", changes, reason });
}

/** Save every work order that differs between two snapshots (used after email processing). */
export async function saveChanged(
  before: Task[], after: Task[], actorFor: (t: Task) => Actor, reasonFor: (t: Task) => string | undefined,
) {
  const prevById = new Map(before.map((t) => [t.id, t]));
  for (const t of after) {
    const prev = prevById.get(t.id) ?? null;
    if (prev && JSON.stringify(prev) === JSON.stringify(t)) continue;
    await saveTask(t, actorFor(t), reasonFor(t), prev);
  }
}

export async function deleteTask(id: string, actor: Actor, reason?: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db.query<{ id: string }>("DELETE FROM work_orders WHERE id = $1 RETURNING id", [id]);
  if (!rows.length) return false;
  await writeAudit({ entity: "work_order", entityId: id, actor, action: "deleted", reason });
  return true;
}

/**
 * Highest work order number ever issued, including deleted ones, so a number
 * (and its history) is never reused.
 */
export async function highestTaskNumber(): Promise<number> {
  const db = await getDb();
  const [row] = await db.query<{ n: number | null }>(
    `SELECT max(n)::int AS n FROM (
       SELECT NULLIF(regexp_replace(id, '\\D', '', 'g'), '')::int AS n FROM work_orders
       UNION ALL
       SELECT NULLIF(regexp_replace(entity_id, '\\D', '', 'g'), '')::int FROM audit_log WHERE entity = 'work_order'
     ) ids`,
  );
  return row?.n ?? 0;
}

export async function auditFor(id: string): Promise<AuditEntry[]> {
  const db = await getDb();
  const rows = await db.query<AuditEntry & { at: string | Date; changes: unknown }>(
    `SELECT id, at, actor, action, changes, reason, user_name AS "userName", user_email AS "userEmail" FROM audit_log WHERE entity = 'work_order' AND entity_id = $1 ORDER BY at DESC, id DESC`,
    [id],
  );
  return rows.map((r) => ({
    ...r,
    id: Number(r.id),
    at: new Date(r.at).toISOString(),
    changes: (typeof r.changes === "string" ? JSON.parse(r.changes) : r.changes) as AuditEntry["changes"],
  }));
}
