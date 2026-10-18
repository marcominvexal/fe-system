/**
 * /lib/db/migrate.ts — one-time import of the JSON files the app used before
 * Postgres. Each table is only filled if it is still empty, so this is safe
 * to run on every start-up.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { Db } from "./client";
import type { Task } from "@/lib/store";
import { taskRow } from "./rows";

const file = (name: string) => join(process.cwd(), "data", name);
function readJson<T>(name: string): T | null {
  try { return existsSync(file(name)) ? JSON.parse(readFileSync(file(name), "utf-8")) as T : null; } catch { return null; }
}

export async function migrateFromJson(db: Db) {
  const [{ n: tasksN }] = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM work_orders");
  if (tasksN === 0) {
    const tasks = readJson<Task[]>("db.json") ?? [];
    for (const t of tasks) {
      const r = taskRow(t);
      await db.query(
        `INSERT INTO work_orders (id, work_order, status, source, customer, end_customer, charge_usd, fe_pay_usd, profit_usd, invoice_no, created_at, cleared_at, data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb) ON CONFLICT (id) DO NOTHING`, r);
      await db.query(
        `INSERT INTO audit_log (entity, entity_id, actor, action, reason) VALUES ('work_order', $1, 'system', 'imported', 'Moved from data/db.json to the database')`,
        [t.id]);
    }
  }

  const [{ n: mailN }] = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM mail_log");
  const [{ n: runsN }] = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM sync_runs");
  if (mailN === 0 && runsN === 0) {
    const log = readJson<{ entries?: { messageId: string; date: string; outcome: string; workOrder?: string; taskId?: string }[]; runs?: { at: string }[] }>("mail-log.json");
    for (const e of log?.entries ?? []) {
      await db.query(
        `INSERT INTO mail_log (message_id, date, outcome, work_order, task_id, data) VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT DO NOTHING`,
        [e.messageId, e.date, e.outcome, e.workOrder ?? null, e.taskId ?? null, JSON.stringify(e)]);
    }
    for (const r of log?.runs ?? []) {
      await db.query(`INSERT INTO sync_runs (at, data) VALUES ($1, $2::jsonb)`, [r.at, JSON.stringify(r)]);
    }
  }

  const state = readJson<Record<string, unknown>>("mail-state.json");
  if (state) {
    await db.query(`INSERT INTO app_state (key, value) VALUES ('mail_sync', $1::jsonb) ON CONFLICT (key) DO NOTHING`, [JSON.stringify(state)]);
  }
}
