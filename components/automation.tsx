"use client";

import { useState } from "react";
import type { SyncRun } from "@/lib/email/log";
import type { NotifyState } from "@/lib/notify/alerts";
import { useUser } from "@/lib/userContext";
import { Icons } from "./icons";
import { Button, cx } from "./ui";

export interface AutomationInfo {
  notify: NotifyState;
  digestRecipients: number;
  alertRecipients: number;
  /** CRON_SECRET is set, so the scheduler can run the sync */
  scheduled: boolean;
}

// The scheduler runs every 15 minutes; flag the sync once it has missed a few runs
const STALE_MINUTES = 45;

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};

function Item({ icon, title, state, tone, children }: {
  icon: React.ReactNode; title: string; state: string; tone: "ok" | "warn" | "crit" | "muted"; children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 bg-panel px-4 py-3.5 sm:px-5">
      <div className="flex items-center gap-2">
        <span className="text-fg-faint">{icon}</span>
        <p className="text-[13px] font-medium text-fg">{title}</p>
        <span className={cx("ml-auto flex items-center gap-1.5 text-2xs font-medium",
          tone === "ok" ? "text-[#7bcfa2]" : tone === "warn" ? "text-[#f0bd6d]" : tone === "crit" ? "text-[#f08a84]" : "text-fg-subtle")}>
          <span className={cx("h-1.5 w-1.5 rounded-full", tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : tone === "crit" ? "bg-crit" : "bg-fg-faint")} />
          {state}
        </span>
      </div>
      <div className="mt-1.5 space-y-1 text-2xs text-fg-subtle">{children}</div>
    </div>
  );
}

/** What runs on its own: the scheduled sync, the morning digest and failure alerts. */
export function AutomationStrip({ info, runs, lastRunAt }: { info: AutomationInfo; runs: SyncRun[]; lastRunAt: string | null }) {
  const { canEdit } = useUser();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now()); // when this view was loaded

  const syncs = runs.filter((r) => r.source === "sync");
  // Syncs that find no new mail are not logged as runs, but they do record lastRunAt
  const lastOkAt = [lastRunAt, syncs.find((r) => !r.error)?.at].filter((x): x is string => !!x).sort().at(-1);
  const lastOk = lastOkAt ? { at: lastOkAt } : undefined;
  const lastFail = syncs[0]?.error && (!lastOkAt || syncs[0].at > lastOkAt) ? syncs[0] : null;
  const stale = !lastOk || now - new Date(lastOk.at).getTime() > STALE_MINUTES * 60_000;
  const syncTone = !info.scheduled ? "muted" : lastFail ? "crit" : stale ? "warn" : "ok";
  const syncState = !info.scheduled ? "Not scheduled" : lastFail ? "Last run failed" : stale ? "Overdue" : "Running";

  const d = info.notify.digest;
  const digestTone = d?.error ? "crit" : info.digestRecipients ? "ok" : "warn";

  const emailMe = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/digest", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      setMsg(r.ok ? `Sent today's digest to ${j.to}.` : j.error ?? "Could not send the digest.");
    } finally { setBusy(false); }
  };

  return (
    <section aria-label="Automation" className="mb-5">
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3">
        <Item icon={<Icons.Refresh size={14} />} title="Scheduled inbox sync" state={syncState} tone={syncTone}>
          <p>{info.scheduled ? "Every 15 minutes, day and night." : "Set CRON_SECRET to let the scheduler run it."}</p>
          <p>{lastOk ? `Last success ${ago(lastOk.at)}.` : "No successful sync yet."}
            {lastFail && <span className="text-[#f08a84]"> Last error: {lastFail.error}</span>}</p>
        </Item>
        <Item icon={<Icons.Mail size={14} />} title="Daily digest" state={d?.error ? "Last send failed" : info.digestRecipients ? `${info.digestRecipients} recipient${info.digestRecipients === 1 ? "" : "s"}` : "No recipients"} tone={digestTone}>
          <p>Every morning around 08:00 Pakistan time, to admin and finance users.</p>
          <p>{d ? (d.error ? <span className="text-[#f08a84]">{d.error}</span> : `Last sent ${ago(d.at)} to ${d.recipients}.`) : "Not sent yet."}</p>
          {canEdit && (
            <div className="flex flex-wrap gap-2 pt-1.5">
              <a href="/api/digest?preview=1" target="_blank" rel="noreferrer"
                className="inline-flex h-7 items-center rounded-lg px-2.5 text-xs font-medium text-fg ring-1 ring-inset ring-line-strong hover:bg-hover">Preview</a>
              <Button size="sm" variant="ghost" onClick={emailMe} disabled={busy}>{busy ? "Sending…" : "Email me a copy"}</Button>
            </div>
          )}
          {msg && <p role="status" className="pt-1 text-fg-muted">{msg}</p>}
        </Item>
        <Item icon={<Icons.Alert size={14} />} title="Failure alerts" state={info.alertRecipients ? `${info.alertRecipients} admin${info.alertRecipients === 1 ? "" : "s"}` : "No admins"} tone={info.alertRecipients ? "ok" : "warn"}>
          <p>Admins get an email when a scheduled sync fails, at most once every 6 hours.</p>
          <p>{info.notify.alert ? `Last alert ${ago(info.notify.alert.at)}.` : "No alerts sent."}</p>
        </Item>
      </div>
    </section>
  );
}
