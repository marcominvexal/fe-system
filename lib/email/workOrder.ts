/**
 * /lib/email/workOrder.ts — matching Orange work order numbers to jobs.
 *
 * The suffix is the visit: 18533758-1 and 18533758-2 are separate dispatches
 * that Orange closes separately, so they are separate jobs. Emails sometimes
 * leave the suffix out; a bare number means the job when only one fits.
 */
import type { Task } from "@/lib/store";

const base = (wo: string) => wo.split("-")[0];
const hasVisit = (wo: string) => wo.includes("-");

/** The job a work order number refers to, or -1 when there is none or it is unclear. */
export function findJobIndex(tasks: Task[], wo: string): number {
  const exact = tasks.findIndex((t) => t.workOrder === wo);
  if (exact !== -1) return exact;
  const loose = tasks.flatMap((t, i) =>
    t.workOrder && base(t.workOrder) === base(wo) && !(hasVisit(t.workOrder) && hasVisit(wo)) ? [i] : []);
  return loose.length === 1 ? loose[0] : -1;
}

/** Several visits share this bare number, so it can't be tied to one of them. */
export function isAmbiguous(tasks: Task[], wo: string): boolean {
  return !hasVisit(wo) && !tasks.some((t) => t.workOrder === wo)
    && tasks.filter((t) => t.workOrder && base(t.workOrder) === wo).length > 1;
}
