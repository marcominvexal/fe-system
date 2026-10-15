/**
 * /lib/analytics.ts — pure, client-safe derivations over Task[] for the
 * executive dashboard. Reads task data only; never changes billing math
 * (all money comes from fields set by the API / commercial engine).
 */
import type { Task, TaskStatus, ServiceLevel } from "./store";
import { calculateCommercial } from "./commercialEngine";

// ── Configurable targets ─────────────────────────────────────────────────────
// The app has no stored targets yet; these are management defaults kept in
// one place so they can be moved to settings/DB later.
export const TARGETS = {
  revenuePer30d:   6000,  // USD of approved billing per 30 days
  slaCompliance:   0.95,  // share of visits that arrive on site within SLA
  avgResponseHrs:  4,     // mean hours from task creation to check-in
};

/** Response window per SLA. NBD is approximated as 24h. */
export const SLA_TARGET_HOURS: Record<ServiceLevel, number> = {
  "8x5 NBD": 24,
  "8x5 4h":  4,
  "24x7 4h": 4,
};

export type RangeKey = "7d" | "30d" | "90d";
export const RANGE_DAYS: Record<RangeKey, number> = { "7d": 7, "30d": 30, "90d": 90 };

const H   = 3_600_000;
const DAY = 24 * H;
const ts  = (iso?: string) => (iso ? new Date(iso).getTime() : NaN);

export const OPEN_STATUSES: TaskStatus[] = ["pending", "assigned", "accepted", "in_progress", "completed"];
const AWAITING_ARRIVAL: TaskStatus[] = ["pending", "assigned", "accepted"];

// ── SLA ──────────────────────────────────────────────────────────────────────
export type SlaState = "met" | "breached" | "at_risk" | "on_track" | "n/a";

/** Grace after a booked arrival time (Orange gives a 30-minute ETA window). */
const SCHEDULE_GRACE_H = 0.5;

/** When the clock starts: the booked arrival for scheduled visits, else task creation. */
const clockStart = (t: Task) => ts(t.scheduledAt ?? t.createdAt);

/** Latest on-time arrival. */
function deadline(t: Task): number {
  if (t.scheduledAt) return ts(t.scheduledAt) + SCHEDULE_GRACE_H * H;
  return ts(t.createdAt) + (SLA_TARGET_HOURS[t.serviceLevel] ?? 24) * H;
}

/** Hours from clock start to check-in (never negative for early arrivals). */
export function responseHours(t: Task): number | undefined {
  if (!t.checkInTime) return undefined;
  return Math.max(0, (ts(t.checkInTime) - clockStart(t)) / H);
}

export function slaState(t: Task, now = Date.now()): SlaState {
  if (t.checkInTime) return ts(t.checkInTime) <= deadline(t) ? "met" : "breached";
  if (AWAITING_ARRIVAL.includes(t.status)) {
    const window = (deadline(t) - clockStart(t)) / H;
    const left = (deadline(t) - now) / H;
    if (left < 0) return "breached";
    if (left < window * 0.25 || (t.scheduledAt && left < 1)) return "at_risk";
    return "on_track";
  }
  return "n/a";
}

/** Hours left before the arrival deadline (negative = overdue). */
export function slaHoursLeft(t: Task, now = Date.now()): number {
  return (deadline(t) - now) / H;
}

/** How late the engineer arrived (or is, if not yet on site), in hours. */
export function lateByHours(t: Task, now = Date.now()): number {
  return ((t.checkInTime ? ts(t.checkInTime) : now) - deadline(t)) / H;
}

/** Value a task will bill once approved (actual if approved, engine estimate otherwise). */
export function taskValue(t: Task): number {
  if (t.customerChargeUSD != null) return t.customerChargeUSD;
  return calculateCommercial(t.maintenanceLevel, t.serviceLevel, t.distanceBand, t.visitDuration).customerChargeUSD;
}

