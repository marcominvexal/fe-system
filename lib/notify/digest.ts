/**
 * /lib/notify/digest.ts — Server-side only. The morning email: what happened
 * in the last 24 hours, what needs someone's attention, where the money
 * stands, and whether the inbox sync is healthy.
 */
import type { Task } from "@/lib/store";
import { listTasks } from "@/lib/repo";
import { listInvoices, listPayouts, unbilled } from "@/lib/billing";
import { readMailLog } from "@/lib/email/log";
import { readState } from "@/lib/email/imap";
import { getInsights } from "@/lib/insightsServer";
import { attention } from "@/lib/analytics";
import { appUrl } from "./mailer";

const DAY = 86_400_000;
const STALE_SYNC_HOURS = 2;

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const ts = (iso?: string) => (iso ? new Date(iso).getTime() : NaN);
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const latest = (...xs: (string | null | undefined)[]) =>
  xs.filter((x): x is string => !!x).sort().at(-1) ?? null;
const woLabel = (t: Task) => (t.workOrder ? `WO ${t.workOrder}` : t.id);

export interface DigestData {
  date: string;
  last24: { emails: number; newJobs: Task[]; cleared: Task[]; billedValue: number };
  attention: { label: string; count: number; href: string }[];
  findings: { title: string; severity: string; href?: string; amount?: number }[];
  money: { readyToInvoice: number; readyCount: number; outstanding: number; overdue: number; overdueCount: number; owedToPartners: number };
  sync: { lastOk: string | null; stale: boolean; failures: number; lastError: string | null };
}

export async function buildDigest(now = Date.now()): Promise<DigestData> {
  const since = now - DAY;
  const [tasks, invoices, payouts, mail, insights, ready, syncState] = await Promise.all([
    listTasks(), listInvoices(), listPayouts(), readMailLog(), getInsights(), unbilled(), readState(),
  ]);

  const newJobs = tasks.filter((t) => ts(t.createdAt) >= since);
  const cleared = tasks.filter((t) => t.emailLog?.some((e) => e.kind === "cleared" && ts(e.at) >= since));
  const billedValue = cleared.filter((t) => t.status === "approved").reduce((s, t) => s + (t.customerChargeUSD ?? 0), 0);
  const emails = mail.entries.filter((e) => ts(e.processedAt) >= since).length;

  const a = attention(tasks, now);
  const attn = [
    { label: "Engineers late to site", count: a.breached.length, href: "/admin#attention" },
    { label: "Visits awaiting Orange's closure", count: a.awaitingClosure.length, href: "/admin/jobs" },
    { label: "Cleared visits not billed", count: a.awaiting.length, href: "/admin/jobs" },
    { label: "Prices to check", count: a.pricingCheck.length, href: "/admin/insights" },
  ];

  const sent = invoices.filter((i) => i.status === "sent");
  const overdue = sent.filter((i) => i.dueAt && ts(i.dueAt) < now);
  const signed = (i: { kind: string; total: number }) => (i.kind === "credit" ? -Math.abs(i.total) : i.total);

  const syncRuns = mail.runs.filter((r) => r.source === "sync");
  // Runs that find no new mail are not logged, but they do move the sync position
  const lastOk = latest(syncState.lastRunAt, syncRuns.find((r) => !r.error)?.at);
  const recentFailures = syncRuns.filter((r) => r.error && ts(r.at) >= since);

  return {
    date: new Date(now).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Karachi" }),
    last24: { emails, newJobs, cleared, billedValue },
    attention: attn,
    findings: insights.findings
      .filter((f) => f.severity === "high" || f.severity === "medium")
      .slice(0, 6)
      .map((f) => ({ title: f.title, severity: f.severity, href: f.href, amount: f.amount })),
    money: {
      readyToInvoice: ready.reduce((s, t) => s + (t.customerChargeUSD ?? 0), 0),
      readyCount: ready.length,
      outstanding: sent.reduce((s, i) => s + signed(i), 0),
      overdue: overdue.reduce((s, i) => s + signed(i), 0),
      overdueCount: overdue.length,
      owedToPartners: payouts.filter((p) => p.status === "pending").reduce((s, p) => s + p.total, 0),
    },
    sync: {
      lastOk,
      stale: !lastOk || now - ts(lastOk) > STALE_SYNC_HOURS * 3_600_000,
      failures: recentFailures.length,
      lastError: recentFailures[0]?.error ?? null,
    },
  };
}

