/**
 * /lib/email/rules.ts — how an Orange work order is priced automatically.
 * Orange's emails do not state maintenance level, SLA tier or distance, so
 * they are inferred here. Every decision is returned with a plain-language
 * reason that is stored on the job, so billing can be checked line by line.
 *
 * Edit the constants below to match the commercial agreement.
 */
import type { MaintenanceLevel, ServiceLevel, DistanceBand, VisitDuration } from "@/lib/commercialEngine";
import { visitBand } from "./parse";

/** Booked this many hours or more after dispatch → planned activity. */
export const PLANNED_LEAD_HOURS = 12;
/** Reactive and booked within this many hours → a 4-hour SLA tier. */
export const URGENT_LEAD_HOURS = 4;
/** Business hours used to tell 8x5 from 24x7 (Pakistan local time). */
export const BUSINESS_DAYS = [1, 2, 3, 4, 5];      // Mon–Fri
export const BUSINESS_HOURS = { start: 9, end: 17 };
const LOCAL_OFFSET_H = 5;                           // PKT, no DST

/**
 * Distance band per site city (as written in the dispatch address).
 * Cities not listed fall back to DEFAULT_DISTANCE and are flagged on the job.
 */
export const CITY_DISTANCE: Record<string, DistanceBand> = {
  karachi:    "<50km",
  lahore:     "<50km",
  islamabad:  "<50km",
  rawalpindi: "<50km",
};
export const DEFAULT_DISTANCE: DistanceBand = "<50km";

/** Approve and lock billing as soon as Orange reports the visit cleared. */
export const AUTO_APPROVE_ON_CLEARED = true;

export interface Pricing {
  maintenanceLevel: MaintenanceLevel;
  serviceLevel:     ServiceLevel;
  distanceBand:     DistanceBand;
  visitDuration:    VisitDuration;
  basis:            string[];
}

function inBusinessHours(iso: string): boolean {
  const local = new Date(new Date(iso).getTime() + LOCAL_OFFSET_H * 3_600_000);
  const day = local.getUTCDay();
  const hour = local.getUTCHours() + local.getUTCMinutes() / 60;
  return BUSINESS_DAYS.includes(day) && hour >= BUSINESS_HOURS.start && hour < BUSINESS_HOURS.end;
}

const fmtH = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${Math.round(h)}h`);

/** Maintenance level and SLA tier from how far ahead Orange booked the visit. */
export function classifyService(openedAt?: string, scheduledAt?: string): Pick<Pricing, "maintenanceLevel" | "serviceLevel"> & { basis: string[] } {
  if (!openedAt || !scheduledAt) {
    return { maintenanceLevel: "Reactive Support", serviceLevel: "8x5 4h",
      basis: ["Reactive 8x5 4h — no booked arrival time in the dispatch, so treated as reactive"] };
  }
  const lead = (new Date(scheduledAt).getTime() - new Date(openedAt).getTime()) / 3_600_000;
  if (lead >= PLANNED_LEAD_HOURS) {
    return { maintenanceLevel: "Planned Activity", serviceLevel: "8x5 NBD",
      basis: [`Planned 8x5 NBD — booked ${fmtH(lead)} after dispatch (${PLANNED_LEAD_HOURS}h or more is planned)`] };
  }
  if (lead <= URGENT_LEAD_HOURS && !inBusinessHours(openedAt)) {
    return { maintenanceLevel: "Reactive Support", serviceLevel: "24x7 4h",
      basis: [`Reactive 24x7 4h — booked ${fmtH(Math.max(0, lead))} after a dispatch sent outside business hours`] };
  }
  return { maintenanceLevel: "Reactive Support", serviceLevel: "8x5 4h",
    basis: [`Reactive 8x5 4h — booked ${fmtH(Math.max(0, lead))} after dispatch`] };
}

export function classifyDistance(city?: string): { distanceBand: DistanceBand; basis: string } {
  const key = city?.trim().toLowerCase();
  if (key && CITY_DISTANCE[key]) {
    return { distanceBand: CITY_DISTANCE[key], basis: `Distance ${CITY_DISTANCE[key]} — site in ${city}` };
  }
  return { distanceBand: DEFAULT_DISTANCE,
    basis: `Distance ${DEFAULT_DISTANCE} — default; ${city ? `${city} is` : "site city is"} not in the distance table` };
}

export function classifyVisit(arrive?: string, leave?: string): { visitDuration: VisitDuration; basis: string } | null {
  if (!arrive || !leave) return null;
  const mins = (new Date(leave).getTime() - new Date(arrive).getTime()) / 60_000;
  const band = visitBand(mins);
  const h = Math.floor(mins / 60), m = Math.round(mins % 60);
  return { visitDuration: band, basis: `Visit ${band} — ${h}h ${m}m on site per Orange's timestamps` };
}
