"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/storeContext";
import { fmtDate } from "@/lib/store";
import { useShell } from "@/components/shell";
import { Icons } from "@/components/icons";
import { Badge, PageHeader, Panel, Segmented, Stat, StatStrip, StatusBadge, cx, type Tone } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { MailBanner, MailButtons, MailDropZone, useMailActions } from "@/components/mail";
import { timeAgo } from "@/lib/analytics";
import type { MailLogEntry, MailOutcome, SyncRun } from "@/lib/email/log";

interface LogResponse {
  connection: { configured: boolean; user?: string; host?: string; folder?: string; lookbackDays?: number };
  state: { lastRunAt: string | null; lastUid: number | null };
  entries: MailLogEntry[];
  runs: SyncRun[];
}

const KIND: Record<string, { label: string; tone: Tone }> = {
  dispatch: { label: "Dispatch", tone: "info" },
  photo:    { label: "Photo", tone: "neutral" },
  cleared:  { label: "Cleared", tone: "ok" },
};

const OUTCOME: Record<MailOutcome, { label: string; tone: Tone }> = {
  created:   { label: "New job created", tone: "brand" },
  updated:   { label: "Job updated", tone: "ok" },
  duplicate: { label: "Duplicate", tone: "muted" },
  ignored:   { label: "Ignored", tone: "neutral" },
};

type Filter = "all" | MailOutcome;

