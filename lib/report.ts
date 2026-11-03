/**
 * /lib/report.ts — billing-cycle figures for the dashboard and the Reports
 * page, plus CSV export (client-safe).
 *
 * A visit counts towards a cycle on the date Orange cleared it. Under the
 * contract the first in-city and intercity visits up to the committed number
 * are covered by the monthly charge; later ones are extra at the rate card.
 */
import type { Task } from "./store";
import { knownEngineer } from "./store";
import type { Contract } from "./pricing";
import { inCycle, type Cycle } from "./cycle";

export type Area = "in_city" | "intercity";
export const areaOf = (t: Pick<Task, "distanceBand">): Area => (t.distanceBand === "<50km" ? "in_city" : "intercity");
export const AREA_LABEL: Record<Area, string> = { in_city: "In-city (within 50 km)", intercity: "Intercity (over 50 km)" };

/** When Orange cleared the visit (falls back to check-out). */
export const clearedAt = (t: Task) => t.emailLog?.find((e) => e.kind === "cleared")?.at ?? t.checkOutTime;

/** A job belongs to a cycle if it was opened or closed in it. */
export const inCycleTask = (t: Task, c: Cycle) => inCycle(t.openedAt ?? t.createdAt, c) || inCycle(clearedAt(t), c);

/** Minutes on site, from the engineer's check-in and check-out. */
export function minutesOnSite(t: Task): number | null {
  if (!t.checkInTime || !t.checkOutTime) return null;
  const m = (new Date(t.checkOutTime).getTime() - new Date(t.checkInTime).getTime()) / 60_000;
  return m > 0 && m < 7 * 24 * 60 ? Math.round(m) : null;
}

export interface CycleVisit {
  task:     Task;
  area:     Area;
  cleared:  string;
  included: boolean;   // covered by the monthly charge
  charge:   number;    // what this visit adds to the bill (0 if included)
  rated:    number;    // rate-card value
  hotel:    number;    // hotel charge
  billed:   boolean;   // price locked (false = cleared, waiting for a check)
}

export interface AreaTotals { done: number; committed: number; included: number; extra: number; extraValue: number }

export interface CycleSummary {
  cycle:       Cycle;
  visits:      CycleVisit[];
  inCity:      AreaTotals;
  interCity:   AreaTotals;
  mrc:         number;
  extras:      number;
  hotelNights: number;
  hotel:       number;
  total:       number;
  totalPkr:    number;
  usdToPkr:    number;
  contract:    boolean;     // billed with the monthly charge; false = every visit at the rate card
  visitsValue: number;      // what the visits add to the bill
  committed:   number;      // visits covered by the monthly charge
  done:        number;      // visits cleared in the cycle
  engineers:   { name: string; visits: number; minutes: number }[];
}

/** Figures for one billing cycle. Pass the contract to apply the monthly charge and commitment. */
export function cycleSummary(tasks: Task[], cycle: Cycle, contract: Contract | null): CycleSummary {
  const k = contract?.enabled ? contract : null;
  const cleared = tasks
    .filter((t) => (t.status === "approved" || t.status === "completed") && inCycle(clearedAt(t), cycle))
    .sort((a, b) => (clearedAt(a) ?? "").localeCompare(clearedAt(b) ?? ""));

  const used: Record<Area, number> = { in_city: 0, intercity: 0 };
  const quota: Record<Area, number> = { in_city: k?.includedInCity ?? 0, intercity: k?.includedInterCity ?? 0 };
  const visits: CycleVisit[] = cleared.map((t) => {
    const area = areaOf(t);
    const rated = t.customerChargeUSD ?? 0;
    const included = !!k && used[area] < quota[area];
    if (included) used[area]++;
    const hotel = (t.hotelNights ?? 0) * (k?.hotelPerNightUSD ?? 125);
    return { task: t, area, cleared: clearedAt(t)!, included, charge: included ? 0 : rated, rated, hotel, billed: t.status === "approved" };
  });

  const totals = (area: Area): AreaTotals => {
    const v = visits.filter((x) => x.area === area);
    const extra = v.filter((x) => !x.included);
    return { done: v.length, committed: quota[area], included: v.length - extra.length, extra: extra.length, extraValue: extra.reduce((s, x) => s + x.charge, 0) };
  };
  const inCity = totals("in_city"), interCity = totals("intercity");
  const mrc = k?.mrcUSD ?? 0;
  const extras = inCity.extraValue + interCity.extraValue;
  const hotelNights = visits.reduce((s, x) => s + (x.task.hotelNights ?? 0), 0);
  const hotel = visits.reduce((s, x) => s + x.hotel, 0);
  const total = mrc + extras + hotel;
  const usdToPkr = k?.usdToPkr ?? 280;

  const byEngineer = new Map<string, { visits: number; minutes: number }>();
  for (const x of visits) {
    const name = knownEngineer(x.task) ?? "Name not received yet";
    const cur = byEngineer.get(name) ?? { visits: 0, minutes: 0 };
    byEngineer.set(name, { visits: cur.visits + 1, minutes: cur.minutes + (minutesOnSite(x.task) ?? 0) });
  }

  return {
    cycle, visits, inCity, interCity, mrc, extras, hotelNights, hotel, total,
    totalPkr: Math.round(total * usdToPkr), usdToPkr,
    contract: !!k, visitsValue: extras,
    committed: quota.in_city + quota.intercity,
    done: visits.length,
    engineers: [...byEngineer].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.visits - a.visits),
  };
}

