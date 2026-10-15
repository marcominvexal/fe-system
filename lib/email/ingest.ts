/**
 * /lib/email/ingest.ts — apply parsed Orange notifications to the task list.
 * Pure (no I/O): takes the current tasks, returns the new list and what
 * happened. Idempotent per Message-ID, so re-reading a mailbox is safe.
 */
import type { Task, EmailEvent } from "@/lib/store";
import { buildRuleKey, MAINTENANCE_LEVELS, SERVICE_LEVELS, DISTANCE_BANDS } from "@/lib/commercialEngine";
import { calcDuration } from "@/lib/store";
import { parseEmail, visitBand, type ParsedEmail } from "./parse";

export interface IncomingEmail {
  subject:   string;
  from:      string;
  date:      string;   // ISO
  messageId: string;
  text:      string;
}

export type IngestOutcome =
  | { status: "created"; taskId: string; workOrder: string; kind: ParsedEmail["kind"] }
  | { status: "updated"; taskId: string; workOrder: string; kind: ParsedEmail["kind"] }
  | { status: "duplicate"; taskId: string; workOrder: string }
  | { status: "ignored"; reason: string };

/** Senders whose notifications are trusted. Override with MAIL_ALLOWED_SENDERS. */
export function allowedSenders(): string[] {
  const env = process.env.MAIL_ALLOWED_SENDERS;
  const list = env ? env.split(",") : ["noreply@orange.com"];
  // Mail auto-forwarded by the mailbox owner keeps the owner as sender
  if (process.env.MAIL_USER) list.push(process.env.MAIL_USER);
  return list.map((s) => s.trim().toLowerCase()).filter(Boolean);
}

const addr = (from: string) => (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();

function nextId(tasks: Task[]): string {
  const nums = tasks.map((t) => parseInt(t.id.replace("T-", ""), 10)).filter((n) => !isNaN(n));
  return `T-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, "0")}`;
}

/** Pricing inputs are not in Orange emails; start from defaults the admin confirms on assignment. */
function defaultPricing() {
  const maintenanceLevel = MAINTENANCE_LEVELS[0];
  const serviceLevel     = SERVICE_LEVELS[0];
  const distanceBand     = DISTANCE_BANDS[0];
  const visitDuration    = "2h" as const;
  return { maintenanceLevel, serviceLevel, distanceBand, visitDuration,
    ruleKey: buildRuleKey(maintenanceLevel, serviceLevel, distanceBand, visitDuration) };
}

function blankTask(id: string, p: ParsedEmail, mail: IncomingEmail): Task {
  return {
    id,
    title: `Work order ${p.workOrder}`,
    description: "",
    customer: "Orange Business",
    location: p.kind !== "photo" && p.siteId ? p.siteId : "Unknown site",
    engineerId: "",
    engineerName: "Unassigned",
    status: "pending",
    maintenanceType: "On-site support",
    ...defaultPricing(),
    createdAt: mail.date,
    approved: false,
    source: "email",
    workOrder: p.workOrder,
    emailLog: [],
  };
}

const NOTE: Record<ParsedEmail["kind"], (p: ParsedEmail) => string> = {
  dispatch: () => "Work order received from Orange Business",
  photo:    (p) => `Photo uploaded: ${(p as Extract<ParsedEmail, { kind: "photo" }>).fileName}`,
  cleared:  (p) => `Orange marked the work order ${(p as Extract<ParsedEmail, { kind: "cleared" }>).status.toLowerCase()}`,
};

export function ingestEmail(tasks: Task[], mail: IncomingEmail): { tasks: Task[]; outcome: IngestOutcome } {
  if (!allowedSenders().includes(addr(mail.from))) {
    return { tasks, outcome: { status: "ignored", reason: `sender ${addr(mail.from)} not allowed` } };
  }
  const p = parseEmail(mail.subject, mail.text);
  if (!p) return { tasks, outcome: { status: "ignored", reason: "not an OBS work order notification" } };

  // Idempotency: this exact email was already applied
  const seen = tasks.find((t) => t.emailLog?.some((e) => e.messageId === mail.messageId));
  if (seen) return { tasks, outcome: { status: "duplicate", taskId: seen.id, workOrder: p.workOrder } };

  const list = [...tasks];
  let idx = list.findIndex((t) => t.workOrder === p.workOrder);
  const created = idx === -1;
  if (created) {
    list.push(blankTask(nextId(list), p, mail));
    idx = list.length - 1;
  }
  const t: Task = { ...list[idx] };
  const event: EmailEvent = { kind: p.kind, at: mail.date, subject: mail.subject, messageId: mail.messageId, note: NOTE[p.kind](p) };

  if (p.kind === "dispatch") {
    const area = p.city ?? p.siteId ?? "site";
    t.title       = `${p.product?.split(" · ")[0] ?? "Field visit"} — ${p.endCustomer ? titleCase(p.endCustomer) : area}`;
    t.description = p.description ?? t.description;
    t.location    = [p.siteId, p.address].filter(Boolean).join(" · ") || t.location;
    t.endCustomer = p.endCustomer;
    t.siteId      = p.siteId;
    t.product     = p.product;
    t.scheduledAt = p.scheduledAt;
    t.assignedBy  = p.assignedBy;
    t.siteContact = [p.contactName, p.contactPhone].filter(Boolean).join(" · ") || undefined;
    if (created && p.openedAt) t.createdAt = p.openedAt;
  }

  if (p.kind === "cleared" && /cleared|closed|completed/i.test(p.status)) {
    t.onSiteTimes = p.onSite;
    const inAt  = p.onSite.arriveOnSite ?? p.onSite.workStart;
    const outAt = p.onSite.leaveSite ?? p.onSite.workStop;
    if (inAt)  t.checkInTime  = inAt;
    if (outAt) t.checkOutTime = outAt;
    if (inAt && outAt) {
      t.duration = calcDuration(inAt, outAt);
      const band = visitBand((new Date(outAt).getTime() - new Date(inAt).getTime()) / 60000);
      t.visitDuration = band;
      t.ruleKey = buildRuleKey(t.maintenanceLevel, t.serviceLevel, t.distanceBand, band);
    }
    t.comments = [p.closureComment, p.parts, p.releasedNote].filter(Boolean).join("\n");
    if (!t.description && p.description) t.description = p.description;
    // Close the visit unless it was already billed or cancelled.
    // Without an engineer it stays in the assignment queue (times are kept).
    if (!["approved", "cancelled"].includes(t.status) && t.engineerId) t.status = "completed";
  }

  t.emailLog = [...(t.emailLog ?? []), event].sort((a, b) => a.at.localeCompare(b.at));
  list[idx] = t;
  return {
    tasks: list,
    outcome: { status: created ? "created" : "updated", taskId: t.id, workOrder: p.workOrder, kind: p.kind },
  };
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
