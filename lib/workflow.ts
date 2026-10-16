/**
 * /lib/workflow.ts — the work-order lifecycle as the portal shows it.
 * Derives a five-stage progress view and a merged timeline from a task's
 * fields and its Orange email trail. Pure and client-safe.
 */
import type { Task } from "./store";

export type StageKey = "dispatched" | "booked" | "onsite" | "cleared" | "billed";
export type StageState = "done" | "current" | "late" | "upcoming" | "skipped" | "cancelled";

export interface Stage {
  key:    StageKey;
  label:  string;
  state:  StageState;
  at?:    string;
  detail?: string;
}

const GRACE_MS = 30 * 60_000;              // Orange's ETA window
const ts = (iso?: string) => (iso ? new Date(iso).getTime() : NaN);

export const STAGE_LABEL: Record<StageKey, string> = {
  dispatched: "Dispatched",
  booked:     "Booked",
  onsite:     "On site",
  cleared:    "Cleared",
  billed:     "Billed",
};

function firstEmail(t: Task, kind: "dispatch" | "photo" | "cleared") {
  return t.emailLog?.find((e) => e.kind === kind);
}

export function stages(t: Task, now = Date.now()): Stage[] {
  const cleared = firstEmail(t, "cleared");
  const photo   = firstEmail(t, "photo");
  const arrived = t.onSiteTimes?.arriveOnSite ?? t.checkInTime ?? photo?.at;
  const clearedAt = cleared?.at ?? (["completed", "approved"].includes(t.status) ? t.checkOutTime : undefined);
  const billedAt  = t.status === "approved" ? clearedAt ?? t.checkOutTime : undefined;
  const photos = t.emailLog?.filter((e) => e.kind === "photo").length ?? 0;

  const raw: Omit<Stage, "state">[] = [
    { key: "dispatched", label: STAGE_LABEL.dispatched, at: t.openedAt ?? t.createdAt,
      detail: t.assignedBy ? `by ${t.assignedBy}` : undefined },
    { key: "booked", label: STAGE_LABEL.booked, at: t.scheduledAt,
      detail: t.scheduledAt ? undefined : "No booked time" },
    { key: "onsite", label: STAGE_LABEL.onsite, at: arrived,
      detail: photos ? `${photos} photo${photos === 1 ? "" : "s"} uploaded` : undefined },
    { key: "cleared", label: STAGE_LABEL.cleared, at: clearedAt,
      detail: t.duration ? `${t.duration} on site` : undefined },
    { key: "billed", label: STAGE_LABEL.billed, at: billedAt,
      detail: t.status === "approved" && t.customerChargeUSD != null ? `$${t.customerChargeUSD}` : undefined },
  ];

  const done: Record<StageKey, boolean> = {
    dispatched: true,
    booked:     !!t.scheduledAt,
    onsite:     !!arrived,
    cleared:    !!clearedAt,
    billed:     !!billedAt,
  };

  const cancelled = t.status === "cancelled";
  let currentFound = false;
  return raw.map((s) => {
    if (s.key === "booked" && !t.scheduledAt && (done.onsite || done.cleared)) return { ...s, state: "skipped" as const };
    if (done[s.key]) return { ...s, state: "done" as const };
    if (cancelled) return { ...s, state: "cancelled" as const };
    if (!currentFound) {
      currentFound = true;
      const late = s.key === "onsite" && !!t.scheduledAt && now > ts(t.scheduledAt) + GRACE_MS;
      return { ...s, state: late ? ("late" as const) : ("current" as const),
        detail: late ? "Past booked arrival" : s.detail };
    }
    return { ...s, state: "upcoming" as const };
  });
}

/** Index of the furthest completed stage (for progress bars). */
export function progress(t: Task): number {
  const s = stages(t);
  const lastDone = s.map((x) => x.state === "done" || x.state === "skipped").lastIndexOf(true);
  return (lastDone + 1) / s.length;
}

