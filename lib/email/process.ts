/**
 * /lib/email/process.ts — Server-side only. Decides how each email is read:
 *   1. a known OBSLink template → exact parser (dispatch / photo / cleared)
 *   2. unrelated mail (keyword filter) → ignored without calling the API
 *   3. anything else that mentions Orange field work → Gemini reads it
 */
import type { Task } from "@/lib/store";
import { ingestAi, ingestEmail, type IncomingEmail, type IngestOutcome } from "./ingest";
import { classify } from "./parse";
import { aiEnabled, extractWithAi, mightBeRelevant } from "./ai";

/** Upper bound on Gemini calls per run, to keep a sync fast and predictable. */
const MAX_AI_PER_RUN = Number(process.env.MAIL_MAX_AI_PER_RUN || 30);

export interface Processed { mail: IncomingEmail; outcome: IngestOutcome }

export async function processEmails(tasks: Task[], emails: IncomingEmail[]) {
  let list = tasks;
  const results: Processed[] = [];
  let aiCalls = 0;

  for (const mail of emails) {
    // 1. Fixed templates
    if (classify(mail.subject)) {
      const r = ingestEmail(list, mail);
      list = r.tasks;
      results.push({ mail, outcome: r.outcome });
      continue;
    }
    // Already read on an earlier run
    const seen = list.find((t) => t.emailLog?.some((e) => e.messageId === mail.messageId));
    if (seen) {
      results.push({ mail, outcome: { status: "duplicate", taskId: seen.id, workOrder: seen.workOrder ?? seen.id } });
      continue;
    }
    // 2. Cheap relevance filter
    if (!mightBeRelevant(mail)) {
      results.push({ mail, outcome: { status: "ignored", reason: "Not about Orange field work" } });
      continue;
    }
    // 3. Gemini
    if (!aiEnabled()) {
      results.push({ mail, outcome: { status: "ignored", reason: "Mentions Orange field work, but AI reading is off (set GEMINI_API_KEY)" } });
      continue;
    }
    if (aiCalls >= MAX_AI_PER_RUN) {
      results.push({ mail, outcome: { status: "ignored", reason: `Skipped: AI limit of ${MAX_AI_PER_RUN} emails per run reached — sync again` } });
      continue;
    }
    aiCalls++;
    try {
      const ai = await extractWithAi(mail);
      if (!ai) throw new Error("AI unavailable");
      const r = ingestAi(list, mail, ai);
      list = r.tasks;
      results.push({ mail, outcome: r.outcome });
    } catch (e) {
      results.push({ mail, outcome: { status: "ignored", reason: `AI could not read this email: ${e instanceof Error ? e.message : String(e)}` } });
    }
  }
  return { tasks: list, results, aiCalls };
}
