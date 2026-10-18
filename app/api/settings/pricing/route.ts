import { NextRequest, NextResponse } from "next/server";
import { loadPricing, savePricing } from "@/lib/settings";
import { DEFAULT_PRICING, type PricingConfig } from "@/lib/pricing";
import { getDb } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — the active pricing config, the defaults, and recent change history. */
export async function GET() {
  const config = await loadPricing();
  const db = await getDb();
  const history = await db.query<{ id: number; at: string; actor: string; changes: unknown; reason: string | null }>(
    `SELECT id, at, actor, changes, reason FROM audit_log WHERE entity = 'settings' AND entity_id = 'pricing' ORDER BY at DESC LIMIT 20`,
  );
  return NextResponse.json({
    config,
    defaults: DEFAULT_PRICING,
    history: history.map((h) => ({ ...h, id: Number(h.id), at: new Date(h.at).toISOString(),
      changes: typeof h.changes === "string" ? JSON.parse(h.changes) : h.changes })),
  });
}

/** PUT — save an edited config (validated). Billed work is never re-priced. */
export async function PUT(req: NextRequest) {
  const { config, reason } = await req.json() as { config: PricingConfig; reason?: string };
  const r = await savePricing(config, "admin", reason || "Edited on the Pricing rules page");
  if (!r.ok) return NextResponse.json({ error: r.errors.join(" "), errors: r.errors }, { status: 400 });
  return NextResponse.json(r);
}
