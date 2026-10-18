"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Task } from "@/lib/store";
import { useStore } from "@/lib/storeContext";
import { useShell, type JobView } from "@/components/shell";
import { Icons } from "@/components/icons";
import { PageHeader, Segmented, Stat, StatStrip, cx, toneText } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { MailBanner, MailButtons, useMailActions } from "@/components/mail";
import { StageTracker } from "@/components/workflow";
import { headline, stages } from "@/lib/workflow";
import { fmtUSD, taskValue, timeAgo } from "@/lib/analytics";


const isOpen = (t: Task) => !["approved", "cancelled", "rejected"].includes(t.status);
const awaitingClosure = (t: Task) =>
  ["assigned", "accepted", "in_progress"].includes(t.status) && !!t.scheduledAt && new Date(t.scheduledAt).getTime() < Date.now();

const isLate = (t: Task) => isOpen(t) && stages(t).some((s) => s.state === "late");
const needsPricingCheck = (t: Task) => t.status !== "cancelled" && !!t.pricingBasis?.some((b) => /default|not in the|verify/i.test(b));

const MATCH: Record<JobView, (t: Task) => boolean> = {
  all: () => true,
  open: isOpen,
  closure: awaitingClosure,
  late: isLate,
  cleared: (t) => t.status === "completed",
  pricing: needsPricingCheck,
  billed: (t) => t.status === "approved",
  cancelled: (t) => t.status === "cancelled",
};

function lastUpdate(t: Task) {
  const e = t.emailLog?.[t.emailLog.length - 1];
  if (!e) return { at: t.createdAt, text: "Created" };
  return { at: e.at, text: e.kind === "dispatch" ? "Dispatch received" : e.kind === "photo" ? "Photo uploaded" : "Cleared by Orange" };
}

