// =============================================================================
// Commercial Rules Engine
// Pure TypeScript — no UI, no side effects.
// Encodes SLA-based enterprise pricing: MaintenanceLevel × ServiceLevel × DistanceBand.
// Admin selects the three dimensions; engine returns binding commercial rates.
// Field Engineers never see this module.
// =============================================================================

export type MaintenanceLevel = "Planned Activity" | "Reactive Support";
export type ServiceLevel     = "8x5 NBD" | "8x5 4h" | "24x7 4h" | "24x7 NCD";
export type DistanceBand     = "<50km" | "50-100km" | ">100km";

export const CURRENCY = "USD" as const;
export type Currency = typeof CURRENCY;

export interface CommercialRate {
  customerCharge: number;
  feCost:         number;
  profit:         number;
  currency:       Currency;
}

export interface CommercialResult extends CommercialRate {
  ruleKey:          string;
  maintenanceLevel: MaintenanceLevel;
  serviceLevel:     ServiceLevel;
  distanceBand:     DistanceBand;
}

// -----------------------------------------------------------------------------
// SLA Pricing Table
// Rows    = Maintenance Level  (Planned Activity / Reactive Support)
// Columns = Service Level      (escalating response commitment)
// Cells   = Distance Band      (travel cost tier)
//
// Pricing rationale:
//   - Planned Activity is scheduled; lower urgency premium.
//   - Reactive Support is unplanned; higher mobilisation cost.
//   - Faster response SLAs (NCD = Next Calendar Day, 4h = 4-hour fix) carry
//     availability premiums charged to the customer.
//   - Distance bands reflect travel time and fuel cost passed through.
// -----------------------------------------------------------------------------
const RATE_TABLE: Record<
  MaintenanceLevel,
  Record<ServiceLevel, Record<DistanceBand, CommercialRate>>
> = {
  "Planned Activity": {
    "8x5 NBD": {
      "<50km":    { customerCharge: 120, feCost: 35, profit:  85, currency: CURRENCY },
      "50-100km": { customerCharge: 140, feCost: 40, profit: 100, currency: CURRENCY },
      ">100km":   { customerCharge: 165, feCost: 50, profit: 115, currency: CURRENCY },
    },
    "8x5 4h": {
      "<50km":    { customerCharge: 150, feCost: 40, profit: 110, currency: CURRENCY },
      "50-100km": { customerCharge: 175, feCost: 45, profit: 130, currency: CURRENCY },
      ">100km":   { customerCharge: 200, feCost: 55, profit: 145, currency: CURRENCY },
    },
    "24x7 4h": {
      "<50km":    { customerCharge: 195, feCost: 50, profit: 145, currency: CURRENCY },
      "50-100km": { customerCharge: 225, feCost: 60, profit: 165, currency: CURRENCY },
      ">100km":   { customerCharge: 260, feCost: 70, profit: 190, currency: CURRENCY },
    },
    "24x7 NCD": {
      "<50km":    { customerCharge: 240, feCost: 60, profit: 180, currency: CURRENCY },
      "50-100km": { customerCharge: 275, feCost: 70, profit: 205, currency: CURRENCY },
      ">100km":   { customerCharge: 315, feCost: 85, profit: 230, currency: CURRENCY },
    },
  },
  "Reactive Support": {
    "8x5 NBD": {
      "<50km":    { customerCharge: 160, feCost: 45, profit: 115, currency: CURRENCY },
      "50-100km": { customerCharge: 185, feCost: 55, profit: 130, currency: CURRENCY },
      ">100km":   { customerCharge: 215, feCost: 65, profit: 150, currency: CURRENCY },
    },
    "8x5 4h": {
      "<50km":    { customerCharge: 195, feCost: 55, profit: 140, currency: CURRENCY },
      "50-100km": { customerCharge: 225, feCost: 65, profit: 160, currency: CURRENCY },
      ">100km":   { customerCharge: 260, feCost: 75, profit: 185, currency: CURRENCY },
    },
    "24x7 4h": {
      "<50km":    { customerCharge: 250, feCost: 65, profit: 185, currency: CURRENCY },
      "50-100km": { customerCharge: 285, feCost: 80, profit: 205, currency: CURRENCY },
      ">100km":   { customerCharge: 325, feCost: 95, profit: 230, currency: CURRENCY },
    },
    "24x7 NCD": {
      "<50km":    { customerCharge: 310, feCost:  80, profit: 230, currency: CURRENCY },
      "50-100km": { customerCharge: 350, feCost:  95, profit: 255, currency: CURRENCY },
      ">100km":   { customerCharge: 395, feCost: 110, profit: 285, currency: CURRENCY },
    },
  },
};

// -----------------------------------------------------------------------------
// Public option lists (used to populate admin form selects)
// -----------------------------------------------------------------------------
export const MAINTENANCE_LEVELS: MaintenanceLevel[] = [
  "Planned Activity",
  "Reactive Support",
];
export const SERVICE_LEVELS: ServiceLevel[] = [
  "8x5 NBD",
  "8x5 4h",
  "24x7 4h",
  "24x7 NCD",
];
export const DISTANCE_BANDS: DistanceBand[] = [
  "<50km",
  "50-100km",
  ">100km",
];

// -----------------------------------------------------------------------------
// Core calculation function — single source of truth for all billing
// -----------------------------------------------------------------------------
export function calculateCommercial(
  maintenanceLevel: MaintenanceLevel,
  serviceLevel:     ServiceLevel,
  distanceBand:     DistanceBand
): CommercialResult {
  const rate = RATE_TABLE[maintenanceLevel][serviceLevel][distanceBand];
  return {
    ...rate,
    ruleKey: buildRuleKey(maintenanceLevel, serviceLevel, distanceBand),
    maintenanceLevel,
    serviceLevel,
    distanceBand,
  };
}

// -----------------------------------------------------------------------------
// Key helpers — store the rule as a compact string on each task
// -----------------------------------------------------------------------------
export function buildRuleKey(
  maintenanceLevel: MaintenanceLevel,
  serviceLevel:     ServiceLevel,
  distanceBand:     DistanceBand
): string {
  return `${maintenanceLevel}|${serviceLevel}|${distanceBand}`;
}

export function parseRuleKey(key: string): {
  maintenanceLevel: MaintenanceLevel;
  serviceLevel:     ServiceLevel;
  distanceBand:     DistanceBand;
} | null {
  const [ml, sl, db] = key.split("|");
  if (!ml || !sl || !db) return null;
  return {
    maintenanceLevel: ml as MaintenanceLevel,
    serviceLevel:     sl as ServiceLevel,
    distanceBand:     db as DistanceBand,
  };
}

export function getRateFromKey(key: string): CommercialRate | null {
  const parsed = parseRuleKey(key);
  if (!parsed) return null;
  return (
    RATE_TABLE[parsed.maintenanceLevel]?.[parsed.serviceLevel]?.[parsed.distanceBand] ?? null
  );
}

/** Short human-readable label for table display, e.g. "RS · 24x7 4h · <50km" */
export function shortLabel(key: string): string {
  const parsed = parseRuleKey(key);
  if (!parsed) return key;
  const ml = parsed.maintenanceLevel === "Planned Activity" ? "PA" : "RS";
  return `${ml} · ${parsed.serviceLevel} · ${parsed.distanceBand}`;
}