/** Subject line that says the most important thing first. */
export function digestSubject(d: DigestData): string {
  const issues = d.attention.reduce((s, x) => s + x.count, 0);
  const bits = [
    d.last24.newJobs.length ? `${d.last24.newJobs.length} new job${d.last24.newJobs.length === 1 ? "" : "s"}` : null,
    issues ? `${issues} need${issues === 1 ? "s" : ""} attention` : "nothing waiting",
    d.sync.stale || d.sync.failures ? "inbox sync needs a look" : null,
  ].filter(Boolean);
  return `FE digest · ${bits.join(" · ")}`;
}

// ── Rendering ────────────────────────────────────────────────────────────────
const C = { fg: "#1b1d22", muted: "#5d6270", faint: "#8a8f9b", line: "#e6e3de", tint: "#f6f4f1", orange: "#e86a00", ok: "#1f7a4d", crit: "#b3261e" };

export function digestHtml(d: DigestData): string {
  const base = appUrl();
  const link = (href: string, text: string) => `<a href="${base}${href}" style="color:${C.orange};text-decoration:none;font-weight:600">${text}</a>`;
  const h = (t: string) => `<tr><td style="padding:22px 0 8px;font:700 13px/1.3 Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:${C.faint}">${t}</td></tr>`;
  const stat = (label: string, value: string) =>
    `<td style="padding:12px 14px;border:1px solid ${C.line};background:#fff;width:25%"><div style="font:12px Arial,sans-serif;color:${C.faint}">${label}</div><div style="font:700 20px Arial,sans-serif;color:${C.fg};margin-top:4px">${value}</div></td>`;
  const row = (left: string, right: string, color = C.fg) =>
    `<tr><td style="padding:9px 0;border-bottom:1px solid ${C.line};font:14px Arial,sans-serif;color:${color}">${left}</td><td style="padding:9px 0;border-bottom:1px solid ${C.line};font:600 14px Arial,sans-serif;text-align:right;color:${color}">${right}</td></tr>`;

  const syncLine = d.sync.stale
    ? `<span style="color:${C.crit};font-weight:700">No successful sync ${d.sync.lastOk ? `since ${when(d.sync.lastOk)}` : "yet"}.</span> New Orange emails may be waiting. ${link("/admin/inbox", "Open the inbox")}`
    : `<span style="color:${C.ok};font-weight:700">Healthy.</span> Last successful sync ${when(d.sync.lastOk!)} (Pakistan time).`;
  const failLine = d.sync.failures
    ? `<div style="margin-top:6px;color:${C.crit}">${d.sync.failures} failed sync${d.sync.failures === 1 ? "" : "s"} in the last 24 hours. Last error: ${esc(d.sync.lastError ?? "")}</div>` : "";

  const newJobs = d.last24.newJobs.slice(0, 10).map((t) =>
    row(`${link(`/admin/jobs/${t.id}`, esc(woLabel(t)))} &nbsp;<span style="color:${C.muted}">${esc(t.endCustomer ?? t.title ?? "")}</span>`, esc(t.status === "approved" ? "Billed" : t.status === "in_progress" ? "On site" : t.status === "assigned" ? "Dispatched" : t.status))).join("");

  return `<!doctype html><html><body style="margin:0;background:${C.tint}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.tint}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px">
  <tr><td style="padding-bottom:4px;font:600 12px Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:${C.orange}">FE Management System · Orange Business</td></tr>
  <tr><td style="font:700 24px/1.25 Arial,sans-serif;color:${C.fg}">Daily digest</td></tr>
  <tr><td style="font:14px Arial,sans-serif;color:${C.muted};padding-top:4px">${esc(d.date)}</td></tr>

  ${h("Last 24 hours")}
  <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>
    ${stat("Emails read", String(d.last24.emails))}${stat("New jobs", String(d.last24.newJobs.length))}${stat("Visits cleared", String(d.last24.cleared.length))}${stat("Billed", usd(d.last24.billedValue))}
  </tr></table></td></tr>

  ${h("Needs attention")}
  <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    ${d.attention.map((x) => row(x.count ? link(x.href, x.label) : x.label, String(x.count), x.count ? C.fg : C.faint)).join("")}
  </table></td></tr>
  ${d.findings.length ? `<tr><td style="padding-top:10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    ${d.findings.map((f) => row(`${f.severity === "high" ? `<span style="color:${C.crit};font-weight:700">High</span> · ` : ""}${f.href ? link(f.href, esc(f.title)) : esc(f.title)}`, f.amount ? usd(f.amount) : "")).join("")}
  </table></td></tr>` : ""}

  ${h("Money")}
  <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    ${row(`Ready to invoice (${d.money.readyCount} visit${d.money.readyCount === 1 ? "" : "s"})`, usd(d.money.readyToInvoice))}
    ${row("Invoiced, not yet paid", usd(d.money.outstanding))}
    ${row(`Overdue (${d.money.overdueCount} invoice${d.money.overdueCount === 1 ? "" : "s"})`, usd(d.money.overdue), d.money.overdueCount ? C.crit : C.faint)}
    ${row("Owed to engineer partners", usd(d.money.owedToPartners))}
  </table></td></tr>

  ${d.last24.newJobs.length ? `${h("New jobs")}<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${newJobs}</table></td></tr>` : ""}

  ${h("Inbox sync")}
  <tr><td style="font:14px/1.5 Arial,sans-serif;color:${C.fg}">${syncLine}${failLine}</td></tr>

  <tr><td style="padding-top:26px"><a href="${base}/admin" style="display:inline-block;background:#ff7900;color:#1a0d03;font:700 14px Arial,sans-serif;padding:11px 18px;border-radius:8px;text-decoration:none">Open the dashboard</a></td></tr>
  <tr><td style="padding-top:26px;font:12px Arial,sans-serif;color:${C.faint}">Sent every morning to admin and finance users. Powered by Exponentia Global · Made by Invexal</td></tr>
</table></td></tr></table></body></html>`;
}

