/**
 * /lib/email/ingest.ts — apply parsed Orange notifications to the task list.
 * Pure (no I/O): takes the current tasks, returns the new list and what
 * happened. Idempotent per Message-ID, so re-reading a mailbox is safe.
 *
 * The email trail drives the whole lifecycle — no manual steps:
 *   dispatch → assigned (priced automatically)
 *   photo    → in_progress
 *   cleared  → approved: on-site times recorded, invoice issued, billing locked
 *   cancelled→ cancelled
 */
import type { Task, EmailEvent, TaskStatus } from "@/lib/store";
import { buildRuleKey, calculateCommercial } from "@/lib/commercialEngine";
import { calcDuration, generateInvoiceNumber } from "@/lib/store";
import { parseEmail, type ParsedEmail } from "./parse";
import { AUTO_APPROVE_ON_CLEARED, classifyDistance, classifyService, classifyVisit } from "./rules";
import type { AiExtraction } from "./ai";

export type IngestKind = ParsedEmail["kind"] | "update";

export interface IncomingEmail {
  subject:   string;
  from:      string;
  date:      string;   // ISO
  messageId: string;
  text:      string;
  uid?:      number;   // IMAP UID when read from a mailbox
}

export type IngestOutcome =
  | { status: "created"; taskId: string; workOrder: string; kind: IngestKind; viaAi?: boolean }
  | { status: "updated"; taskId: string; workOrder: string; kind: IngestKind; viaAi?: boolean }
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

/** Field engineers are the partner's (ASP); Orange never names the person. */
const ASP_ENGINEER = { engineerId: "asp", engineerName: "ASP field engineer" };

function blankTask(id: string, p: ParsedEmail, mail: IncomingEmail): Task {
  const svc = classifyService();
  const dist = classifyDistance();
  return {
    id,
    title: `Work order ${p.workOrder}`,
    description: "",
    customer: "Orange Business",
    location: p.kind !== "photo" && p.siteId ? p.siteId : "Unknown site",
    ...ASP_ENGINEER,
    status: "assigned",
    maintenanceType: "On-site support",
    maintenanceLevel: svc.maintenanceLevel,
    serviceLevel: svc.serviceLevel,
    distanceBand: dist.distanceBand,
    visitDuration: "2h",
    ruleKey: buildRuleKey(svc.maintenanceLevel, svc.serviceLevel, dist.distanceBand, "2h"),
    pricingBasis: [...svc.basis, dist.basis],
    createdAt: mail.date,
    approved: false,
    source: "email",
    workOrder: p.workOrder,
    emailLog: [],
  };
}

const LOCKED: TaskStatus[] = ["approved", "cancelled"];

function note(p: ParsedEmail): string {
  if (p.kind === "dispatch") return "Work order received from Orange Business";
  if (p.kind === "photo") return `Photo uploaded: ${p.fileName}`;
  return `Orange marked the work order ${p.status.toLowerCase()}`;
}

/**
 * A template notification is trusted when it comes straight from an allowed
 * sender, or when it was forwarded and the quoted original is from one
 * (e.g. Orange mail auto-forwarded from the company mailbox to Gmail).
 */
export function isTrusted(mail: IncomingEmail): boolean {
  const allowed = allowedSenders();
  if (allowed.includes(addr(mail.from))) return true;
  const quoted = [...mail.text.slice(0, 6000).matchAll(/^[ \t>]*From:\s*(.+)$/gim)].map((m) => addr(m[1]));
  return quoted.some((a) => allowed.includes(a.replace(/^.*?([^\s<"]+@[^\s>"]+).*$/, "$1")));
}

/** Work orders match exactly, or on the base number ("18533289" ↔ "18533289-1"). */
export function sameWorkOrder(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return a === b || a.split("-")[0] === b.split("-")[0];
}