/** One-line description of where the job stands, for lists. */
export function headline(t: Task, now = Date.now()): { text: string; tone: "ok" | "warn" | "crit" | "brand" | "muted" } {
  if (t.status === "cancelled") return { text: "Cancelled", tone: "muted" };
  if (t.status === "approved") return { text: `Billed${t.invoiceNumber ? ` · ${t.invoiceNumber}` : ""}`, tone: "ok" };
  if (t.status === "completed") return { text: "Cleared · awaiting billing", tone: "warn" };
  const s = stages(t, now).find((x) => x.state === "current" || x.state === "late");
  if (s?.state === "late") return { text: "Engineer late · not on site", tone: "crit" };
  if (s?.key === "booked" || (s?.key === "onsite" && t.scheduledAt && ts(t.scheduledAt) > now)) {
    return { text: `Booked for ${new Date(t.scheduledAt!).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`, tone: "brand" };
  }
  if (s?.key === "cleared") return { text: "On site · awaiting Orange closure", tone: "brand" };
  return { text: "Waiting for arrival", tone: "brand" };
}

// ── Merged timeline ──────────────────────────────────────────────────────────
export type EventKind = "email" | "site" | "billing" | "plan" | "cancel";
export interface TimelineEvent {
  at:      string;
  title:   string;
  detail?: string;
  kind:    EventKind;
  future?: boolean;
}

export function timeline(t: Task, now = Date.now()): TimelineEvent[] {
  const ev: TimelineEvent[] = [];
  for (const e of t.emailLog ?? []) {
    const title =
      e.kind === "dispatch" ? "Work order received from Orange" :
      e.kind === "photo"    ? "Photo uploaded to OBSLink" :
      e.kind === "update"   ? e.note ?? "Email update" :
      "Orange cleared the work order";
    const detail =
      e.kind === "photo"  ? e.note?.replace(/^Photo uploaded:\s*/, "") :
      e.kind === "update" ? `Read by AI · ${e.subject}` :
      e.subject;
    ev.push({ at: e.at, title, detail, kind: "email" });
  }
  if (t.source !== "email") ev.push({ at: t.createdAt, title: "Job created", kind: "plan" });
  if (t.scheduledAt) {
    ev.push({ at: t.scheduledAt, title: "Booked arrival", detail: "Engineer due on site (30 min window)",
      kind: "plan", future: ts(t.scheduledAt) > now });
  }
  const s = t.onSiteTimes;
  const site: [string | undefined, string][] = [
    [s?.travelStart, "Engineer started travel"],
    [s?.arriveOnSite ?? (s ? undefined : t.checkInTime), "Arrived on site"],
    [s?.workStart, "Work started"],
    [s?.workStop, "Work finished"],
    [s?.leaveSite ?? (s ? undefined : t.checkOutTime), "Left site"],
    [s?.travelStop, "Travel ended"],
  ];
  for (const [at, title] of site) if (at) ev.push({ at, title, kind: "site" });
  if (t.status === "approved") {
    const clearedAt = t.emailLog?.find((e) => e.kind === "cleared")?.at ?? t.checkOutTime ?? t.createdAt;
    ev.push({ at: clearedAt, title: `Billed${t.invoiceNumber ? ` · ${t.invoiceNumber}` : ""}`,
      detail: t.customerChargeUSD != null ? `$${t.customerChargeUSD} charge · $${t.engineerPaymentUSD} FE pay · $${t.profit} profit` : undefined,
      kind: "billing" });
  }
  if (t.cancelledAt) ev.push({ at: t.cancelledAt, title: "Cancelled", detail: t.cancelReason, kind: "cancel" });
  // Billing entry follows the closure it came from
  const order: Record<EventKind, number> = { plan: 0, email: 1, site: 1, billing: 2, cancel: 2 };
  return ev.sort((a, b) => a.at.localeCompare(b.at) || order[a.kind] - order[b.kind]);
}
