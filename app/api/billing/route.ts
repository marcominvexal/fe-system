import { NextResponse } from "next/server";
import { listInvoices, listPayouts, unbilled } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/billing — invoices, payouts and billed visits waiting for an invoice. */
export async function GET() {
  const [invoices, payouts, waiting] = await Promise.all([listInvoices(), listPayouts(), unbilled()]);
  return NextResponse.json({
    invoices,
    payouts,
    unbilled: waiting.map((t) => ({ id: t.id, workOrder: t.workOrder, title: t.title, amount: t.customerChargeUSD ?? 0 })),
  });
}