// ── Formatting ───────────────────────────────────────────────────────────────
export const fmtPkr = (n: number) => `PKR ${Math.round(n).toLocaleString("en-US")}`;
// Pakistan time, written "30 Sep 2026" (en-GB would give "Sept")
const pkParts = (iso: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Karachi",
  }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return p as Record<string, string>;
};
export const fmtDate = (iso?: string) => {
  if (!iso) return "";
  const p = pkParts(iso);
  return `${p.day} ${p.month} ${p.year}`;
};
export const fmtDateTime = (iso?: string) => {
  if (!iso) return "";
  const p = pkParts(iso);
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute}`;
};
export const fmtMinutes = (m: number | null) => (m == null ? "" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`);

/** Plain-language job status for people outside operations. */
export function plainStatus(t: Task): string {
  switch (t.status) {
    case "assigned":    return "Engineer booked";
    case "accepted":    return "Engineer confirmed";
    case "in_progress": return "Engineer on site";
    case "completed":   return "Done · price being checked";
    case "approved":    return t.invoiceId ? `Done · invoiced (${t.invoiceNumber})` : "Done · ready to invoice";
    case "cancelled":   return "Cancelled";
    case "rejected":    return "Declined";
  }
}

// ── CSV (opens directly in Excel) ────────────────────────────────────────────
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

const serviceText = (t: Task) => `${t.maintenanceLevel === "Planned Activity" ? "Planned" : "Reactive"} ${t.serviceLevel}`;

/** Every work order, one row each. */
export function workOrdersCsv(tasks: Task[]): string {
  return toCsv([
    ["Work order", "Job", "Status", "Customer", "Site", "Engineer", "Service", "Distance", "Visit length", "Booked for", "Arrived", "Left site", "Time on site", "Cleared by Orange", "Charge (USD)", "Hotel nights", "Invoice"],
    ...tasks.map((t) => [
      t.workOrder ?? t.id, t.id, plainStatus(t), t.endCustomer ?? t.customer, t.siteId ?? t.location,
      knownEngineer(t) ?? "Name not received yet", serviceText(t), t.distanceBand, t.visitDuration,
      fmtDateTime(t.scheduledAt), fmtDateTime(t.checkInTime), fmtDateTime(t.checkOutTime), fmtMinutes(minutesOnSite(t)),
      fmtDateTime(clearedAt(t)), t.customerChargeUSD ?? "", t.hotelNights ?? "", t.invoiceNumber ?? "",
    ]),
  ]);
}

/** The cycle's bill: monthly charge, visits (included or extra), hotel, totals. */
export function cycleBillCsv(s: CycleSummary): string {
  const rows: (string | number | null | undefined)[][] = [
    [`Billing cycle ${s.cycle.name}`, s.cycle.range],
    [],
    ["Item", "Work order", "Customer", "Engineer", "Area", "Cleared", "Service", "Visit length", "Rate card (USD)", "Billed (USD)", "Note"],
    ...(s.contract ? [["Monthly recurring charge", "", "", "", "", "", "", "", "", s.mrc, `Covers ${s.committed} visits`]] : []),
    ...s.visits.map((x) => [
      "Visit", x.task.workOrder ?? x.task.id, x.task.endCustomer ?? x.task.customer, knownEngineer(x.task) ?? "Name not received yet",
      x.area === "in_city" ? "In-city" : "Intercity", fmtDate(x.cleared), serviceText(x.task), x.task.visitDuration,
      x.rated, x.charge, `${!s.contract ? "Rate card" : x.included ? "Included in monthly charge" : "Additional visit"}${x.billed ? "" : " · price not yet confirmed"}`,
    ]),
    ...s.visits.filter((x) => x.hotel > 0).map((x) => [
      "Hotel accommodation", x.task.workOrder ?? x.task.id, x.task.endCustomer ?? "", knownEngineer(x.task) ?? "", "", fmtDate(x.cleared), "", "",
      "", x.hotel, `${x.task.hotelNights} night(s)`,
    ]),
    [],
    ...(s.contract ? [
      ["In-city visits", `${s.inCity.done} done`, `${s.inCity.committed} included`, `${s.inCity.extra} extra`, "", "", "", "", "", s.inCity.extraValue],
      ["Intercity visits", `${s.interCity.done} done`, `${s.interCity.committed} included`, `${s.interCity.extra} extra`, "", "", "", "", "", s.interCity.extraValue],
    ] : [
      ["In-city visits", `${s.inCity.done}`, "", "", "", "", "", "", "", s.inCity.extraValue],
      ["Intercity visits", `${s.interCity.done}`, "", "", "", "", "", "", "", s.interCity.extraValue],
    ]),
    ["Total (USD)", "", "", "", "", "", "", "", "", s.total],
    [`Total (PKR at ${s.usdToPkr})`, "", "", "", "", "", "", "", "", s.totalPkr],
  ];
  return toCsv(rows);
}

/** Visits per engineer in the cycle. */
export function engineersCsv(s: CycleSummary): string {
  return toCsv([
    [`Billing cycle ${s.cycle.name}`, s.cycle.range],
    [],
    ["Engineer", "Work order", "Customer", "Site", "Arrived", "Left site", "Time on site", "Cleared"],
    ...s.visits
      .slice()
      .sort((a, b) => (knownEngineer(a.task) ?? "~").localeCompare(knownEngineer(b.task) ?? "~"))
      .map((x) => [
        knownEngineer(x.task) ?? "Name not received yet", x.task.workOrder ?? x.task.id, x.task.endCustomer ?? x.task.customer,
        x.task.siteId ?? x.task.location, fmtDateTime(x.task.checkInTime), fmtDateTime(x.task.checkOutTime),
        fmtMinutes(minutesOnSite(x.task)), fmtDate(x.cleared),
      ]),
    [],
    ["Engineer", "Visits", "Total time on site"],
    ...s.engineers.map((e) => [e.name, e.visits, fmtMinutes(e.minutes)]),
  ]);
}
