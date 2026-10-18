// =============================================================================
// Commercial Rules Engine — Orange Business Pricing Matrix
// 4 dimensions: DistanceBand × MaintenanceLevel × ServiceLevel × VisitDuration
// Pure TypeScript — no UI, no side effects.
// =============================================================================

export type MaintenanceLevel = "Planned Activity" | "Reactive Support";
export type ServiceLevel     = "8x5 NBD" | "8x5 4h" | "24x7 4h";
import { getPricing, type DistanceBand, type VisitDuration, type RateCategory } from "./pricing";
export type { DistanceBand, VisitDuration };

export const CURRENCY = "USD" as const;

export interface CommercialRate {
  customerChargeUSD:   number;
  engineerPaymentUSD:  number;
  profit:              number;
}

export interface CommercialResult extends CommercialRate {
  ruleKey:          string;
  maintenanceLevel: MaintenanceLevel;
  serviceLevel:     ServiceLevel;
  distanceBand:     DistanceBand;
  visitDuration:    VisitDuration;
}

// -----------------------------------------------------------------------------
// Rates come from the active pricing config (lib/pricing.ts), which defaults to
// the original Orange Business rate card and can be edited on the Pricing rules
// page. Engineer payment is a share of the charge (30% by default).
// -----------------------------------------------------------------------------

function rate(charge: number): CommercialRate {
  const engineerPaymentUSD = Math.round(charge * getPricing().fePayPct);
  return { customerChargeUSD: charge, engineerPaymentUSD, profit: charge - engineerPaymentUSD };
}

function lookup(band: DistanceBand, cat: RateCategory, visit: VisitDuration): CommercialRate {
  return rate(getPricing().table[band][cat][visit]);
}

export function maintKey(
  maintenanceLevel: MaintenanceLevel,
  serviceLevel: ServiceLevel
): "planned" | "reactive_8x5" | "reactive_24x7" {
  if (maintenanceLevel === "Planned Activity") return "planned";
  return serviceLevel === "24x7 4h" ? "reactive_24x7" : "reactive_8x5";
}

// -----------------------------------------------------------------------------
// Core calculation — single source of truth
// -----------------------------------------------------------------------------
export function calculateCommercial(
  maintenanceLevel: MaintenanceLevel,
  serviceLevel:     ServiceLevel,
  distanceBand:     DistanceBand,
  visitDuration:    VisitDuration
): CommercialResult {
  const mk  = maintKey(maintenanceLevel, serviceLevel);
  const base = lookup(distanceBand, mk, visitDuration);
  return {
    ...base,
    ruleKey: buildRuleKey(maintenanceLevel, serviceLevel, distanceBand, visitDuration),
    maintenanceLevel,
    serviceLevel,
    distanceBand,
    visitDuration,
  };
}

// -----------------------------------------------------------------------------
// Key helpers
// -----------------------------------------------------------------------------
export function buildRuleKey(
  maintenanceLevel: MaintenanceLevel,
  serviceLevel:     ServiceLevel,
  distanceBand:     DistanceBand,
  visitDuration:    VisitDuration
): string {
  return `${maintenanceLevel}|${serviceLevel}|${distanceBand}|${visitDuration}`;
}

export function parseRuleKey(key: string): {
  maintenanceLevel: MaintenanceLevel;
  serviceLevel:     ServiceLevel;
  distanceBand:     DistanceBand;
  visitDuration:    VisitDuration;
} | null {
  const [ml, sl, db, vd] = key.split("|");
  if (!ml || !sl || !db || !vd) return null;
  return {
    maintenanceLevel: ml as MaintenanceLevel,
    serviceLevel:     sl as ServiceLevel,
    distanceBand:     db as DistanceBand,
    visitDuration:    vd as VisitDuration,
  };
}

export function getRateFromKey(key: string): CommercialRate | null {
  const parsed = parseRuleKey(key);
  if (!parsed) return null;
  const mk = maintKey(parsed.maintenanceLevel, parsed.serviceLevel);
  return lookup(parsed.distanceBand, mk, parsed.visitDuration);
}

/** Short human-readable label — e.g. "PA · 8x5 NBD · <50km · Half Day" */
export function shortLabel(key: string): string {
  const parsed = parseRuleKey(key);
  if (!parsed) return key;
  const ml = parsed.maintenanceLevel === "Planned Activity" ? "PA" : "RS";
  return `${ml} · ${parsed.serviceLevel} · ${parsed.distanceBand} · ${parsed.visitDuration}`;
}

// -----------------------------------------------------------------------------
// Reference lists for form selects
// -----------------------------------------------------------------------------
export const MAINTENANCE_LEVELS: MaintenanceLevel[] = [
  "Planned Activity",
  "Reactive Support",
];

export const SERVICE_LEVELS: ServiceLevel[] = [
  "8x5 NBD",
  "8x5 4h",
  "24x7 4h",
];

export const DISTANCE_BANDS: DistanceBand[] = [
  "<50km",
  "50-100km",
  ">100km",
];

export const VISIT_DURATIONS: VisitDuration[] = [
  "2h",
  "Half Day",
  "Full Day",
];
