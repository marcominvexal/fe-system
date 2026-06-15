// =============================================================================
// Commercial Rules Engine — Orange Business Pricing Matrix
// 4 dimensions: DistanceBand × MaintenanceLevel × ServiceLevel × VisitDuration
// Pure TypeScript — no UI, no side effects.
// =============================================================================

export type MaintenanceLevel = "Planned Activity" | "Reactive Support";
export type ServiceLevel     = "8x5 NBD" | "8x5 4h" | "24x7 4h";
export type DistanceBand     = "<50km" | "50-100km" | ">100km";
export type VisitDuration    = "2h" | "Half Day" | "Full Day";

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
// Orange Business Pricing Table
//
// <50km:
//   Planned 8x5 NBD   → 2h=100 / Half=120 / Full=200
//   Reactive 8x5 4h   → 2h=130 / Half=150 / Full=230
//   Reactive 24x7 4h  → 2h=150 / Half=180 / Full=270
//
// 50-100km:
//   Planned            → 2h=150 / Half=180 / Full=270
//   Reactive           → 2h=200 / Half=250 / Full=350
//
// >100km:
//   Planned            → 2h=200 / Half=250 / Full=350
//   Reactive           → 2h=250 / Half=320 / Full=430
//
// FE payment ≈ 30% of customer charge (rounded to nearest dollar).
// -----------------------------------------------------------------------------

function fe(charge: number): number {
  return Math.round(charge * 0.30);
}

function rate(charge: number): CommercialRate {
  const engineerPaymentUSD = fe(charge);
  return { customerChargeUSD: charge, engineerPaymentUSD, profit: charge - engineerPaymentUSD };
}

// Pricing lookup: [distanceBand][maintenanceCategory][visitDuration]
// maintenanceCategory collapses serviceLevel for 50-100km / >100km bands
type PricingLeaf = Record<VisitDuration, CommercialRate>;
type PricingByMaint = Record<"planned" | "reactive_8x5" | "reactive_24x7", PricingLeaf>;
type PricingTable = Record<DistanceBand, PricingByMaint>;

const TABLE: PricingTable = {
  "<50km": {
    planned: {
      "2h":       rate(100),
      "Half Day": rate(120),
      "Full Day": rate(200),
    },
    reactive_8x5: {
      "2h":       rate(130),
      "Half Day": rate(150),
      "Full Day": rate(230),
    },
    reactive_24x7: {
      "2h":       rate(150),
      "Half Day": rate(180),
      "Full Day": rate(270),
    },
  },
  "50-100km": {
    planned: {
      "2h":       rate(150),
      "Half Day": rate(180),
      "Full Day": rate(270),
    },
    // Both reactive SLA tiers same price at this distance band
    reactive_8x5: {
      "2h":       rate(200),
      "Half Day": rate(250),
      "Full Day": rate(350),
    },
    reactive_24x7: {
      "2h":       rate(200),
      "Half Day": rate(250),
      "Full Day": rate(350),
    },
  },
  ">100km": {
    planned: {
      "2h":       rate(200),
      "Half Day": rate(250),
      "Full Day": rate(350),
    },
    reactive_8x5: {
      "2h":       rate(250),
      "Half Day": rate(320),
      "Full Day": rate(430),
    },
    reactive_24x7: {
      "2h":       rate(250),
      "Half Day": rate(320),
      "Full Day": rate(430),
    },
  },
};

function maintKey(
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
  const base = TABLE[distanceBand][mk][visitDuration];
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
  return TABLE[parsed.distanceBand]?.[mk]?.[parsed.visitDuration] ?? null;
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
