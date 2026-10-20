import { NextRequest, NextResponse } from "next/server";
import { buildDigest, digestHtml, digestSubject, digestText } from "@/lib/notify/digest";
import { canSend, digestRecipients, sendMail } from "@/lib/notify/mailer";
import { writeNotifyState } from "@/lib/notify/alerts";
import { loadPricing } from "@/lib/settings";
import { currentUser } from "@/lib/auth/current";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/digest
 *   from the scheduler (`Authorization: Bearer $CRON_SECRET`) → sends the daily digest
 *   ?preview=1 from a signed-in admin or finance user        → returns the email as a web page
 */
export async function GET(req: NextRequest) {
  await loadPricing();
  const secret = process.env.CRON_SECRET;
  const fromScheduler = !!secret && req.headers.get("authorization") === `Bearer ${secret}`;

  if (!fromScheduler) {
    if (!new URL(req.url).searchParams.has("preview") || !(await currentUser())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const d = await buildDigest();
    return new NextResponse(digestHtml(d), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  if (!canSend()) return NextResponse.json({ error: "Mailbox not configured, so the digest can't be sent." }, { status: 400 });
  const to = await digestRecipients();
  if (!to.length) return NextResponse.json({ sent: 0, note: "No active admin or finance users to send to." });
  const d = await buildDigest();
  try {
    await sendMail({ to, subject: digestSubject(d), html: digestHtml(d), text: digestText(d) });
    await writeNotifyState({ digest: { at: new Date().toISOString(), recipients: to.length } });
    return NextResponse.json({ sent: to.length });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await writeNotifyState({ digest: { at: new Date().toISOString(), recipients: 0, error } });
    return NextResponse.json({ error }, { status: 502 });
  }
}

/** POST /api/digest — sends today's digest to the signed-in person only (to check it looks right). */
export async function POST() {
  await loadPricing();
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  if (!canSend()) return NextResponse.json({ error: "Mailbox not configured, so the digest can't be sent." }, { status: 400 });
  const d = await buildDigest();
  try {
    await sendMail({ to: [me.email], subject: digestSubject(d), html: digestHtml(d), text: digestText(d) });
    return NextResponse.json({ sent: 1, to: me.email });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
