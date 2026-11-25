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

// "Please find the FE details below:" / "Please see the Field Engineers details"
const HEADING = /\b(?:F\.?\s?E\.?s?|field\s+engineers?|engineers?)(?:'s)?\s+details?\b/i;
const ID_LINE = /^(?:CNIC|NIC|national\s+id|passport)\b/i;
// Below this the details are someone else's: the site contact, or a signature
const OTHER_PERSON = /\b(?:LCON|POC|local\s+contact|site\s+contact)\b|^(?:warm |best |kind )?regards\b|^thanks\b/i;

/** Engineers listed under a details heading: "Name: Gulraiz Khan", or a (numbered) name with its ID on the next line. */
function listedNames(text: string): string[] {
  const lines = text.split("\n").map((l) => l.replace(/[*_]+/g, " ").trim()).filter(Boolean);
  const start = lines.findIndex((l) => HEADING.test(l));
  if (start === -1) return [];
  const out: string[] = [];
  for (let i = start + 1; i < Math.min(lines.length, start + 30); i++) {
    const labelled = /^(?:\d+\s*[.)]\s*)?name\s*[:\-–]\s*(.+)$/i.exec(lines[i]);
    const raw = labelled?.[1] ?? (ID_LINE.test(lines[i + 1] ?? "") ? lines[i].replace(/^\d+\s*[.)]\s*/, "") : null);
    const name = raw && cleanName(raw);
    if (name) { if (!out.some((n) => n.toLowerCase() === name.toLowerCase())) out.push(name); }
    else if (OTHER_PERSON.test(lines[i])) break;
  }
  return out;
}

/** Labelled names ("FE Name: …") win; otherwise names listed under a details heading. */
function engineersIn(text: string): string[] {
  const labelled = namesIn(text);
  return labelled.length ? labelled : listedNames(text);
}

/** Engineers named in an email, and whether they are in the new message or only in the quoted thread. */
export function readEngineer(body: string): { name: string; quoted: boolean } | null {
  const text = body.replace(/\r\n?/g, "\n").replace(/ /g, " ");
  const cut = text.search(QUOTED);
  const fresh = engineersIn(cut >= 0 ? text.slice(0, cut) : text);
  if (fresh.length) return { name: fresh.join(", "), quoted: false };
  // In the thread below, the topmost mention is the most recent
  const old = cut >= 0 ? engineersIn(text.slice(cut)) : [];
  return old.length ? { name: old[0], quoted: true } : null;
}

/** What the sender wrote themselves, without the quoted thread below it. */
export function freshText(body: string): string {
  const text = body.replace(/\r\n?/g, "\n");
  const cut = text.search(QUOTED);
  return cut >= 0 ? text.slice(0, cut) : text;
}

/** The one job a piece of text (usually a subject) refers to; null if it names none or more than one. */
export function jobForSubject(tasks: Task[], text: string): Task | null {
  const wos = [...new Set([...text.matchAll(/\b(\d{8}(?:-\d+)?)\b/g)].map((m) => m[1]))];
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
