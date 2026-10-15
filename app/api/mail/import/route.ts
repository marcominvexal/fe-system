import { NextRequest, NextResponse } from "next/server";
import { simpleParser } from "mailparser";
import MsgReader from "@kenjiuno/msgreader";
import { readDb, writeDb } from "@/lib/db";
import { ingestEmail, type IncomingEmail, type IngestOutcome } from "@/lib/email/ingest";
import { recordBatch } from "@/lib/email/log";

export const runtime = "nodejs";

/**
 * POST /api/mail/import — apply notifications without a mailbox connection.
 * Accepts either raw .eml files (multipart field "files") or JSON
 * `IncomingEmail | IncomingEmail[]`. Useful for back-filling and testing.
 */
export async function POST(req: NextRequest) {
  const emails: IncomingEmail[] = [];
  const failed: string[] = [];
  const type = req.headers.get("content-type") ?? "";

  if (type.includes("multipart/form-data")) {
    const form = await req.formData();
    for (const f of form.getAll("files")) {
      if (typeof f === "string") continue;
      const buf = Buffer.from(await f.arrayBuffer());
      try {
        emails.push(isOutlookMsg(f.name, buf) ? fromMsg(buf, f.name) : await fromEml(buf, f.name));
      } catch {
        failed.push(f.name);
      }
    }
  } else {
    const body = await req.json();
    emails.push(...(Array.isArray(body) ? body : [body]));
  }

  emails.sort((a, b) => a.date.localeCompare(b.date));
  let tasks = readDb();
  const results: { mail: IncomingEmail; outcome: IngestOutcome }[] = [];
  for (const mail of emails) {
    const r = ingestEmail(tasks, mail);
    tasks = r.tasks;
    results.push({ mail, outcome: r.outcome });
  }
  const outcomes = results.map((r) => r.outcome);
  if (outcomes.some((o) => o.status === "created" || o.status === "updated")) writeDb(tasks);
  if (results.length) recordBatch("import", results);
  if (!results.length && failed.length) {
    return NextResponse.json({ error: `Could not read ${failed.join(", ")}. Upload .eml or Outlook .msg files.` }, { status: 400 });
  }
  return NextResponse.json({ outcomes, failed });
}

// ── File readers ─────────────────────────────────────────────────────────────
/** Outlook .msg files are OLE compound documents (magic D0 CF 11 E0). */
function isOutlookMsg(name: string, buf: Buffer) {
  return /\.msg$/i.test(name) || buf.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));
}

function fromMsg(buf: Buffer, name: string): IncomingEmail {
  const d = new MsgReader(new DataView(buf.buffer, buf.byteOffset, buf.byteLength)).getFileData();
  if (d.error) throw new Error(d.error);
  const date = d.clientSubmitTime ?? d.messageDeliveryTime;
  return {
    subject:   d.subject ?? "",
    from:      d.senderSmtpAddress ?? d.senderEmail ?? "",
    date:      (date ? new Date(date) : new Date()).toISOString(),
    messageId: d.headers?.match(/^Message-ID:\s*(.+)$/im)?.[1]?.trim() ?? `${name}-${buf.length}`,
    text:      d.body ?? "",
  };
}

async function fromEml(buf: Buffer, name: string): Promise<IncomingEmail> {
  const parsed = await simpleParser(buf);
  return {
    subject:   parsed.subject ?? "",
    from:      parsed.from?.value?.[0]?.address ?? "",
    date:      (parsed.date ?? new Date()).toISOString(),
    messageId: parsed.messageId ?? `${name}-${buf.length}`,
    text:      parsed.text ?? "",
  };
}
