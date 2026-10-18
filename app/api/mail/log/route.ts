import { NextResponse } from "next/server";
import { readMailLog } from "@/lib/email/log";
import { mailConfig, readState } from "@/lib/email/imap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/mail/log — processed emails, sync runs and connection status (never the password). */
export async function GET() {
  const cfg = mailConfig();
  const state = readState();
  const { entries, runs } = readMailLog();
  return NextResponse.json({
    connection: cfg
      ? { configured: true, user: maskEmail(cfg.user), host: cfg.host, folder: cfg.folder, lookbackDays: cfg.lookbackDays }
      : { configured: false },
    state: { lastRunAt: state.lastRunAt ?? null, lastUid: state.lastUid ?? null },
    entries,
    runs,
  });
}

function maskEmail(e: string) {
  const [name, domain] = e.split("@");
  if (!domain) return e;
  return `${name.slice(0, 2)}${"•".repeat(Math.max(1, name.length - 2))}@${domain}`;
}