export function ingestEmail(tasks: Task[], mail: IncomingEmail): { tasks: Task[]; outcome: IngestOutcome } {
  const p = parseEmail(mail.subject, mail.text);
  if (!p) return { tasks, outcome: { status: "ignored", reason: "not an OBS work order notification" } };
  if (!isTrusted(mail)) {
    return { tasks, outcome: { status: "ignored", reason: `sender ${addr(mail.from)} not allowed` } };
  }

  // Idempotency: this exact email was already applied
  const seen = tasks.find((t) => t.emailLog?.some((e) => e.messageId === mail.messageId));
  if (seen) return { tasks, outcome: { status: "duplicate", taskId: seen.id, workOrder: p.workOrder } };

  const list = [...tasks];
  let idx = list.findIndex((t) => sameWorkOrder(t.workOrder, p.workOrder));
  const created = idx === -1;
  if (created) {
    list.push(blankTask(nextId(list), p, mail));
    idx = list.length - 1;
  }
  const t: Task = { ...list[idx] };
  const locked = LOCKED.includes(t.status);
  const event: EmailEvent = { kind: p.kind, at: mail.date, subject: mail.subject, messageId: mail.messageId, note: note(p) };

  if (p.kind === "dispatch") {
    t.title       = `${p.product?.split(" · ")[0] ?? "Field visit"} — ${p.endCustomer ? titleCase(p.endCustomer) : p.city ?? p.siteId ?? "site"}`;
    t.description = p.description ?? t.description;
    t.location    = [p.siteId, p.address].filter(Boolean).join(" · ") || t.location;
    t.endCustomer = p.endCustomer;
    t.siteId      = p.siteId;
    t.product     = p.product;
    t.scheduledAt = p.scheduledAt;
    t.openedAt    = p.openedAt;
    t.assignedBy  = p.assignedBy;
    t.asp         = p.asp;
    t.siteContact = [p.contactName, p.contactPhone].filter(Boolean).join(" · ") || undefined;
    if (p.asp) t.engineerName = `${p.asp.replace(/^ASP_[A-Z]{2}\s*/, "")} FE`.trim();
    if (p.openedAt) t.createdAt = p.openedAt;

    // Price automatically — but never re-price a job that is already billed
    if (!locked) {
      const svc = classifyService(p.openedAt, p.scheduledAt);
      const dist = classifyDistance(p.city);
      const visitBasis = t.pricingBasis?.find((b) => b.startsWith("Visit "));
      t.maintenanceLevel = svc.maintenanceLevel;
      t.serviceLevel     = svc.serviceLevel;
      t.distanceBand     = dist.distanceBand;
      t.pricingBasis     = [...svc.basis, dist.basis, ...(visitBasis ? [visitBasis] : [])];
      t.ruleKey = buildRuleKey(t.maintenanceLevel, t.serviceLevel, t.distanceBand, t.visitDuration);
    }
  }

  if (p.kind === "photo" && t.status === "assigned") {
    t.status = "in_progress";
  }

  if (p.kind === "cleared") {
    if (/cancel/i.test(p.status)) {
      if (!locked) {
        t.status = "cancelled";
        t.cancelledAt = mail.date;
        t.cancelReason = `Cancelled by Orange Business (${p.status})`;
      }
    } else if (/cleared|closed|completed|resolved/i.test(p.status) && !locked) {
      t.onSiteTimes = p.onSite;
      const inAt  = p.onSite.arriveOnSite ?? p.onSite.workStart;
      const outAt = p.onSite.leaveSite ?? p.onSite.workStop;
      if (inAt)  t.checkInTime  = inAt;
      if (outAt) t.checkOutTime = outAt;
      t.acceptedAt = t.acceptedAt ?? p.onSite.travelStart ?? inAt;
      const visit = classifyVisit(inAt, outAt);
      if (inAt && outAt) t.duration = calcDuration(inAt, outAt);
      if (visit) {
        t.visitDuration = visit.visitDuration;
        t.pricingBasis = [...(t.pricingBasis ?? []).filter((b) => !b.startsWith("Visit ")), visit.basis];
      }
      t.ruleKey = buildRuleKey(t.maintenanceLevel, t.serviceLevel, t.distanceBand, t.visitDuration);
      t.comments = [p.closureComment, p.parts, p.releasedNote].filter(Boolean).join("\n");
      if (!t.description && p.description) t.description = p.description;

      if (AUTO_APPROVE_ON_CLEARED) {
        const rate = calculateCommercial(t.maintenanceLevel, t.serviceLevel, t.distanceBand, t.visitDuration);
        t.status             = "approved";
        t.approved           = true;
        t.invoiceNumber      = t.invoiceNumber ?? generateInvoiceNumber();
        t.customerChargeUSD  = rate.customerChargeUSD;
        t.engineerPaymentUSD = rate.engineerPaymentUSD;
        t.profit             = rate.profit;
      } else {
        t.status = "completed";
      }
    }
  }

  t.emailLog = [...(t.emailLog ?? []), event].sort((a, b) => a.at.localeCompare(b.at));
  list[idx] = t;
  return {
    tasks: list,
    outcome: { status: created ? "created" : "updated", taskId: t.id, workOrder: p.workOrder, kind: p.kind },
  };
}

