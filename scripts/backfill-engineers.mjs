/**
 * One-off: fill in real field engineer names on existing work orders.
 *
 * For each job without a real name, re-reads that job's emails from the Gmail
 * inbox (by Message-ID), asks Gemini for the engineers named in them, and
 * saves the result with an audit entry. Jobs whose name was set by hand are
 * left alone. Run with:  node scripts/backfill-engineers.mjs [--dry-run]
 */
import { readFileSync } from "fs";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { neon } from "@neondatabase/serverless";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]));
const dry = process.argv.includes("--dry-run");
const sql = neon(env.DATABASE_URL);
const user = env.MAIL_USER || env.GMAIL_USER;
const pass = (env.MAIL_APP_PASSWORD || env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");

const PROMPT = `These emails are about one Orange Business field-engineer site visit in Pakistan.
List the full names of the field engineers (FEs) assigned to, travelling to or working at the site, exactly as written.
Only people doing the site work: never email senders, Orange staff, customer contacts, coordinators or managers.
Return JSON {"engineers": [..]} with an empty list if no engineer is named.

Emails:
`;

async function gemini(text) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL || "gemini-2.5-flash"}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: PROMPT + text }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json",
        responseSchema: { type: "OBJECT", properties: { engineers: { type: "ARRAY", items: { type: "STRING" } } }, required: ["engineers"] } },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const j = await res.json();
  return JSON.parse(j.candidates?.[0]?.content?.parts?.[0]?.text ?? '{"engineers":[]}').engineers ?? [];
}

const tidy = (list) => {
  const seen = new Set(); const out = [];
  for (const raw of list) {
    const n = raw.replace(/\s+/g, " ").replace(/^(mr|mr\.|engr\.?|engineer)\s+/i, "").trim();
    if (n.length < 3 || n.length > 60 || /@|\d/.test(n) || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase()); out.push(n);
  }
  return out.join(", ");
};

const rows = await sql.query("SELECT id, data FROM work_orders ORDER BY id");
const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user, pass }, logger: false });
await client.connect();
const lock = await client.getMailboxLock("[Gmail]/All Mail").catch(() => client.getMailboxLock("INBOX"));
try {
  for (const { id, data: t } of rows) {
    if (t.engineerNameSource) { console.log(id, "skip (already", t.engineerNameSource + ")"); continue; }
    const ids = (t.emailLog ?? []).map((e) => e.messageId).filter(Boolean);
    const parts = [];
    for (const mid of ids) {
      const uids = await client.search({ gmraw: `rfc822msgid:${mid.replace(/[<>]/g, "")}` }, { uid: true });
      if (!uids?.length) continue;
      const msg = await client.fetchOne(String(uids[0]), { source: true }, { uid: true });
      const mail = await simpleParser(msg.source);
      // Newest message of each thread only, without links
      const body = (mail.text ?? "").split(/\n-{2,}\s*Original Message|\nFrom: .*\nSent: /i)[0].replace(/https?:\/\/\S+/g, "").slice(0, 3000);
      parts.push(`Subject: ${mail.subject}\n${body}`);
    }
    // Fall back to the stored summaries if the originals can't be found
    const text = parts.length ? parts.join("\n\n---\n\n") : (t.emailLog ?? []).map((e) => `${e.subject ?? ""}: ${e.note ?? ""}`).join("\n");
    const names = tidy(await gemini(text.slice(0, 24000)));
    console.log(id, t.workOrder, `(${parts.length}/${ids.length} emails)`, "→", names || "no engineer named");
    if (!names || dry) continue;
    const next = { ...t, engineerName: names, engineerNameSource: "email" };
    await sql.query("UPDATE work_orders SET data = $2::jsonb, updated_at = now() WHERE id = $1", [id, JSON.stringify(next)]);
    await sql.query(
      `INSERT INTO audit_log (entity, entity_id, actor, action, changes, reason) VALUES ('work_order', $1, 'ai', 'updated', $2::jsonb, $3)`,
      [id, JSON.stringify({ engineerName: [t.engineerName ?? null, names] }), "Engineer name read from the job's Orange emails"],
    );
  }
} finally {
  lock.release();
  await client.logout();
}
