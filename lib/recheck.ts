/**
 * /lib/recheck.ts — Server-side only. After the distance rules change, open
 * work orders get their distance band worked out again. Billed, invoiced and
 * cancelled work keeps its price; jobs whose price a person set are left alone.
 */
import type { Task } from "./store";
import { listTasks, saveTask, type Actor } from "./repo";
import { classifyDistance } from "./email/rules";
import { buildRuleKey, calculateCommercial } from "./commercialEngine";

const isDistanceLine = (b: string) => b.startsWith("Distance ");

export async function recheckDistances(actor: Actor, reason: string): Promise<{ changed: string[] }> {
  const changed: string[] = [];
  for (const t of await listTasks()) {
    if (t.status === "approved" || t.status === "cancelled" || t.status === "rejected" || t.invoiceId) continue;
    if (t.pricingReviewed) continue; // a person confirmed or set this price
    const d = classifyDistance({ siteId: t.siteId, location: [t.location, t.title].filter(Boolean).join(" · ") });
    const oldLine = t.pricingBasis?.find(isDistanceLine);
    if (d.distanceBand === t.distanceBand && d.basis === oldLine) continue;

    const next: Task = {
      ...t,
      distanceBand: d.distanceBand,
      ruleKey: buildRuleKey(t.maintenanceLevel, t.serviceLevel, d.distanceBand, t.visitDuration),
      pricingBasis: [...(t.pricingBasis ?? []).filter((b) => !isDistanceLine(b)), d.basis],
    };
    // A cleared visit may already carry a calculated charge; keep it in step
    if (t.customerChargeUSD != null) {
      const c = calculateCommercial(t.maintenanceLevel, t.serviceLevel, d.distanceBand, t.visitDuration);
      next.customerChargeUSD = c.customerChargeUSD;
      next.engineerPaymentUSD = c.engineerPaymentUSD;
      next.profit = c.profit;
    }
    await saveTask(next, actor, reason, t);
    changed.push(t.id);
  }
  return { changed };
}
