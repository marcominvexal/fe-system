/**
 * /lib/email/log.ts — Server-side only. Keeps a record of every email the
 * automation has looked at (including ignored ones) and of each sync run,
 * in data/mail-log.json (memory fallback on read-only hosts).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { EmailKind } from "@/lib/store";
import { classify } from "./parse";
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

interface MailLog { entries: MailLogEntry[]; runs: SyncRun[] }

const PATH = join(process.cwd(), "data", "mail-log.json");
const MAX_ENTRIES = 2000;
const MAX_RUNS = 50;
let memory: MailLog | null = null;

export function readMailLog(): MailLog {
  if (memory) return memory;
  try {
    if (existsSync(PATH)) {
      const raw = JSON.parse(readFileSync(PATH, "utf-8")) as Partial<MailLog>;
      return { entries: raw.entries ?? [], runs: raw.runs ?? [] };
    }
  } catch { /* fall through */ }
  return { entries: [], runs: [] };
}

function write(log: MailLog) {
  const trimmed = { entries: log.entries.slice(0, MAX_ENTRIES), runs: log.runs.slice(0, MAX_RUNS) };
  try {
    mkdirSync(join(process.cwd(), "data"), { recursive: true });
    writeFileSync(PATH, JSON.stringify(trimmed, null, 2), "utf-8");
  } catch {
    memory = trimmed;
  }
}

/** Record what happened to each email and append one run summary. */
export function recordBatch(
  source: "sync" | "import",
  results: { mail: IncomingEmail; outcome: IngestOutcome }[],
  scanned = results.length,
) {
  const log = readMailLog();
  const now = new Date().toISOString();
  const byId = new Map(log.entries.map((e) => [e.messageId, e]));

  for (const { mail, outcome } of results) {
    const existing = byId.get(mail.messageId);
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
      continue;
    }
    const c = classify(mail.subject);
    const entry: MailLogEntry = {
      messageId: mail.messageId,
      subject:   mail.subject,
      from:      mail.from,
      date:      mail.date,
      source,
      processedAt: now,
      lastSeenAt:  now,
      seenCount:   1,
      kind:      "viaAi" in outcome && outcome.viaAi ? "update" : c?.kind ?? null,
      viaAi:     "viaAi" in outcome && outcome.viaAi ? true : undefined,
      workOrder: "workOrder" in outcome ? outcome.workOrder : c?.workOrder,
      outcome:   outcome.status,
      reason:    outcome.status === "ignored" ? outcome.reason : outcome.status === "duplicate" ? "Already applied to this job" : undefined,
      taskId:    "taskId" in outcome ? outcome.taskId : undefined,
    };
    log.entries.unshift(entry);
    byId.set(entry.messageId, entry);
  }
  log.entries.sort((a, b) => b.date.localeCompare(a.date));

  const count = (s: string) => results.filter((r) => r.outcome.status === s).length;
  log.runs.unshift({
    at: now, source, scanned,
    created: count("created"), updated: count("updated"),
    duplicates: count("duplicate"), ignored: count("ignored"),
  });
  write(log);
}

export function recordFailedRun(source: "sync" | "import", error: string) {
  const log = readMailLog();
  log.runs.unshift({ at: new Date().toISOString(), source, scanned: 0, created: 0, updated: 0, duplicates: 0, ignored: 0, error });
  write(log);
}
