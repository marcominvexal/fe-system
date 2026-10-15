import { NextRequest, NextResponse } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import { ingestEmail, type IngestOutcome, type IncomingEmail } from "@/lib/email/ingest";
import { fetchNewMail, mailConfig, readState } from "@/lib/email/imap";
import { recordBatch, recordFailedRun } from "@/lib/email/log";

export const runtime = "nodejs";
export const maxDuration = 60;

async function sync() {
  const cfg = mailConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: "Mailbox not configured. Set MAIL_USER and MAIL_APP_PASSWORD in the environment." },
      { status: 400 },
    );
  }
  try {
    const { emails, scanned } = await fetchNewMail(cfg);
    let tasks = readDb();
    const results: { mail: IncomingEmail; outcome: IngestOutcome }[] = [];
    for (const mail of emails) {
      const r = ingestEmail(tasks, mail);
      tasks = r.tasks;
      results.push({ mail, outcome: r.outcome });
    }
    const outcomes = results.map((r) => r.outcome);
    if (outcomes.some((o) => o.status === "created" || o.status === "updated")) writeDb(tasks);
    recordBatch("sync", results, scanned);
    return NextResponse.json({ scanned, outcomes, lastRunAt: readState().lastRunAt });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const auth = /auth|credentials|login/i.test(msg);
    const error = auth ? "The mailbox rejected the sign-in. Check MAIL_USER and the app password, and that IMAP is enabled." : msg;
    recordFailedRun("sync", error);
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
