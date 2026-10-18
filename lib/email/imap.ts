/**
 * /lib/email/imap.ts — Server-side only. Reads new Orange Business
 * notifications from the configured mailbox over IMAP (Gmail + app password
 * by default) and remembers the last UID it processed.
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getDb } from "@/lib/db/client";
import type { IncomingEmail } from "./ingest";

export interface MailConfig {
  host: string; port: number; user: string; pass: string; folder: string; lookbackDays: number;
}

export function mailConfig(): MailConfig | null {
  // GMAIL_* names are accepted as aliases
  const user = process.env.MAIL_USER || process.env.GMAIL_USER;
  const pass = process.env.MAIL_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return {
    host: process.env.MAIL_IMAP_HOST || "imap.gmail.com",
    port: Number(process.env.MAIL_IMAP_PORT || 993),
    user,
    pass: pass.replace(/\s+/g, ""), // Gmail shows app passwords in groups of four
    folder: process.env.MAIL_FOLDER || "INBOX",
    lookbackDays: Number(process.env.MAIL_LOOKBACK_DAYS || 30),
  };
}

// ── Sync position (UID), stored in app_state ─────────────────────────────────
interface SyncState { uidValidity?: string; lastUid?: number; lastRunAt?: string }

export async function readState(): Promise<SyncState> {
  const db = await getDb();
  const [row] = await db.query<{ value: unknown }>("SELECT value FROM app_state WHERE key = 'mail_sync'");
  if (!row) return {};
  return (typeof row.value === "string" ? JSON.parse(row.value) : row.value) as SyncState;
}
async function writeState(s: SyncState) {
  const db = await getDb();
  await db.query(
    `INSERT INTO app_state (key, value) VALUES ('mail_sync', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(s)],
  );
}

/**
 * Remember how far the mailbox has been read. Pass the UID just before the
 * first email that should be retried (AI limit reached, AI off or failed).
 */
export async function saveSyncPosition(validity: string | undefined, lastUid: number) {
  await writeState({ uidValidity: validity, lastUid, lastRunAt: new Date().toISOString() });
}

/** Fetch candidate emails that arrived since the last run (or the lookback window on first run). */
export async function fetchNewMail(cfg: MailConfig): Promise<{
  emails: IncomingEmail[]; scanned: number; validity?: string; maxUid: number; prevUid: number;
}> {
  const client = new ImapFlow({
    host: cfg.host, port: cfg.port, secure: cfg.port === 993,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
  });
  await client.connect();
  const lock = await client.getMailboxLock(cfg.folder);
  try {
    const box = client.mailbox;
    const validity = box && typeof box === "object" ? String(box.uidValidity) : undefined;
    const state = await readState();
    const fresh = !state.lastUid || state.uidValidity !== validity;

    const range = fresh ? {} : { uid: `${state.lastUid! + 1}:*` };
    const since = fresh ? { since: new Date(Date.now() - cfg.lookbackDays * 86_400_000) } : {};
    // Narrow the server-side search to mail that could be about Orange field work.
    // Gmail understands its own search syntax, which also matches forwarded mail.
    const criteria = /gmail/i.test(cfg.host)
      ? { ...range, ...since, gmraw: `("work order" OR OBS OR OBSLink OR orange OR FLIP OR "field engineer" OR dispatch)` }
      : { ...range, ...since, or: [{ from: "orange.com" }, { subject: "Work Order" }, { subject: "OBS" }, { body: "orange.com" }] };
    const uids = ((await client.search(criteria, { uid: true })) || [])
      .filter((u) => fresh || u > (state.lastUid ?? 0));

    const emails: IncomingEmail[] = [];
    let maxUid = state.lastUid ?? 0;
    if (uids.length) {
      for await (const msg of client.fetch(uids, { uid: true, source: true }, { uid: true })) {
        maxUid = Math.max(maxUid, msg.uid);
        if (!msg.source) continue;
        const parsed = await simpleParser(msg.source);
        emails.push({
          subject:   parsed.subject ?? "",
          from:      parsed.from?.value?.[0]?.address ?? parsed.from?.text ?? "",
          date:      (parsed.date ?? new Date()).toISOString(),
          messageId: parsed.messageId ?? `uid-${validity}-${msg.uid}`,
          text:      parsed.text ?? "",
          uid:       msg.uid,
        });
      }
    }
    emails.sort((a, b) => a.date.localeCompare(b.date)); // dispatch before updates
    return { emails, scanned: uids.length, validity, maxUid, prevUid: state.lastUid ?? 0 };
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
}
