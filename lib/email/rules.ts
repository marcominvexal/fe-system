/**
 * /lib/email/rules.ts — how an Orange work order is priced automatically.
 * Orange's emails do not state maintenance level, SLA tier or distance, so
 * they are inferred here. Every decision is returned with a plain-language
 * reason that is stored on the job, so billing can be checked line by line.
 *
 * Thresholds, business hours, the city distance table and the auto-bill
 * switch come from the pricing config, edited on the Pricing rules page.
 */
import type { MaintenanceLevel, ServiceLevel, DistanceBand, VisitDuration } from "@/lib/commercialEngine";
import { getPricing } from "@/lib/pricing";
import { bandForKm, distanceFromCentres } from "@/lib/geo";

const LOCAL_OFFSET_H = 5; // PKT, no DST

export interface Pricing {
  maintenanceLevel: MaintenanceLevel;
  serviceLevel:     ServiceLevel;
  distanceBand:     DistanceBand;
  visitDuration:    VisitDuration;
  basis:            string[];
}

/** Lock billing as soon as Orange reports the visit cleared. */
export const autoBillOnCleared = () => getPricing().rules.autoBillOnCleared;

function inBusinessHours(iso: string): boolean {
  const { businessDays, businessHours } = getPricing().rules;
  const local = new Date(new Date(iso).getTime() + LOCAL_OFFSET_H * 3_600_000);
  const day = local.getUTCDay();
  const hour = local.getUTCHours() + local.getUTCMinutes() / 60;
  return businessDays.includes(day) && hour >= businessHours.start && hour < businessHours.end;
}

const fmtH = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${Math.round(h)}h`);

/** Maintenance level and SLA tier from how far ahead Orange booked the visit. */
export function classifyService(openedAt?: string, scheduledAt?: string): Pick<Pricing, "maintenanceLevel" | "serviceLevel"> & { basis: string[] } {
  const { plannedLeadHours, urgentLeadHours } = getPricing().rules;
  if (!openedAt || !scheduledAt) {
    return { maintenanceLevel: "Reactive Support", serviceLevel: "8x5 4h",
      basis: ["Reactive 8x5 4h — no booked arrival time in the dispatch, so treated as reactive"] };
  }
  const lead = (new Date(scheduledAt).getTime() - new Date(openedAt).getTime()) / 3_600_000;
  if (lead >= plannedLeadHours) {
    return { maintenanceLevel: "Planned Activity", serviceLevel: "8x5 NBD",
      basis: [`Planned 8x5 NBD — booked ${fmtH(lead)} after dispatch (${plannedLeadHours}h or more is planned)`] };
  }
  if (lead <= urgentLeadHours && !inBusinessHours(openedAt)) {
    return { maintenanceLevel: "Reactive Support", serviceLevel: "24x7 4h",
      basis: [`Reactive 24x7 4h — booked ${fmtH(Math.max(0, lead))} after a dispatch sent outside business hours`] };
  }
  return { maintenanceLevel: "Reactive Support", serviceLevel: "8x5 4h",
    basis: [`Reactive 8x5 4h — booked ${fmtH(Math.max(0, lead))} after dispatch`] };
}

/**
 * Distance band from the nearest Multinet data centre. In order: a measured
 * distance saved for the site ID, a band set by hand for the city, the
 * estimate from the site's city, and finally the default.
 */
export function classifyDistance(src: { city?: string; siteId?: string; location?: string } = {}): { distanceBand: DistanceBand; basis: string } {
  const r = getPricing().rules;
  const siteKm = src.siteId ? r.siteDistanceKm?.[src.siteId.trim().toUpperCase()] : undefined;
  if (siteKm != null) {
    const band = bandForKm(siteKm);
    return { distanceBand: band, basis: `Distance ${band} — ${siteKm} km from the nearest Multinet data centre (measured for site ${src.siteId})` };
  }
  const est = distanceFromCentres(src, r.dataCentres ?? [], r.roadFactor ?? 1.25);
  const manual = est ? r.cityDistance[est.city.toLowerCase()] : src.city ? r.cityDistance[src.city.trim().toLowerCase()] : undefined;
  if (manual) return { distanceBand: manual, basis: `Distance ${manual} — set by hand for ${est?.city ?? src.city}` };
  if (est) {
    return { distanceBand: est.band, basis: `Distance ${est.band} — ${est.city} is about ${est.km} km by road from ${est.centre.replace(/ \(.*\)$/, "")}` };
  }
  return { distanceBand: r.defaultDistance,
    basis: `Distance ${r.defaultDistance} — default; ${src.city ? `${src.city} is` : "the site's city is"} not known, so the distance from Multinet could not be worked out` };
}

/** Billable visit length from minutes on site, using the configured limits. */
export function visitBandFor(minutes: number): VisitDuration {
  const { twoHourMaxMin, halfDayMaxMin } = getPricing().rules.visitBands;
  if (minutes <= twoHourMaxMin) return "2h";
  if (minutes <= halfDayMaxMin) return "Half Day";
  return "Full Day";
}

export function classifyVisit(arrive?: string, leave?: string): { visitDuration: VisitDuration; basis: string } | null {
  if (!arrive || !leave) return null;
  const mins = (new Date(leave).getTime() - new Date(arrive).getTime()) / 60_000;
  const band = visitBandFor(mins);
  const h = Math.floor(mins / 60), m = Math.round(mins % 60);
  return { visitDuration: band, basis: `Visit ${band} — ${h}h ${m}m on site per Orange's timestamps` };
}
