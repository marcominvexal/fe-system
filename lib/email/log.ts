/**
 * /lib/email/log.ts — Server-side only. Keeps a record of every email the
 * automation has looked at (including ignored ones) and of each sync run.
 * Stored in Postgres (mail_log, sync_runs).
 */
import type { EmailKind } from "@/lib/store";
import { getDb } from "@/lib/db/client";
import { classify, isClosureStatus, statusFromSubject } from "./parse";
import type { IncomingEmail, IngestOutcome } from "./ingest";

export type MailOutcome = "created" | "updated" | "duplicate" | "ignored";

export interface MailLogEntry {
  messageId:   string;
  subject:     string;
  from:        string;
  date:        string;          // email date, ISO
  source:      "sync" | "import";
  processedAt: string;          // first time the app saw it
  lastSeenAt:  string;
  seenCount:   number;
  kind:        EmailKind | null;
  workOrder?:  string;
  outcome:     MailOutcome;
  reason?:     string;
  taskId?:     string;
  viaAi?:      boolean;          // read by Gemini rather than a fixed template
}

export interface SyncRun {
  at:         string;
  source:     "sync" | "import";
  scanned:    number;
  created:    number;
  updated:    number;
  duplicates: number;
  ignored:    number;
  error?:     string;
}

const parse = <T,>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;

export async function readMailLog(limit = 2000): Promise<{ entries: MailLogEntry[]; runs: SyncRun[] }> {
  const db = await getDb();
  const entries = await db.query<{ data: unknown }>("SELECT data FROM mail_log ORDER BY date DESC LIMIT $1", [limit]);
  const runs = await db.query<{ data: unknown }>("SELECT data FROM sync_runs ORDER BY at DESC, id DESC LIMIT 50");
  return { entries: entries.map((r) => parse<MailLogEntry>(r.data)), runs: runs.map((r) => parse<SyncRun>(r.data)) };
}

async function upsertEntry(e: MailLogEntry) {
  const db = await getDb();
  await db.query(
    `INSERT INTO mail_log (message_id, date, outcome, work_order, task_id, data) VALUES ($1,$2,$3,$4,$5,$6::jsonb)
     ON CONFLICT (message_id) DO UPDATE SET outcome = EXCLUDED.outcome, work_order = EXCLUDED.work_order,
       task_id = EXCLUDED.task_id, data = EXCLUDED.data`,
    [e.messageId, e.date, e.outcome, e.workOrder ?? null, e.taskId ?? null, JSON.stringify(e)],
  );
}

async function addRun(run: SyncRun) {
  const db = await getDb();
  await db.query("INSERT INTO sync_runs (at, data) VALUES ($1, $2::jsonb)", [run.at, JSON.stringify(run)]);
}

/** Record what happened to each email and append one run summary. */
export async function recordBatch(
  source: "sync" | "import",
  results: { mail: IncomingEmail; outcome: IngestOutcome }[],
  scanned = results.length,
) {
  const db = await getDb();
  const now = new Date().toISOString();

  for (const { mail, outcome } of results) {
    const [row] = await db.query<{ data: unknown }>("SELECT data FROM mail_log WHERE message_id = $1", [mail.messageId]);
    const existing = row ? parse<MailLogEntry>(row.data) : null;
    if (existing) {
      existing.lastSeenAt = now;
      existing.seenCount += 1;
      // A retry that now succeeded replaces the earlier "ignored" result
      if (existing.outcome === "ignored" && outcome.status !== "ignored" && outcome.status !== "duplicate") {
        existing.outcome = outcome.status;
        existing.reason = undefined;
        existing.taskId = "taskId" in outcome ? outcome.taskId : existing.taskId;
        existing.workOrder = "workOrder" in outcome ? outcome.workOrder : existing.workOrder;
        if ("viaAi" in outcome && outcome.viaAi) { existing.kind = "update"; existing.viaAi = true; }
      } else if (existing.outcome === "ignored" && outcome.status === "ignored") {
        existing.reason = outcome.reason;
      }
      await upsertEntry(existing);
      continue;
    }
    const c = classify(mail.subject);
    await upsertEntry({
      messageId: mail.messageId,
      subject:   mail.subject,
      from:      mail.from,
      date:      mail.date,
      source,
      processedAt: now,
      lastSeenAt:  now,
      seenCount:   1,
      kind:      "viaAi" in outcome && outcome.viaAi ? "update"
               : c?.kind === "cleared" && !isClosureStatus(statusFromSubject(mail.subject) ?? "") ? "update"
               : c?.kind ?? null,
      viaAi:     "viaAi" in outcome && outcome.viaAi ? true : undefined,
      workOrder: "workOrder" in outcome ? outcome.workOrder : c?.workOrder,
      outcome:   outcome.status,
      reason:    outcome.status === "ignored" ? outcome.reason : outcome.status === "duplicate" ? "Already applied to this job" : undefined,
      taskId:    "taskId" in outcome ? outcome.taskId : undefined,
    });
  }

  const count = (s: string) => results.filter((r) => r.outcome.status === s).length;
  await addRun({
    at: now, source, scanned,
    created: count("created"), updated: count("updated"),
    duplicates: count("duplicate"), ignored: count("ignored"),
  });
}

export async function recordFailedRun(source: "sync" | "import", error: string) {
  await addRun({ at: new Date().toISOString(), source, scanned: 0, created: 0, updated: 0, duplicates: 0, ignored: 0, error });
}