// ── Period summary ───────────────────────────────────────────────────────────
export interface PeriodSummary {
  days:            number;
  revenue:         number;
  prevRevenue:     number;
  profit:          number;
  prevProfit:      number;
  fePay:           number;
  completed:       number;
  prevCompleted:   number;
  slaCompliance:   number | null;
  prevSla:         number | null;
  avgResponse:     number | null;
  prevAvgResponse: number | null;
  /** Per-day series, oldest → newest, length = days */
  dailyRevenue:     number[];
  prevDailyRevenue: number[];
  dailyCompleted:   number[];
  prevDailyCompleted: number[];
  dailyLabels:      number[]; // day-start timestamps
}

function inRange(iso: string | undefined, start: number, end: number) {
  const v = ts(iso);
  return v >= start && v < end;
}

function slaOf(list: Task[]) {
  const measured = list.filter((t) => t.checkInTime);
  if (measured.length === 0) return { rate: null, avg: null };
  const met = measured.filter((t) => slaState(t) === "met").length;
  const avg = measured.reduce((s, t) => s + (responseHours(t) ?? 0), 0) / measured.length;
  return { rate: met / measured.length, avg };
}

export function summarize(tasks: Task[], days: number, now = Date.now()): PeriodSummary {
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const end   = todayStart.getTime() + DAY;
  const start = end - days * DAY;
  const prevStart = start - days * DAY;

  const approved = tasks.filter((t) => t.status === "approved");
  const done     = tasks.filter((t) => t.status === "approved" || t.status === "completed");

  const cur  = approved.filter((t) => inRange(t.checkOutTime, start, end));
  const prev = approved.filter((t) => inRange(t.checkOutTime, prevStart, start));

  const sum = (l: Task[], k: "customerChargeUSD" | "profit" | "engineerPaymentUSD") =>
    l.reduce((s, t) => s + (t[k] ?? 0), 0);

  const bucket = (list: Task[], from: number, pick: (t: Task) => number) => {
    const out = new Array(days).fill(0);
    for (const t of list) {
      const i = Math.floor((ts(t.checkOutTime) - from) / DAY);
      if (i >= 0 && i < days) out[i] += pick(t);
    }
    return out;
  };

  const slaCur  = slaOf(tasks.filter((t) => inRange(t.createdAt, start, end)));
  const slaPrev = slaOf(tasks.filter((t) => inRange(t.createdAt, prevStart, start)));

  return {
    days,
    revenue:       sum(cur, "customerChargeUSD"),
    prevRevenue:   sum(prev, "customerChargeUSD"),
    profit:        sum(cur, "profit"),
    prevProfit:    sum(prev, "profit"),
    fePay:         sum(cur, "engineerPaymentUSD"),
    completed:     done.filter((t) => inRange(t.checkOutTime, start, end)).length,
    prevCompleted: done.filter((t) => inRange(t.checkOutTime, prevStart, start)).length,
    slaCompliance: slaCur.rate,
    prevSla:       slaPrev.rate,
    avgResponse:   slaCur.avg,
    prevAvgResponse: slaPrev.avg,
    dailyRevenue:       bucket(approved, start, (t) => t.customerChargeUSD ?? 0),
    prevDailyRevenue:   bucket(approved, prevStart, (t) => t.customerChargeUSD ?? 0),
    dailyCompleted:     bucket(done, start, () => 1),
    prevDailyCompleted: bucket(done, prevStart, () => 1),
    dailyLabels: Array.from({ length: days }, (_, i) => start + i * DAY),
  };
}

/** Relative change; null when there is no baseline to compare against. */
export function pctChange(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return (cur - prev) / Math.abs(prev);
}

// ── Pipeline / work-in-progress ──────────────────────────────────────────────
export const PIPELINE: { status: TaskStatus; label: string }[] = [
  { status: "pending",     label: "Needs assignment" },
  { status: "assigned",    label: "Assigned" },
  { status: "accepted",    label: "Accepted" },
  { status: "in_progress", label: "On site" },
  { status: "completed",   label: "Awaiting approval" },
];

export function pipeline(tasks: Task[]) {
  return PIPELINE.map((p) => {
    const list = tasks.filter((t) => t.status === p.status);
    return { ...p, count: list.length, value: list.reduce((s, t) => s + taskValue(t), 0) };
  });
}

