import type { Task } from "@/lib/store";

/** Column values for a work_orders row (order matches the INSERT/UPSERT statements). */
export function taskRow(t: Task): unknown[] {
  const clearedAt = t.emailLog?.find((e) => e.kind === "cleared")?.at ?? t.checkOutTime ?? null;
  return [
    t.id,
    t.workOrder ?? null,
    t.status,
    t.source ?? "manual",
    t.customer,
    t.endCustomer ?? null,
    t.customerChargeUSD ?? null,
    t.engineerPaymentUSD ?? null,
    t.profit ?? null,
    t.invoiceNumber ?? null,
    t.createdAt,
    clearedAt,
    JSON.stringify(t),
  ];
}
