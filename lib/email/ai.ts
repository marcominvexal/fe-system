/**
 * /lib/email/ai.ts — Server-side only. Uses Gemini to read Orange-related
 * emails that are not one of the fixed OBSLink templates (reply threads,
 * escalations, forwards with commentary) and decide whether they concern an
 * Orange Business field-engineer deployment.
 */
import type { IncomingEmail } from "./ingest";
import { stripLinks } from "./parse";

export type AiKind = "dispatch" | "progress" | "cleared" | "cancelled" | "other";

export interface AiExtraction {
  relevant:     boolean;
  reason:       string;
  kind:         AiKind;
  workOrder?:   string;   // Orange work order / FLIP number, e.g. "18533289" or "18531881-1"
  incident?:    string;   // e.g. "INC0320467"
  endCustomer?: string;
  siteId?:      string;
  city?:        string;
  scheduledAt?: string;   // ISO, requested engineer arrival if stated
  summary:      string;   // one sentence: what this email changes
}

export const aiEnabled = () => !!process.env.GEMINI_API_KEY;
const MODEL = () => process.env.GEMINI_MODEL || "gemini-2.5-flash";

/** Cheap filter so unrelated mail (sales, bills, newsletters) never reaches the API. */
export function mightBeRelevant(mail: IncomingEmail): boolean {
  const head = `${mail.subject}\n${mail.from}\n${mail.text.slice(0, 4000)}`;
  const orange = /orange|obs\b|obslink|cairo\.scc|dcsc/i.test(head);
  const fieldWork = /work order|\bwo\b|\bflip\b|field engineer|\bfe\b|dispatch|site visit|on[- ]site|\bINC\d{5,}|\b\d{8}(-\d)?\b/i.test(head);
  return orange && fieldWork;
}

const SCHEMA = {
  type: "OBJECT",
  properties: {
    relevant:    { type: "BOOLEAN" },
    reason:      { type: "STRING" },
    kind:        { type: "STRING", enum: ["dispatch", "progress", "cleared", "cancelled", "other"] },
    workOrder:   { type: "STRING" },
    incident:    { type: "STRING" },
    endCustomer: { type: "STRING" },
    siteId:      { type: "STRING" },
    city:        { type: "STRING" },
    scheduledAt: { type: "STRING" },
    summary:     { type: "STRING" },
  },
  required: ["relevant", "reason", "kind", "summary"],
};

const PROMPT = `You triage the mailbox of a field-service partner (ASP) that sends field engineers (FEs) to sites in Pakistan for Orange Business (OBS).
Decide if this email is about an Orange Business field-engineer deployment: a dispatch request, a site visit, an FE arriving/working/leaving, an incident needing on-site work, or the closure/cancellation of such a visit.
NOT relevant: RFPs, quotations, pricing, sales, invoices/bills from other companies, newsletters, HR, or anything without on-site work for Orange.

Return JSON only:
- relevant: true/false
- reason: short reason for the decision
- kind: dispatch (new request for an FE), progress (update on an open visit, e.g. FE travelling/on site/escalation), cleared (work finished/resolved/closed), cancelled, or other
- workOrder: the Orange work order or FLIP number (e.g. "18533289" or "18531881-1"); omit if none
- incident: incident number like INC0320467 if present
- endCustomer, siteId, city: if stated
- scheduledAt: requested FE arrival as ISO 8601 with offset (Pakistan is +05:00) if clearly stated
- summary: one plain sentence describing what this email says happened or is requested

Email:
`;

export async function extractWithAi(mail: IncomingEmail): Promise<AiExtraction | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  // Keep the newest message of a thread and drop links (portal tokens) before sending
  const body = stripLinks(mail.text).replace(/\n{3,}/g, "\n\n").slice(0, 9000);
  const input = `Subject: ${mail.subject}\nFrom: ${mail.from}\nDate: ${mail.date}\n\n${body}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: PROMPT + input }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: SCHEMA },
      }),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(`Gemini ${res.status}: ${err.error?.message ?? res.statusText}`);
  }
  const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no answer");
  const out = JSON.parse(text) as AiExtraction;
  if (out.scheduledAt && isNaN(new Date(out.scheduledAt).getTime())) delete out.scheduledAt;
  return out;
}
