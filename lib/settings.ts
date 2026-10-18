/**
 * /lib/settings.ts — Server-side only. Loads and saves the pricing config
 * (rate table, engineer pay share, automatic pricing rules) in app_state,
 * and records each change in the audit trail.
 */
import { getDb } from "./db/client";
import { DEFAULT_PRICING, setPricing, validatePricing, type PricingConfig } from "./pricing";
import type { Actor } from "./repo";

/** Saved config merged over the defaults, so new settings always have a value. */
function merge(saved: Partial<PricingConfig> | null): PricingConfig {
  if (!saved) return DEFAULT_PRICING;
  return {
    ...DEFAULT_PRICING,
    ...saved,
    table: { ...DEFAULT_PRICING.table, ...saved.table },
    issuer: { ...DEFAULT_PRICING.issuer, ...saved.issuer },
    rules: {
      ...DEFAULT_PRICING.rules,
      ...saved.rules,
      businessHours: { ...DEFAULT_PRICING.rules.businessHours, ...saved.rules?.businessHours },
      visitBands: { ...DEFAULT_PRICING.rules.visitBands, ...saved.rules?.visitBands },
    },
  };
}

/** Read the active pricing from the database and make it the engine's config. */
export async function loadPricing(): Promise<PricingConfig> {
  const db = await getDb();
  const [row] = await db.query<{ value: unknown }>("SELECT value FROM app_state WHERE key = 'pricing'");
  const cfg = merge(row ? (typeof row.value === "string" ? JSON.parse(row.value) : row.value) as Partial<PricingConfig> : null);
  setPricing(cfg);
  return cfg;
}

/** Plain-language list of what differs between two configs. */
function describeChanges(a: PricingConfig, b: PricingConfig): Record<string, [unknown, unknown]> {
  const out: Record<string, [unknown, unknown]> = {};
  const walk = (x: unknown, y: unknown, path: string) => {
    if (JSON.stringify(x) === JSON.stringify(y)) return;
    if (x && y && typeof x === "object" && typeof y === "object" && !Array.isArray(x)) {
      for (const k of new Set([...Object.keys(x), ...Object.keys(y as object)])) {
        walk((x as Record<string, unknown>)[k], (y as Record<string, unknown>)[k], path ? `${path} › ${k}` : k);
      }
      return;
    }
    out[path] = [x ?? null, y ?? null];
  };
  walk(a, b, "");
  return out;
}

export async function savePricing(next: PricingConfig, actor: Actor, reason?: string) {
  const errors = validatePricing(next);
  if (errors.length) return { ok: false as const, errors };
  const db = await getDb();
  const before = await loadPricing();
  const changes = describeChanges(before, next);
  if (!Object.keys(changes).length) return { ok: true as const, config: before, changed: 0 };
  await db.query(
    `INSERT INTO app_state (key, value) VALUES ('pricing', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(next)],
  );
  await db.query(
    `INSERT INTO audit_log (entity, entity_id, actor, action, changes, reason) VALUES ('settings', 'pricing', $1, 'updated', $2::jsonb, $3)`,
    [actor, JSON.stringify(changes), reason ?? null],
  );
  setPricing(next);
  return { ok: true as const, config: next, changed: Object.keys(changes).length };
}
