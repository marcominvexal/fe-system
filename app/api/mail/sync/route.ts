import { NextRequest, NextResponse } from "next/server";
import { fetchNewMail, mailConfig, saveSyncPosition } from "@/lib/email/imap";
import { applyEmails } from "@/lib/email/persist";
import { recordFailedRun } from "@/lib/email/log";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Outcomes worth trying again on the next sync rather than skipping for good. */
const RETRY = /^(Skipped: AI limit|AI could not read|Mentions Orange field work, but AI reading is off)/;

async function sync() {
  const cfg = mailConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: "Mailbox not configured. Set MAIL_USER and MAIL_APP_PASSWORD in the environment." },
      { status: 400 },
    );
  }
  try {
    const { emails, scanned, validity, maxUid, prevUid } = await fetchNewMail(cfg);
    const { results, aiCalls } = await applyEmails(emails, "sync", scanned);

    // Stop just before the first email that should be retried next time
    const retryUids = results
      .filter((r) => r.outcome.status === "ignored" && RETRY.test(r.outcome.reason) && r.mail.uid)
      .map((r) => r.mail.uid!);
    const position = retryUids.length ? Math.max(prevUid, Math.min(...retryUids) - 1) : maxUid;
    await saveSyncPosition(validity, position);

    return NextResponse.json({ scanned, aiCalls, retryLater: retryUids.length, outcomes: results.map((r) => r.outcome) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const auth = /auth|credentials|login|invalid/i.test(msg);
    const error = auth ? "The mailbox rejected the sign-in. Check MAIL_USER and the app password, and that IMAP is enabled." : msg;
    await recordFailedRun("sync", error);
    return NextResponse.json({ error }, { status: auth ? 401 : 502 });
  }
}

// GET is for a scheduler (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`)
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return sync();
}

// POST is the "Sync inbox" button in the admin UI
export async function POST() {
  return sync();
}
