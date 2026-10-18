import { NextRequest, NextResponse } from "next/server";
import { createRun, previewRun } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** GET /api/billing/run?start=YYYY-MM-DD&end=YYYY-MM-DD — what an invoice run would include. */
export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams;
  const start = q.get("start"), end = q.get("end");
  if (!isDate(start) || !isDate(end) || start > end) {
    return NextResponse.json({ error: "Choose a valid period (start on or before end)." }, { status: 400 });
  }
  const p = await previewRun(start, end);
  return NextResponse.json({
    ...p,
    visits: p.visits.map((t) => ({ id: t.id, workOrder: t.workOrder, title: t.title, amount: t.customerChargeUSD ?? 0, fePay: t.engineerPaymentUSD ?? 0 })),
  });
}

/** POST /api/billing/run { start, end } — create the draft invoice and partner payouts. */
export async function POST(req: NextRequest) {
  const { start, end } = await req.json() as { start?: string; end?: string };
  if (!isDate(start) || !isDate(end) || start > end) {
    return NextResponse.json({ error: "Choose a valid period (start on or before end)." }, { status: 400 });
  }
  const r = await createRun(start, end);
  if (!r.invoice) return NextResponse.json({ error: "No billed visits are waiting to be invoiced in this period." }, { status: 400 });
  return NextResponse.json(r, { status: 201 });
}
