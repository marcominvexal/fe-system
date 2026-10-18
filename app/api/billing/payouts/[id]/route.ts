import { NextRequest, NextResponse } from "next/server";
import { BillingError, updatePayout } from "@/lib/billing";

export const runtime = "nodejs";

/** PATCH { action: "pay", reference?, paidAt? } — mark a partner payout as paid. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { action, ...body } = await req.json();
  try {
    return NextResponse.json(await updatePayout(id, action, body));
  } catch (e) {
    if (e instanceof BillingError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
