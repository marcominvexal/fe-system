/**
 * /lib/email/persist.ts — Server-side only. Runs a batch of emails through the
 * pipeline and saves the result: changed work orders (with audit entries that
 * name the email responsible) and the email log.
 */
import type { Task } from "@/lib/store";
import { highestTaskNumber, listTasks, saveChanged, type Actor } from "@/lib/repo";
import { processEmails, type Processed } from "./process";
import { recordBatch } from "./log";
import { loadPricing } from "@/lib/settings";
import { setIdFloor, type IncomingEmail } from "./ingest";

export async function applyEmails(emails: IncomingEmail[], source: "sync" | "import", scanned?: number) {
  await loadPricing();
  const before = await listTasks();
  setIdFloor(await highestTaskNumber());
  const { tasks, results, aiCalls } = await processEmails(before, emails);

  // The last email that touched each work order explains the change
  const lastFor = new Map<string, Processed>();
  for (const r of results) {
    if ((r.outcome.status === "created" || r.outcome.status === "updated")) lastFor.set(r.outcome.taskId, r);
  }
  const actorFor = (t: Task): Actor => {
    const r = lastFor.get(t.id);
    return r && "viaAi" in r.outcome && r.outcome.viaAi ? "ai" : "email";
  };
  const reasonFor = (t: Task) => {
    const r = lastFor.get(t.id);
    if (!r) return undefined;
    const via = source === "sync" ? "inbox sync" : "file upload";
    return `${"viaAi" in r.outcome && r.outcome.viaAi ? "AI read" : "Email"} via ${via}: ${r.mail.subject}`;
  };

  await saveChanged(before, tasks, actorFor, reasonFor);
  if (results.length) await recordBatch(source, results, scanned ?? results.length);
  return { results, aiCalls };
}
