import { NextRequest, NextResponse } from "next/server";
import { BillingError, billingAudit, getInvoice, listInvoices, updateInvoice } from "@/lib/billing";
import { getTask } from "@/lib/repo";
import { loadPricing } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — invoice, its history, credit notes against it, and the work orders on it (for evidence). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await getInvoice(id);
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  const [history, all] = await Promise.all([billingAudit("invoice", invoice.id), listInvoices()]);
  const workOrders = (await Promise.all(invoice.lines.filter((l) => l.workOrderId).map((l) => getTask(l.workOrderId!)))).filter(Boolean);
  return NextResponse.json({
    invoice,
    history,
    credits: all.filter((c) => c.kind === "credit" && c.creditFor === invoice.id),
    original: invoice.creditFor ? all.find((c) => c.id === invoice.creditFor) ?? null : null,
    workOrders,
  });
}

/** PATCH { action, ... } — send, pay, void, add_adjustment, remove_line, credit, notes. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { action, ...body } = await req.json();
  await loadPricing(); // payment terms for the due date
  try {
    const invoice = await updateInvoice(id, action, body);
    return NextResponse.json(invoice);
  } catch (e) {
    if (e instanceof BillingError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
