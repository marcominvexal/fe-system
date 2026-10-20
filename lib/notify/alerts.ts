/**
 * /lib/notify/alerts.ts — Server-side only. Tells admins by email when the
 * scheduled inbox sync fails, at most once every 6 hours, and records when the
 * digest and alerts were last sent so the Inbox page can show it.
 */
import { getDb } from "@/lib/db/client";
import { alertRecipients, appUrl, canSend, sendMail } from "./mailer";

const ALERT_EVERY_HOURS = 6;

export interface NotifyState {
  digest?: { at: string; recipients: number; error?: string };
  alert?:  { at: string; error: string; recipients: number };
}

export async function readNotifyState(): Promise<NotifyState> {
  const db = await getDb();
  const [row] = await db.query<{ value: unknown }>("SELECT value FROM app_state WHERE key = 'notify'");
  const v = row?.value;
  return (typeof v === "string" ? JSON.parse(v) : v ?? {}) as NotifyState;
}

export async function writeNotifyState(patch: Partial<NotifyState>) {
  const db = await getDb();
  const next = { ...(await readNotifyState()), ...patch };
  await db.query(
    `INSERT INTO app_state (key, value) VALUES ('notify', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(next)],
  );
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Email admins that the inbox sync failed. Never throws: an alert must not break the sync's own response. */
export async function alertSyncFailure(error: string): Promise<void> {
  try {
    if (!canSend()) return;
    const state = await readNotifyState();
    if (state.alert && Date.now() - new Date(state.alert.at).getTime() < ALERT_EVERY_HOURS * 3_600_000) return;
    const to = await alertRecipients();
    if (!to.length) return;
    await sendMail({
      to,
      subject: "FE alert · Inbox sync failed",
      text: `The scheduled sync of the Orange inbox failed, so new work order emails may not be in the system yet.\n\nError: ${error}\n\nCheck the inbox page: ${appUrl()}/admin/inbox\n\nYou won't get another alert for ${ALERT_EVERY_HOURS} hours.`,
      html: `<div style="font:14px/1.55 Arial,sans-serif;color:#1b1d22;max-width:560px">
        <p style="font:700 18px Arial,sans-serif;margin:0 0 10px">Inbox sync failed</p>
        <p>The scheduled sync of the Orange inbox failed, so new work order emails may not be in the system yet.</p>
        <p style="background:#fbe7e5;color:#b3261e;padding:10px 12px;border-radius:6px">${esc(error)}</p>
        <p><a href="${appUrl()}/admin/inbox" style="color:#e86a00;font-weight:700">Open the inbox page</a> to see the sync history, or try <b>Sync inbox</b> there.</p>
        <p style="color:#8a8f9b;font-size:12px">You won't get another alert for ${ALERT_EVERY_HOURS} hours.</p></div>`,
    });
    await writeNotifyState({ alert: { at: new Date().toISOString(), error, recipients: to.length } });
  } catch (e) {
    console.error("Could not send the sync failure alert:", e);
  }
}
