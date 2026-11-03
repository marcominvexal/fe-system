import { NextRequest, NextResponse } from "next/server";
import { createRun, previewRun } from "@/lib/billing";
import { loadPricing } from "@/lib/settings";
import { cycleByKey } from "@/lib/cycle";
import { knownEngineer } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isCycle = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}$/.test(s);

/** The billing cycle named by its end month, e.g. "2026-11" = 25 Oct – 24 Nov 2026. */
async function resolve(key: unknown) {
  if (!isCycle(key)) return null;
  const cfg = await loadPricing();
  return cycleByKey(key, cfg.contract.cycleStartDay);
}

/** GET /api/billing/run?cycle=YYYY-MM — what the cycle's invoice would contain. */
export async function GET(req: NextRequest) {
  const c = await resolve(new URL(req.url).searchParams.get("cycle"));
  if (!c) return NextResponse.json({ error: "Choose a billing cycle." }, { status: 400 });
  const p = await previewRun(c.start, c.end, c.name);
  return NextResponse.json({
    ...p,
    range: c.range,
    visits: p.visits.map((t) => ({ id: t.id, workOrder: t.workOrder, title: t.title, engineer: knownEngineer(t), amount: t.customerChargeUSD ?? 0, fePay: t.engineerPaymentUSD ?? 0 })),
  });
}

/** POST /api/billing/run { cycle } — create the cycle's draft invoice and partner payouts. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { cycle?: string };
  const c = await resolve(body.cycle);
  if (!c) return NextResponse.json({ error: "Choose a billing cycle." }, { status: 400 });
  const r = await createRun(c.start, c.end, "admin", c.name);
  if (!r.invoice) return NextResponse.json({ error: "Nothing to invoice in this cycle: no billed visits, and the monthly charge is already on an invoice." }, { status: 400 });
  return NextResponse.json(r, { status: 201 });
}
