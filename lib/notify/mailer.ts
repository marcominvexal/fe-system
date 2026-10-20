/**
 * /lib/notify/mailer.ts — Server-side only. Sends the system's own emails
 * (daily digest, failure alerts) from the same Gmail account the inbox is read
 * from, using its app password over SMTP.
 */
import nodemailer from "nodemailer";
import { mailConfig } from "@/lib/email/imap";
import { listUsers } from "@/lib/auth/users";

export interface Outgoing { to: string[]; subject: string; html: string; text: string }

export function canSend(): boolean {
  return !!mailConfig();
}

export async function sendMail(m: Outgoing): Promise<void> {
  const cfg = mailConfig();
  if (!cfg) throw new Error("Mailbox not configured, so the system can't send email.");
  if (!m.to.length) return;
  const transport = nodemailer.createTransport({
    host: process.env.MAIL_SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.MAIL_SMTP_PORT || 465),
    secure: true,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  await transport.sendMail({
    from: { name: "FE Management System", address: cfg.user },
    to: m.to,
    subject: m.subject,
    html: m.html,
    text: m.text,
  });
}

const list = (v?: string) => (v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

/** Digest goes to DIGEST_TO, or else every active admin and finance user. */
export async function digestRecipients(): Promise<string[]> {
  const env = list(process.env.DIGEST_TO);
  if (env.length) return env;
  return (await listUsers()).filter((u) => u.active && u.role !== "viewer").map((u) => u.email);
}

/** Alerts go to ALERT_TO, or else every active admin. */
export async function alertRecipients(): Promise<string[]> {
  const env = list(process.env.ALERT_TO);
  if (env.length) return env;
  return (await listUsers()).filter((u) => u.active && u.role === "admin").map((u) => u.email);
}

/** Public address of the app, for links in emails. */
export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}