export default function JobsPage() {
  const router = useRouter();
  const { tasks, refresh } = useStore();
  const { query, setQuery, jobView: view, setJobView: setView } = useShell();
  const mail = useMailActions(refresh);

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    return tasks.filter((t) => MATCH[view](t) && (!q || [t.title, t.id, t.workOrder ?? "", t.endCustomer ?? "", t.siteId ?? "", t.location]
      .some((v) => v.toLowerCase().includes(q))));
  }, [tasks, view, query]);

  const open = tasks.filter(isOpen);
  const billed = tasks.filter((t) => t.status === "approved");
  const closure = tasks.filter(awaitingClosure);
  const late = tasks.filter(isLate);

  const columns: Column<Task>[] = [
    { key: "wo", header: "Work order", sort: (t) => t.openedAt ?? t.createdAt,
      render: (t) => (
        <div className="min-w-[200px] max-w-[320px]">
          <p className="flex items-center gap-2">
            <span className="font-mono text-[13px] font-semibold text-fg">{t.workOrder ?? t.id}</span>
            {t.workOrder && <span className="font-mono text-2xs text-fg-faint">{t.id}</span>}
          </p>
          <p className="mt-0.5 truncate text-xs text-fg-muted">{t.title}</p>
          <p className="truncate text-2xs text-fg-subtle">{t.siteId ?? t.location}</p>
        </div>
      ) },
    { key: "progress", header: "Progress", sort: (t) => stages(t).filter((s) => s.state === "done").length,
      render: (t) => <StageTracker task={t} size="compact" /> },
    { key: "status", header: "Where it stands",
      render: (t) => {
        const h = headline(t);
        return <span className={cx("whitespace-nowrap text-xs font-medium", toneText(h.tone))}>{h.text}</span>;
      } },
    { key: "update", header: "Last update", sort: (t) => lastUpdate(t).at, className: "hidden lg:table-cell",
      render: (t) => {
        const u = lastUpdate(t);
        return <span className="whitespace-nowrap text-xs text-fg-subtle">{u.text} <span className="text-fg-faint">· {timeAgo(new Date(u.at).getTime())}</span></span>;
      } },
    { key: "amount", header: "Amount", align: "right", sort: (t) => t.customerChargeUSD ?? taskValue(t),
      render: (t) => t.customerChargeUSD != null
        ? <span className="num font-medium text-fg">{fmtUSD(t.customerChargeUSD)}</span>
        : <span className="num text-xs text-fg-faint" title="Estimate at current pricing; final on closure">~{fmtUSD(taskValue(t))}</span> },
    { key: "go", header: <span className="sr-only">Open</span>, align: "right",
      render: (t) => (
        <Link href={`/admin/jobs/${t.id}`} onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-xs font-medium text-fg-muted hover:bg-white/5 hover:text-fg">
          Track<Icons.ChevronR size={12} />
        </Link>
      ) },
  ];

  // Extra views appear only when they have something in them (or are selected)
  const views = ([
    { value: "open", label: "Open" },
    { value: "late", label: "Engineer late", optional: true },
    { value: "closure", label: "Awaiting closure" },
    { value: "cleared", label: "Cleared, not billed", optional: true },
    { value: "pricing", label: "Pricing to check", optional: true },
    { value: "billed", label: "Billed" },
    { value: "cancelled", label: "Cancelled" },
    { value: "all", label: "All" },
  ] as { value: JobView; label: string; optional?: boolean }[])
    .map((v) => ({ ...v, n: tasks.filter(MATCH[v.value]).length }))
    .filter((v) => !v.optional || v.n > 0 || v.value === view);

  return (
    <div>
      <PageHeader title="Work orders" subtitle="Every Orange Business work order, tracked from its emails"
        actions={<MailButtons actions={mail} />} />
      <MailBanner actions={mail} />

      <StatStrip>
        <Stat label="Open" value={open.length} foot={`${fmtUSD(open.reduce((s, t) => s + taskValue(t), 0))} in progress`} accent={open.length > 0} />
        <Stat label="Awaiting closure" value={closure.length} foot="Visit time passed, not cleared" />
        <Stat label="Late arrivals" value={late.length} foot="Engineer not on site in time" />
        <Stat label="Billed" value={billed.length} foot={`${fmtUSD(billed.reduce((s, t) => s + (t.customerChargeUSD ?? 0), 0))} total`} />
      </StatStrip>

      <section className="overflow-hidden rounded-xl border border-line bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-3.5 sm:px-5">
          <div className="scroll-thin -mx-1 max-w-full overflow-x-auto px-1">
            <Segmented<JobView> label="Work order view" value={view} onChange={setView}
              options={views.map((v) => ({ value: v.value, label: <span className="flex items-center gap-1.5 whitespace-nowrap">{v.label}<span className="num text-fg-faint">{v.n}</span></span> }))} />
          </div>
          <div className="relative w-full sm:w-64">
            <Icons.Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-faint" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Work order, customer, site…" aria-label="Search work orders"
              className="h-8 w-full rounded-lg bg-canvas pl-8 pr-3 text-[13px] text-fg placeholder:text-fg-faint ring-1 ring-inset ring-line-strong focus:outline-none focus:ring-2 focus:ring-brand/70" />
          </div>
        </div>
        <DataTable rows={rows} columns={columns} rowKey={(t) => t.id} pageSize={15}
          onRowClick={(t) => router.push(`/admin/jobs/${t.id}`)}
          initialSort={{ key: "wo", dir: "desc" }}
          empty={
            <div className="flex flex-col items-center gap-2 text-fg-subtle">
              <Icons.Inbox size={22} className="text-fg-faint" />
              <p className="text-[13px]">{tasks.length ? "No work orders in this view" : "No work orders yet"}</p>
              {!tasks.length && <p className="text-xs">Sync the inbox or upload Orange emails on the <Link href="/admin/inbox" className="text-brand-soft hover:text-brand">Inbox</Link> page.</p>}
              {query && <button onClick={() => setQuery("")} className="text-xs font-medium text-brand-soft hover:text-brand">Clear search</button>}
            </div>
          } />
      </section>
    </div>
  );
}
