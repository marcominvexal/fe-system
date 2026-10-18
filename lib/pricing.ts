/**
 * /lib/pricing.ts — the commercial agreement as editable data (client-safe).
 * Defaults match the original Orange Business rate card. The active config is
 * loaded from the database on the server and fetched by the browser, and can
 * be edited on the Pricing rules page.
 */
export type DistanceBand  = "<50km" | "50-100km" | ">100km";
export type VisitDuration = "2h" | "Half Day" | "Full Day";
export type RateCategory  = "planned" | "reactive_8x5" | "reactive_24x7";

/** Customer charge (USD) by distance band → category → visit length. */
export type RateTable = Record<DistanceBand, Record<RateCategory, Record<VisitDuration, number>>>;

export interface PricingRules {
  plannedLeadHours: number;                 // booked this far ahead → planned
  urgentLeadHours:  number;                 // reactive & booked within → 4h tier
  businessDays:     number[];               // 0 = Sun … 6 = Sat
  businessHours:    { start: number; end: number };
  cityDistance:     Record<string, DistanceBand>;
  defaultDistance:  DistanceBand;
  visitBands:       { twoHourMaxMin: number; halfDayMaxMin: number };
  autoBillOnCleared: boolean;               // lock billing when Orange clears the visit
}

export interface Issuer {
  name:     string;     // your company, shown as the invoice sender
  address:  string;
  taxId:    string;     // NTN / tax registration, if any
  bankDetails: string;  // payment instructions printed on invoices
}

export interface PricingConfig {
  currency:   "USD";
  issuer:     Issuer;
  fePayPct:   number;                       // engineer payment as share of charge
  paymentTermsDays: number;                 // invoice due date
  table:      RateTable;
  rules:      PricingRules;
}

export const DEFAULT_PRICING: PricingConfig = {
  currency: "USD",
  issuer: { name: "", address: "", taxId: "", bankDetails: "" },
  fePayPct: 0.30,
  paymentTermsDays: 30,
  table: {
    "<50km": {
      planned:       { "2h": 100, "Half Day": 120, "Full Day": 200 },
      reactive_8x5:  { "2h": 130, "Half Day": 150, "Full Day": 230 },
      reactive_24x7: { "2h": 150, "Half Day": 180, "Full Day": 270 },
    },
    "50-100km": {
      planned:       { "2h": 150, "Half Day": 180, "Full Day": 270 },
      reactive_8x5:  { "2h": 200, "Half Day": 250, "Full Day": 350 },
      reactive_24x7: { "2h": 200, "Half Day": 250, "Full Day": 350 },
    },
    ">100km": {
      planned:       { "2h": 200, "Half Day": 250, "Full Day": 350 },
      reactive_8x5:  { "2h": 250, "Half Day": 320, "Full Day": 430 },
      reactive_24x7: { "2h": 250, "Half Day": 320, "Full Day": 430 },
    },
  },
  rules: {
    plannedLeadHours: 12,
    urgentLeadHours: 4,
    businessDays: [1, 2, 3, 4, 5],
    businessHours: { start: 9, end: 17 },
    cityDistance: { karachi: "<50km", lahore: "<50km", islamabad: "<50km", rawalpindi: "<50km" },
    defaultDistance: "<50km",
    visitBands: { twoHourMaxMin: 150, halfDayMaxMin: 300 },
    autoBillOnCleared: true,
  },
};

let active: PricingConfig = DEFAULT_PRICING;

export const getPricing = () => active;
export function setPricing(cfg: PricingConfig) { active = cfg; }

const DISTANCES: DistanceBand[] = ["<50km", "50-100km", ">100km"];
const CATEGORIES: RateCategory[] = ["planned", "reactive_8x5", "reactive_24x7"];
const DURATIONS: VisitDuration[] = ["2h", "Half Day", "Full Day"];

/** Check an edited config; returns a list of problems (empty when valid). */
export function validatePricing(c: PricingConfig): string[] {
  const errs: string[] = [];
  if (!(c.fePayPct >= 0 && c.fePayPct < 1)) errs.push("Engineer pay must be between 0% and 99%.");
  if (!(c.paymentTermsDays >= 0 && c.paymentTermsDays <= 180)) errs.push("Payment terms must be 0–180 days.");
  for (const d of DISTANCES) for (const k of CATEGORIES) for (const v of DURATIONS) {
    const n = c.table?.[d]?.[k]?.[v];
    if (!(typeof n === "number" && n >= 0 && isFinite(n))) errs.push(`Rate for ${d} · ${k} · ${v} must be a positive number.`);
  }
  const r = c.rules;
  if (!(r.plannedLeadHours > 0)) errs.push("Planned threshold must be more than 0 hours.");
  if (!(r.urgentLeadHours > 0 && r.urgentLeadHours <= r.plannedLeadHours)) errs.push("Urgent threshold must be above 0 and not more than the planned threshold.");
  if (!(r.businessHours.start >= 0 && r.businessHours.end <= 24 && r.businessHours.start < r.businessHours.end)) errs.push("Business hours must run from an earlier to a later hour.");
  if (!(r.visitBands.twoHourMaxMin > 0 && r.visitBands.halfDayMaxMin > r.visitBands.twoHourMaxMin)) errs.push("Half-day limit must be longer than the 2-hour limit.");
  for (const [city, band] of Object.entries(r.cityDistance)) {
    if (!city.trim()) errs.push("City names cannot be empty.");
    if (!DISTANCES.includes(band)) errs.push(`Distance for ${city} is not a valid band.`);
  }
  return errs;
}