// ── Attention items ──────────────────────────────────────────────────────────
export function attention(tasks: Task[], now = Date.now()) {
  const awaiting   = tasks.filter((t) => t.status === "completed");
  const open       = tasks.filter((t) => AWAITING_ARRIVAL.includes(t.status) && !t.checkInTime);
  const breached   = open.filter((t) => slaState(t, now) === "breached");
  const atRisk     = open.filter((t) => slaState(t, now) === "at_risk");
  const rejected   = tasks.filter((t) => t.status === "rejected");
  const unassigned = tasks.filter((t) => t.status === "pending");
  return {
    awaiting, awaitingValue: awaiting.reduce((s, t) => s + taskValue(t), 0),
    breached, atRisk, rejected, unassigned,
  };
}

// ── Engineers ────────────────────────────────────────────────────────────────
export function engineerStats(
  tasks: Task[], roster: { id: string; name: string }[], days: number, now = Date.now(),
) {
  const start = now - days * DAY;
  return roster.map((e) => {
    const mine   = tasks.filter((t) => t.engineerId === e.id);
    const recent = mine.filter((t) => ts(t.checkOutTime) >= start);
    const sla    = slaOf(mine.filter((t) => ts(t.createdAt) >= start));
    const onSite = mine.find((t) => t.status === "in_progress");
    return {
      ...e,
      visits:   recent.length,
      revenue:  recent.reduce((s, t) => s + (t.customerChargeUSD ?? 0), 0),
      open:     mine.filter((t) => OPEN_STATUSES.includes(t.status)).length,
      sla:      sla.rate,
      onSite,
    };
  });
}

export function slaByTier(tasks: Task[], days: number, now = Date.now()) {
  const start = now - days * DAY;
  return (Object.keys(SLA_TARGET_HOURS) as ServiceLevel[]).map((tier) => {
    const list = tasks.filter((t) => t.serviceLevel === tier && ts(t.createdAt) >= start);
    const s = slaOf(list);
    return { tier, targetHrs: SLA_TARGET_HOURS[tier], measured: list.filter((t) => t.checkInTime).length, rate: s.rate, avg: s.avg };
  });
}

// ── Activity feed ────────────────────────────────────────────────────────────
export type ActivityKind = "created" | "accepted" | "rejected" | "checkin" | "checkout" | "cancelled";
export interface Activity { kind: ActivityKind; at: number; task: Task }

export function activity(tasks: Task[], limit = 8): Activity[] {
  const ev: Activity[] = [];
  for (const t of tasks) {
    ev.push({ kind: "created", at: ts(t.createdAt), task: t });
    if (t.acceptedAt)   ev.push({ kind: "accepted",  at: ts(t.acceptedAt),   task: t });
    if (t.rejectedAt)   ev.push({ kind: "rejected",  at: ts(t.rejectedAt),   task: t });
    if (t.checkInTime)  ev.push({ kind: "checkin",   at: ts(t.checkInTime),  task: t });
    if (t.checkOutTime) ev.push({ kind: "checkout",  at: ts(t.checkOutTime), task: t });
    if (t.cancelledAt)  ev.push({ kind: "cancelled", at: ts(t.cancelledAt),  task: t });
  }
  return ev.filter((e) => !isNaN(e.at)).sort((a, b) => b.at - a.at).slice(0, limit);
}

// ── Formatting ───────────────────────────────────────────────────────────────
export const fmtUSD = (n: number, compact = false) =>
  compact && Math.abs(n) >= 10_000
    ? `$${(n / 1000).toFixed(1)}k`
    : `$${Math.round(n).toLocaleString("en-US")}`;

export const fmtPct = (n: number | null, digits = 0) =>
  n == null ? "—" : `${(n * 100).toFixed(digits)}%`;

export const fmtHrs = (n: number | null) =>
  n == null ? "—" : n < 1 ? `${Math.round(n * 60)}m` : `${n.toFixed(1)}h`;

export function timeAgo(at: number, now = Date.now()) {
  const m = Math.round((now - at) / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