const fmtShort = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function InboxPage() {
  const router = useRouter();
  const { tasks, refresh } = useStore();
  const { setQuery } = useShell();
  const [data, setData] = useState<LogResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    fetch("/api/mail/log", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: LogResponse) => { setData(d); setLoadError(false); })
      .catch(() => setLoadError(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  const mail = useMailActions(() => { load(); refresh(); });
  const entries = useMemo(() => data?.entries ?? [], [data]);
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const count = (o: MailOutcome) => entries.filter((e) => e.outcome === o).length;
  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return entries.filter((e) =>
      (filter === "all" || e.outcome === filter) &&
      (!q || [e.subject, e.from, e.workOrder ?? "", e.taskId ?? ""].some((v) => v.toLowerCase().includes(q))));
  }, [entries, filter, search]);

  const openJob = (taskId: string) => {
    setQuery(taskId);
    router.push("/admin#tasks");
  };

  const lastRun = data?.runs[0];
  const conn = data?.connection;

  const columns: Column<MailLogEntry>[] = [
    { key: "date", header: "Received", sort: (e) => e.date,
      render: (e) => <span className="num whitespace-nowrap text-xs text-fg-muted" title={fmtDate(e.date)}>{fmtShort(e.date)}</span> },
    { key: "email", header: "Email", sort: (e) => e.subject,
      render: (e) => (
        <div className="min-w-[200px] max-w-[420px]">
          <div className="flex items-center gap-2">
            {e.kind ? <Badge tone={KIND[e.kind].tone} dot={false}>{KIND[e.kind].label}</Badge> : <Badge tone="muted" dot={false}>Other</Badge>}
            <p className="truncate text-fg" title={e.subject}>{e.subject || "(no subject)"}</p>
          </div>
          <p className="mt-0.5 truncate text-2xs text-fg-subtle">
            {e.from}{e.seenCount > 1 && <span className="text-fg-faint"> · seen {e.seenCount}×</span>}
            <span className="text-fg-faint"> · via {e.source === "sync" ? "inbox sync" : "file import"}</span>
          </p>
        </div>
      ) },
    { key: "wo", header: "Work order", sort: (e) => e.workOrder ?? "", className: "hidden 2xl:table-cell",
      render: (e) => e.workOrder ? <span className="whitespace-nowrap font-mono text-xs text-fg">{e.workOrder}</span> : <span className="text-fg-faint">—</span> },
    { key: "result", header: "Result", sort: (e) => e.outcome,
      render: (e) => (
        <div className="min-w-[130px]">
          <Badge tone={OUTCOME[e.outcome].tone}>{OUTCOME[e.outcome].label}</Badge>
          {e.reason && e.outcome === "ignored" && <p className="mt-1 max-w-[220px] text-2xs text-fg-subtle">{reasonText(e.reason)}</p>}
        </div>
      ) },
    { key: "job", header: "Job", sort: (e) => e.taskId ?? "",
      render: (e) => {
        const t = e.taskId ? taskById.get(e.taskId) : undefined;
        if (!e.taskId) return <span className="text-fg-faint">—</span>;
        if (!t) return <span className="whitespace-nowrap font-mono text-xs text-fg-faint" title="This job was deleted">{e.taskId}</span>;
        return (
          <button onClick={() => openJob(t.id)} title="Open on the task board"
            className="group flex items-center gap-2 whitespace-nowrap rounded-md py-0.5 text-left">
            <span className="font-mono text-xs text-fg-muted group-hover:text-brand-soft">{t.id}</span>
            <span className="hidden xl:inline"><StatusBadge status={t.status} /></span>
            <Icons.ChevronR size={12} className="text-fg-faint group-hover:text-brand-soft" />
          </button>
        );
      } },
  ];

  return (
    <div>
      <PageHeader title="Orange inbox"
        subtitle={conn?.configured
          ? <>Reading <span className="text-fg-muted">{conn.user}</span> · {conn.folder} · {data?.state.lastRunAt ? `last sync ${timeAgo(new Date(data.state.lastRunAt).getTime())}` : "not synced yet"}</>
          : "Work order emails from Orange Business and what the system did with each one"}
        actions={<MailButtons actions={mail} />} />

      <MailBanner actions={mail} />

      {data && !conn?.configured && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-warn/30 bg-warn/[0.05] px-5 py-4">
          <Icons.Alert size={16} className="mt-0.5 shrink-0 text-[#f0bd6d]" />
          <div className="space-y-1 text-[13px] text-fg-muted">
            <p className="font-medium text-fg">Mailbox not connected</p>
            <p>Add <code className="rounded bg-raised px-1 font-mono text-xs text-fg">MAIL_USER</code> and <code className="rounded bg-raised px-1 font-mono text-xs text-fg">MAIL_APP_PASSWORD</code> to the environment and restart the app. For Gmail, turn on 2-Step Verification, create an app password and enable IMAP.</p>
            <p>Until then, drop saved Outlook <span className="text-fg">.msg</span> or <span className="text-fg">.eml</span> files below to create cases.</p>
          </div>
        </div>
      )}

      <MailDropZone actions={mail} />

      <StatStrip cols="sm:grid-cols-5">
        <Stat label="Emails processed" value={entries.length} foot={`${entries.filter((e) => e.seenCount > 1).length} read more than once`} />
        <Stat label="New jobs" value={count("created")} foot="Dispatch emails" accent={count("created") > 0} />
        <Stat label="Updates applied" value={count("updated")} foot="Photos and closures" />
        <Stat label="Ignored" value={count("ignored")} foot="Not a work order, or untrusted sender" />
        <Stat label="Last run" value={lastRun ? timeAgo(new Date(lastRun.at).getTime()) : "—"}
          foot={lastRun ? (lastRun.error ? <span className="text-[#f08a84]">Failed</span> : `${lastRun.scanned} email${lastRun.scanned === 1 ? "" : "s"} read`) : "No runs yet"} />
      </StatStrip>

      <div className="grid gap-4 min-[1800px]:grid-cols-12">
        <section className="min-w-0 overflow-hidden rounded-xl border border-line bg-panel min-[1800px]:col-span-9">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-3.5 sm:px-5">
            <div>
              <h2 className="text-[13px] font-semibold tracking-tight text-fg">Processed emails</h2>
              <p className="mt-0.5 text-2xs text-fg-subtle">Every Orange notification the system has read, newest first</p>
            </div>
            <div className="relative w-full sm:w-60">
              <Icons.Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-faint" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by subject, work order…" aria-label="Filter emails"
                className="h-8 w-full rounded-lg bg-canvas pl-8 pr-3 text-[13px] text-fg placeholder:text-fg-faint ring-1 ring-inset ring-line-strong focus:outline-none focus:ring-2 focus:ring-brand/70" />
            </div>
          </div>
          <div className="scroll-thin overflow-x-auto border-t border-line px-4 py-2.5 sm:px-5">
            <Segmented<Filter> label="Result filter" value={filter} onChange={setFilter}
              options={(["all", "created", "updated", "duplicate", "ignored"] as Filter[]).map((v) => ({
                value: v,
                label: <span className="flex items-center gap-1.5 whitespace-nowrap">
                  {v === "all" ? "All" : OUTCOME[v].label.replace(" created", "s").replace("Job updated", "Updates")}
                  <span className="num text-fg-faint">{v === "all" ? entries.length : count(v)}</span>
                </span>,
              }))} />
          </div>
          <DataTable rows={rows} columns={columns} rowKey={(e) => e.messageId} pageSize={15}
            initialSort={{ key: "date", dir: "desc" }}
            empty={
              <div className="flex flex-col items-center gap-2 text-fg-subtle">
                <Icons.Inbox size={22} className="text-fg-faint" />
                <p className="text-[13px]">{loadError ? "Could not load the email log." : entries.length ? "No emails match this filter" : "No emails processed yet"}</p>
                {!entries.length && !loadError && <p className="text-xs">Click Sync inbox, or import saved .eml files.</p>}
              </div>
            } />
        </section>

        <Panel className="min-[1800px]:col-span-3" title="Sync history" subtitle="Most recent first" bodyClass="pb-2">
          {data?.runs.length ? (
            <ol className="-mx-1">
              {data.runs.slice(0, 12).map((r) => (
                <li key={r.at} className="flex items-start gap-3 rounded-lg px-1 py-2">
                  <span className={cx("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                    r.error ? "bg-crit" : r.created || r.updated ? "bg-ok" : "bg-fg-faint")} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-fg">
                      {r.error ? "Sync failed" : r.source === "sync" ? "Inbox sync" : "File import"}
                    </p>
                    <p className="text-2xs text-fg-subtle">
                      {r.error ? <span className="text-[#f08a84]">{r.error}</span>
                        : [`${r.scanned} read`, r.created && `${r.created} new`, r.updated && `${r.updated} updated`, r.duplicates && `${r.duplicates} duplicate`, r.ignored && `${r.ignored} ignored`]
                            .filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span className="num shrink-0 text-2xs text-fg-faint" title={fmtDate(r.at)}>{timeAgo(new Date(r.at).getTime())}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="px-1 py-6 text-center text-xs text-fg-subtle">No sync runs yet</p>
          )}
        </Panel>
      </div>
    </div>
  );
}

function reasonText(reason: string) {
  if (reason.startsWith("sender")) return `Sender not trusted (${reason.replace(/^sender (.+) not allowed$/, "$1")})`;
  if (reason.includes("not an OBS")) return "Not an Orange work order notification";
  return reason;
}