export function digestText(d: DigestData): string {
  const lines = [
    `FE Management System · Daily digest · ${d.date}`, "",
    `Last 24 hours: ${d.last24.emails} emails read, ${d.last24.newJobs.length} new jobs, ${d.last24.cleared.length} visits cleared, ${usd(d.last24.billedValue)} billed.`, "",
    "Needs attention:", ...d.attention.map((x) => `  ${x.count}  ${x.label}`),
    ...d.findings.map((f) => `  - ${f.title}${f.amount ? ` (${usd(f.amount)})` : ""}`), "",
    `Ready to invoice: ${usd(d.money.readyToInvoice)} (${d.money.readyCount} visits)`,
    `Invoiced, not yet paid: ${usd(d.money.outstanding)}`,
    `Overdue: ${usd(d.money.overdue)} (${d.money.overdueCount} invoices)`,
    `Owed to engineer partners: ${usd(d.money.owedToPartners)}`, "",
    d.sync.stale ? `Inbox sync: no successful sync ${d.sync.lastOk ? `since ${when(d.sync.lastOk)}` : "yet"}.` : `Inbox sync: healthy, last success ${when(d.sync.lastOk!)}.`,
    d.sync.failures ? `${d.sync.failures} failed syncs in the last 24 hours. Last error: ${d.sync.lastError}` : "", "",
    `${appUrl()}/admin`,
  ];
  return lines.join("\n");
}
