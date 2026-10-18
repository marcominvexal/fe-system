/**
 * /lib/confidence.ts — how sure the system is about a job's price (client-safe).
 *
 * Each pricing input loses points for the specific reason it might be wrong,
 * so the score always comes with plain-language explanations. A person
 * confirming or adjusting the price sets it to 100.
 */
import type { Task } from "./store";
import { getPricing } from "./pricing";

export interface Confidence {
  score:   number;              // 0–100
  level:   "high" | "medium" | "low";
  reasons: { text: string; points: number }[];   // deductions, largest first
}

/** Jobs scoring below this go to the pricing review queue. */
export const REVIEW_THRESHOLD = 70;

const H = 3_600_000;

export function pricingConfidence(t: Task): Confidence {
  if (t.pricingReviewed) {
    return { score: 100, level: "high", reasons: [{ text: `Confirmed by ${t.pricingReviewed.by} on ${new Date(t.pricingReviewed.at).toLocaleDateString("en-GB")}`, points: 0 }] };
  }
  if (t.source !== "email") {
    return { score: 100, level: "high", reasons: [{ text: "Priced by a person when the job was created", points: 0 }] };
  }

  const rules = getPricing().rules;
  const out: { text: string; points: number }[] = [];
  const basis = t.pricingBasis ?? [];

  // Read by AI from a free-form email
  if (basis.some((b) => /verify/i.test(b))) out.push({ text: "Details were read by AI from a free-form email", points: 30 });

  // Work type / SLA: how close the booking lead time was to a threshold
  if (t.openedAt && t.scheduledAt) {
    const lead = (new Date(t.scheduledAt).getTime() - new Date(t.openedAt).getTime()) / H;
    const nearPlanned = Math.abs(lead - rules.plannedLeadHours);
    const nearUrgent = Math.abs(lead - rules.urgentLeadHours);
    if (nearPlanned < 2) out.push({ text: `Booked ${lead.toFixed(1)}h ahead, close to the ${rules.plannedLeadHours}h planned/reactive line`, points: 25 });
    else if (lead < rules.plannedLeadHours && nearUrgent < 1) out.push({ text: `Booked ${lead.toFixed(1)}h ahead, close to the ${rules.urgentLeadHours}h SLA line`, points: 15 });
  } else {
    out.push({ text: "No booked arrival time, so work type and SLA were assumed", points: 25 });
  }

  // Distance: from the city table, or the default
  if (basis.some((b) => /default|not in the/i.test(b))) out.push({ text: "Site city is not in the distance table; default band used", points: 25 });

  // Visit length: from Orange's timestamps, and how close to a band limit
  const s = t.onSiteTimes;
  const inAt = s?.arriveOnSite ?? t.checkInTime, outAt = s?.leaveSite ?? t.checkOutTime;
  if (["approved", "completed"].includes(t.status)) {
    if (!inAt || !outAt) {
      out.push({ text: "No on-site times, so the visit length was assumed", points: 20 });
    } else {
      const mins = (new Date(outAt).getTime() - new Date(inAt).getTime()) / 60_000;
      const { twoHourMaxMin, halfDayMaxMin } = rules.visitBands;
      const edge = Math.min(Math.abs(mins - twoHourMaxMin), Math.abs(mins - halfDayMaxMin));
      if (edge <= 15) out.push({ text: `${Math.round(mins)} min on site, within 15 min of a visit-length limit`, points: 15 });
      if (mins < 15 || mins > 14 * 60) out.push({ text: `${Math.round(mins)} min on site looks implausible`, points: 20 });
    }
  }

  out.sort((a, b) => b.points - a.points);
  const score = Math.max(0, 100 - out.reduce((sum, r) => sum + r.points, 0));
  return { score, level: score >= 85 ? "high" : score >= REVIEW_THRESHOLD ? "medium" : "low", reasons: out };
}

export const needsReview = (t: Task) =>
  ["approved", "completed"].includes(t.status) && !t.invoiceId && pricingConfidence(t).score < REVIEW_THRESHOLD;
