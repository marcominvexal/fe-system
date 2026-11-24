/**
 * /lib/email/engineer.ts — reads the field engineer's name from an email
 * without AI. Partners write it as a labelled line ("FE Name: Waqar Islam"),
 * in replies and in notes Orange's portal sends out.
 */
import type { Task } from "@/lib/store";
import { findJobIndex } from "./workOrder";

const LABEL = /\b(?:F\.?\s?E\.?|field\s+engineer|engineer)(?:'s)?\s+name\s*[:\-–]\s*/gi;
// What can follow the name on the same line ("FE Name: Waqar Islam ETA: Tomorrow")
const NEXT_FIELD = /\s+(?:ETA|CNIC|Contact|Mobile|Phone|Cell|Email|FE|F\.E|Car|Vehicle|Passport|ID|Regards|Thanks|Thx)\b.*$/i;
// Start of the quoted thread below a reply
const QUOTED = /^[ \t>]*(?:From|Sent|De)\s*:\s.+$|^\s*-{2,}\s*Original Message|^\s*On .+ wrote:\s*$|^_{20,}\s*$/im;

function cleanName(raw: string): string | null {
  const name = raw.replace(/[*_<>]+/g, " ").replace(/[\t ]+/g, " ").replace(NEXT_FIELD, "")
    .replace(/[|,;(].*$/, "").replace(/^(?:mr|engr|eng)\.?\s+/i, "").replace(/[.\s]+$/, "").trim();
  // Two to five words of letters: rejects empty templates, codes and addresses
  return /^\p{L}[\p{L}.'-]*(?: \p{L}[\p{L}.'-]*){1,4}$/u.test(name) && name.length <= 50 ? name : null;
}

function namesIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(LABEL)) {
    // The label may end its line, with the name on the next one; a following
    // "Something:" label means the name was left blank.
    const [line, next = ""] = text.slice(m.index + m[0].length).replace(/^\n/, "").split("\n", 2);
    const raw = /^[^:]{2,30}:/.test(line) && !NEXT_FIELD.test(line) ? "" : line || next;
    const name = raw.includes(":") && !NEXT_FIELD.test(raw) ? null : cleanName(raw);
    if (name && !out.some((n) => n.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  return out;
}

/** Engineers named in an email, and whether they are in the new message or only in the quoted thread. */
export function readEngineer(body: string): { name: string; quoted: boolean } | null {
  const text = body.replace(/\r\n?/g, "\n").replace(/ /g, " ");
  const cut = text.search(QUOTED);
  const fresh = namesIn(cut >= 0 ? text.slice(0, cut) : text);
  if (fresh.length) return { name: fresh.join(", "), quoted: false };
  // In the thread below, the topmost mention is the most recent
  const old = cut >= 0 ? namesIn(text.slice(cut)) : [];
  return old.length ? { name: old[0], quoted: true } : null;
}

/** The one job an email's subject refers to; null if it names none or more than one. */
export function jobForSubject(tasks: Task[], subject: string): Task | null {
  const wos = [...new Set([...subject.matchAll(/\b(\d{8}(?:-\d+)?)\b/g)].map((m) => m[1]))];
  const found = new Set<Task>();
  for (const wo of wos) {
    const i = findJobIndex(tasks, wo);
    if (i !== -1) found.add(tasks[i]);
  }
  return found.size === 1 ? [...found][0] : null;
}

/** Put the engineer's name on the job an email is about. Never overwrites a name entered by hand. */
export function applyEngineer(tasks: Task[], mail: { subject: string; text: string; from: string }): Task[] {
  const read = readEngineer(mail.text);
  if (!read) return tasks;
  const job = jobForSubject(tasks, mail.subject);
  if (!job || job.engineerNameSource === "manual" || job.engineerName === read.name) return tasks;
  // Quoted names, and the note history Orange's portal repeats in its notices,
  // can be older than what we have, so they only fill a gap
  const history = read.quoted || /noreply@orange.com/i.test(mail.from);
  if (history && job.engineerNameSource) return tasks;
  return tasks.map((t) => (t === job ? { ...t, engineerName: read.name, engineerNameSource: "email" as const } : t));
}
