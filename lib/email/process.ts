/**
 * /lib/email/process.ts — Server-side only. Decides how each email is read:
 *   1. a known OBSLink template → exact parser (dispatch / photo / cleared)
 *   2. unrelated mail (keyword filter) → ignored without calling the API
 *   3. a person's email about a known job → logged on it without AI
 *   4. only what is left (no matching job, or a possible cancellation) → Gemini
 */
import type { Task } from "@/lib/store";
import { ingestAi, ingestEmail, isTrusted, logReply, type IncomingEmail, type IngestOutcome } from "./ingest";
import { classify } from "./parse";
import { applyEngineer, freshText, jobForSubject } from "./engineer";
import { aiEnabled, extractWithAi, mightBeRelevant } from "./ai";

/** Upper bound on Gemini calls per run, to keep a sync fast and predictable. */
const MAX_AI_PER_RUN = Number(process.env.MAIL_MAX_AI_PER_RUN || 10);

export interface Processed { mail: IncomingEmail; outcome: IngestOutcome }

/** A person saying a visit is off: worth reading properly, as it changes what is billed. */
const MAY_CANCEL = /\bcancel|call(?:ed)? off|no longer (?:needed|required)|stand down/i;

export async function processEmails(tasks: Task[], emails: IncomingEmail[]) {
  let list = tasks;
  const results: Processed[] = [];
  let aiCalls = 0;
  let aiDown: string | null = null; // quota or spending cap reached: stop asking for this run

  for (const mail of emails) {
    // 1. Fixed templates — only from Orange itself. A person replying under an
    //    Orange subject line is read like any other thread (step 3).
    if (classify(mail.subject) && isTrusted(mail)) {
      const r = ingestEmail(list, mail);
      list = applyEngineer(r.tasks, mail);
      results.push({ mail, outcome: r.outcome });
      continue;
    }
    // The engineer's name is a labelled line, so it never depends on AI
    list = applyEngineer(list, mail);
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
    // 3. About a job we already have: log it. Orange's own notices carry the status.
    const job = jobForSubject(list, mail.subject) ?? jobForSubject(list, freshText(mail.text));
    const cancels = !!job && !["approved", "cancelled"].includes(job.status) && MAY_CANCEL.test(freshText(mail.text));
    if (job && !cancels) {
      const r = logReply(list, job, mail);
      list = r.tasks;
      results.push({ mail, outcome: r.outcome });
      continue;
    }
    // 4. Gemini
    if (!aiEnabled()) {
      results.push({ mail, outcome: { status: "ignored", reason: "Mentions Orange field work, but AI reading is off (set GEMINI_API_KEY)" } });
      continue;
    }
    if (aiCalls >= MAX_AI_PER_RUN) {
      results.push({ mail, outcome: { status: "ignored", reason: `Skipped: AI limit of ${MAX_AI_PER_RUN} emails per run reached — sync again` } });
      continue;
    }
    if (aiDown) {
      results.push({ mail, outcome: { status: "ignored", reason: `AI could not read this email: ${aiDown}` } });
      continue;
    }
    aiCalls++;
    try {
      const ai = await extractWithAi(mail);
      if (!ai) throw new Error("AI unavailable");
      const r = ingestAi(list, mail, ai);
      list = applyEngineer(r.tasks, mail);
      results.push({ mail, outcome: r.outcome });
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      if (/^Gemini 429/.test(why)) aiDown = why;
      results.push({ mail, outcome: { status: "ignored", reason: `AI could not read this email: ${why}` } });
    }
  }
  return { tasks: list, results, aiCalls };
}