// ── AI-read emails (reply threads, escalations, free-form updates) ───────────
export const AI_FLAG = "Read by AI from a free-form email — verify details";

/** Apply Gemini's reading of a non-template email. Never bills on its own. */
export function ingestAi(tasks: Task[], mail: IncomingEmail, ai: AiExtraction): { tasks: Task[]; outcome: IngestOutcome } {
  if (!ai.relevant || ai.kind === "other") {
    return { tasks, outcome: { status: "ignored", reason: `AI: not an Orange FE deployment — ${ai.reason}` } };
  }
  // Fall back to numbers in the subject if the model missed them
  const wo = ai.workOrder?.trim()
    || mail.subject.match(/\b(\d{8}(?:-\d)?)\b/)?.[1]
    || ai.incident?.trim()
    || mail.subject.match(/\b(INC\d{5,})\b/i)?.[1];
  if (!wo) {
    return { tasks, outcome: { status: "ignored", reason: `AI: relevant (${ai.kind}) but no work order or incident number found` } };
  }

  const seen = tasks.find((t) => t.emailLog?.some((e) => e.messageId === mail.messageId));
  if (seen) return { tasks, outcome: { status: "duplicate", taskId: seen.id, workOrder: wo } };

  const list = [...tasks];
  let idx = list.findIndex((t) => sameWorkOrder(t.workOrder, wo) || (!!ai.incident && t.workOrder === ai.incident));
  const created = idx === -1;
  if (created) {
    const svc = classifyService(undefined, ai.scheduledAt);
    const dist = classifyDistance(ai.city);
    list.push({
      id: nextId(list),
      title: `${ai.kind === "dispatch" ? "Field visit" : "Orange incident"} — ${ai.endCustomer ?? ai.city ?? ai.siteId ?? wo}`,
      description: ai.summary,
      customer: "Orange Business",
      location: [ai.siteId, ai.city].filter(Boolean).join(" · ") || "Site not stated",
      ...ASP_ENGINEER,
      status: "assigned",
      maintenanceType: "On-site support",
      maintenanceLevel: svc.maintenanceLevel,
      serviceLevel: svc.serviceLevel,
      distanceBand: dist.distanceBand,
      visitDuration: "2h",
      ruleKey: buildRuleKey(svc.maintenanceLevel, svc.serviceLevel, dist.distanceBand, "2h"),
      pricingBasis: [AI_FLAG, ...svc.basis, dist.basis],
      createdAt: mail.date,
      approved: false,
      source: "email",
      workOrder: wo,
      endCustomer: ai.endCustomer,
      siteId: ai.siteId,
      scheduledAt: ai.scheduledAt,
      emailLog: [],
    });
    idx = list.length - 1;
  }

  const t: Task = { ...list[idx] };
  const locked = LOCKED.includes(t.status);
  t.endCustomer = t.endCustomer ?? ai.endCustomer;
  t.siteId      = t.siteId ?? ai.siteId;
  t.scheduledAt = t.scheduledAt ?? ai.scheduledAt;

  if (!locked) {
    if (ai.kind === "progress" && t.status === "assigned") t.status = "in_progress";
    if (ai.kind === "cleared") {
      // Closed per the thread, but without Orange's timestamps: leave billing to a person
      t.status = "completed";
      t.checkOutTime = t.checkOutTime ?? mail.date;
      if (!t.pricingBasis?.includes(AI_FLAG)) t.pricingBasis = [AI_FLAG, ...(t.pricingBasis ?? [])];
    }
    if (ai.kind === "cancelled") {
      t.status = "cancelled";
      t.cancelledAt = mail.date;
      t.cancelReason = ai.summary;
    }
  }

  const event: EmailEvent = { kind: "update", at: mail.date, subject: mail.subject, messageId: mail.messageId, note: ai.summary };
  t.emailLog = [...(t.emailLog ?? []), event].sort((a, b) => a.at.localeCompare(b.at));
  list[idx] = t;
  return { tasks: list, outcome: { status: created ? "created" : "updated", taskId: t.id, workOrder: wo, kind: "update", viaAi: true } };
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
