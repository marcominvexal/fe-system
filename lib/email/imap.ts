/**
 * /lib/email/imap.ts — Server-side only. Reads new Orange Business
 * notifications from the configured mailbox over IMAP (Gmail + app password
 * by default) and remembers the last UID it processed.
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { IncomingEmail } from "./ingest";

export interface MailConfig {
  host: string; port: number; user: string; pass: string; folder: string; lookbackDays: number;
}

export function mailConfig(): MailConfig | null {
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return {
    host: process.env.MAIL_IMAP_HOST || "imap.gmail.com",
    port: Number(process.env.MAIL_IMAP_PORT || 993),
    user,
    pass: pass.replace(/\s+/g, ""), // Gmail shows app passwords in groups of four
    folder: process.env.MAIL_FOLDER || "INBOX",
    lookbackDays: Number(process.env.MAIL_LOOKBACK_DAYS || 14),
  };
}

// ── Sync position (UID) — file locally, memory on read-only hosts ────────────
interface SyncState { uidValidity?: string; lastUid?: number; lastRunAt?: string }
const STATE_PATH = join(process.cwd(), "data", "mail-state.json");
let memState: SyncState | null = null;

export function readState(): SyncState {
  if (memState) return memState;
  try { return existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, "utf-8")) : {}; } catch { return {}; }
}
function writeState(s: SyncState) {
  try {
    mkdirSync(join(process.cwd(), "data"), { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
  } catch { memState = s; }
}

/** Fetch notifications that arrived since the last run (or the lookback window on first run). */
export async function fetchNewMail(cfg: MailConfig): Promise<{ emails: IncomingEmail[]; scanned: number }> {
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
    const state = readState();
    const fresh = !state.lastUid || state.uidValidity !== validity;

    const criteria = fresh
      ? { since: new Date(Date.now() - cfg.lookbackDays * 86_400_000) }
      : { uid: `${state.lastUid! + 1}:*` };
    const uids = ((await client.search({ ...criteria, or: [{ from: "orange.com" }, { subject: "Work Order" }] }, { uid: true })) || [])
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
        });
      }
    }
    writeState({ uidValidity: validity, lastUid: maxUid || state.lastUid, lastRunAt: new Date().toISOString() });
    emails.sort((a, b) => a.date.localeCompare(b.date)); // dispatch before updates
    return { emails, scanned: uids.length };
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
}
