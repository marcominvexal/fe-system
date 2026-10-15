"use client";

import { useMemo, useState } from "react";
import { Task, TaskStatus, engineers, fmtDate, calcDuration, shortLabel } from "@/lib/store";
import { useStore } from "@/lib/storeContext";
import { useShell } from "@/components/shell";
import { Icons } from "@/components/icons";
import {
  Avatar, Badge, Button, Delta, Panel, Segmented, Select, StatusBadge, cx, statusTone, toneDot,
  useCountUp, STATUS_LABEL, type Tone,
} from "@/components/ui";
import { Bullet, CumulativeChart, DailyBars, Sparkline } from "@/components/charts";
import { DataTable, type Column } from "@/components/DataTable";
import {
  CancelModal, CreateTaskDrawer, DetailPanel, EditModal, PriorityTag, ReassignModal, SlaTag,
} from "@/components/tasks";
import {
  TARGETS, RANGE_DAYS, type RangeKey, summarize, pctChange, pipeline, attention,
  engineerStats, slaByTier, activity, slaState, taskValue, OPEN_STATUSES,
  fmtUSD, fmtPct, fmtHrs, timeAgo, type Activity,
} from "@/lib/analytics";

// Board views — quick drill-down presets layered on top of the status filter
type View = "all" | "open" | "awaiting" | "breached" | "at_risk" | "rejected" | "closed";
const VIEWS: { value: View; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "awaiting", label: "Awaiting approval" },
  { value: "breached", label: "SLA breached" },
  { value: "closed", label: "Closed" },
];
const matchView = (t: Task, v: View) => {
  switch (v) {
    case "open":     return OPEN_STATUSES.includes(t.status);
    case "awaiting": return t.status === "completed";
    case "breached": return (t.status === "assigned" || t.status === "accepted") && slaState(t) === "breached";
    case "at_risk":  return slaState(t) === "at_risk";
    case "rejected": return t.status === "rejected";
    case "closed":   return ["approved", "cancelled", "rejected"].includes(t.status);
    default:         return true;
  }
};

const fmtShort = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// ── KPI ───────────────────────────────────────────────────────────────────────
function Kpi({ label, value, format, delta, good = "up", prev, spark, target, status, foot }: {
  label: string; value: number; format: (n: number) => string;
  delta?: number | null; good?: "up" | "down"; prev?: string;
  spark?: number[]; target?: { label: string; progress: number | null };
  status?: { tone: Tone; label: string }; foot?: React.ReactNode;
}) {
  const shown = useCountUp(value);
  return (
    <div className="group relative flex min-w-0 flex-col bg-panel px-4 pb-3.5 pt-3.5 transition-colors duration-200 hover:bg-[#19191a] sm:px-5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-2xs font-medium uppercase tracking-[0.07em] text-fg-subtle">{label}</p>
        {status && (
          <span className="flex items-center gap-1 text-2xs text-fg-subtle" title={status.label}>
            <span className={cx("h-1.5 w-1.5 rounded-full", toneDot(status.tone))} /><span className="hidden sm:inline">{status.label}</span>
          </span>
        )}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="num text-[22px] font-semibold leading-none tracking-tight text-fg sm:text-[26px]">{format(shown)}</p>
        {spark && <Sparkline data={spark} className="mb-0.5 hidden max-w-[84px] sm:block" height={26} />}
      </div>
      {delta !== undefined && (
        <div className="mt-2.5 flex items-center gap-1.5 text-2xs">
          <Delta value={delta} good={good} />
          {prev && <span className="truncate text-fg-faint">vs {prev} prior</span>}
        </div>
      )}
      {target && (
        <div className="mt-3">
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${Math.min(100, (target.progress ?? 0) * 100)}%` }} />
          </div>
          <p className="mt-1.5 text-2xs text-fg-faint">{target.label}</p>
        </div>
      )}
      {foot && <div className="mt-3 text-2xs text-fg-subtle">{foot}</div>}
    </div>
  );
}

// ── Attention bar ─────────────────────────────────────────────────────────────
function AttentionItem({ tone, count, title, detail, action, onClick }: {
  tone: Tone; count: number; title: string; detail: string; action: string; onClick: () => void;
}) {
  const live = count > 0;
  return (
    <button onClick={onClick} disabled={!live}
      className={cx("group flex min-w-0 items-center gap-3 bg-panel px-4 py-3 text-left transition-colors duration-150 sm:px-5",
        live ? "hover:bg-[#1a1a1b]" : "cursor-default")}>
      <span className={cx("num grid h-8 min-w-8 place-items-center rounded-lg px-1.5 text-[15px] font-semibold",
        live ? (tone === "crit" ? "bg-crit/12 text-[#f08a84]" : tone === "warn" ? "bg-warn/12 text-[#f0bd6d]" : "bg-brand/12 text-brand-soft") : "bg-white/[0.04] text-fg-faint")}>
        {count}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx("block truncate text-[13px] font-medium", live ? "text-fg" : "text-fg-subtle")}>{title}</span>
        <span className="block truncate text-2xs text-fg-subtle">{detail}</span>
      </span>
      {live && (
        <span className="hidden items-center gap-0.5 text-2xs font-medium text-fg-subtle transition-colors group-hover:text-brand-soft sm:flex">
          {action}<Icons.ChevronR size={12} />
        </span>
      )}
    </button>
  );
}

const ACT: Record<Activity["kind"], { verb: string; tone: Tone }> = {
  created:   { verb: "Task created for",  tone: "neutral" },
  accepted:  { verb: "accepted",          tone: "info" },
  rejected:  { verb: "rejected",          tone: "crit" },
  checkin:   { verb: "checked in at",     tone: "brand" },
  checkout:  { verb: "completed",         tone: "warn" },
  cancelled: { verb: "Task cancelled for", tone: "muted" },
};

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { tasks, refresh } = useStore();
  const { query, setQuery, range, setRange } = useShell();

  // UI state
  const [selectedTask, setSelectedTask]     = useState<Task | null>(null);
  const [showForm, setShowForm]             = useState(false);
  const [cancelTarget, setCancelTarget]     = useState<Task | null>(null);
  const [editTarget, setEditTarget]         = useState<Task | null>(null);
  const [reassignTarget, setReassignTarget] = useState<Task | null>(null);
  const [trendMetric, setTrendMetric]       = useState<"revenue" | "visits">("revenue");

  // Filters
  const [view, setView]                     = useState<View>("all");
  const [statusFilter, setStatusFilter]     = useState<TaskStatus | "">("");
  const [engineerFilter, setEngineerFilter] = useState("");

  const days = RANGE_DAYS[range];
  const s     = useMemo(() => summarize(tasks, days), [tasks, days]);
  const att   = useMemo(() => attention(tasks), [tasks]);
  const pipe  = useMemo(() => pipeline(tasks), [tasks]);
  const engs  = useMemo(() => engineerStats(tasks, engineers, days).sort((a, b) => b.revenue - a.revenue), [tasks, days]);
  const tiers = useMemo(() => slaByTier(tasks, days), [tasks, days]);
  const feed  = useMemo(() => activity(tasks, 9), [tasks]);

  const revenueTarget = TARGETS.revenuePer30d * (days / 30);
  const onSite = new Set(tasks.filter((t) => t.status === "in_progress").map((t) => t.engineerId)).size;
  const openCnt = tasks.filter((t) => OPEN_STATUSES.includes(t.status)).length;
  const pipeValue = pipe.reduce((a, p) => a + p.value, 0);
  const pipeMax = Math.max(1, ...pipe.map((p) => p.count));
  const doneTasks = tasks.filter((t) => ["completed", "approved"].includes(t.status));
  const aiShare = doneTasks.length ? doneTasks.filter((t) => t.aiSummary).length / doneTasks.length : null;
  const margin = s.revenue > 0 ? s.profit / s.revenue : null;
  const slaTone: Tone = s.slaCompliance == null ? "muted" : s.slaCompliance >= TARGETS.slaCompliance ? "ok" : s.slaCompliance >= TARGETS.slaCompliance - 0.1 ? "warn" : "crit";

  // Filtered tasks (search comes from the top bar)
  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      const q = query.toLowerCase();
      const matchSearch = !q || (
        t.title.toLowerCase().includes(q) ||
        t.customer.toLowerCase().includes(q) ||
        t.engineerName.toLowerCase().includes(q) ||
        t.location.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q)
      );
      const matchStatus   = !statusFilter  || t.status === statusFilter;
      const matchEngineer = !engineerFilter || t.engineerId === engineerFilter;
      return matchSearch && matchStatus && matchEngineer && matchView(t, view);
    });
  }, [tasks, query, statusFilter, engineerFilter, view]);

  const drill = (v: View, opts?: { status?: TaskStatus; engineer?: string }) => {
    setView(v);
    setStatusFilter(opts?.status ?? "");
    setEngineerFilter(opts?.engineer ?? "");
    requestAnimationFrame(() => document.getElementById("tasks")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  // ── API actions (unchanged behaviour) ──
  const handleApprove = async (id: string) => {
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "approve" }),
    });
    const updated = await res.json() as Task;
    refresh();
    setSelectedTask(updated);
  };

  const handleCancel = async (id: string, cancelReason: string) => {
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "cancel", cancelReason }),
    });
    refresh();
    setSelectedTask(null);
  };

  const handleEdit = async (id: string, patch: Partial<Task>) => {
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    const updated = await res.json() as Task;
    refresh();
    setSelectedTask(updated);
  };

  const handleReassign = async (id: string, engineerId: string, engineerName: string) => {
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "reassign", engineerId, engineerName }),
    });
    const updated = await res.json() as Task;
    refresh();
    setSelectedTask(updated);
  };

  const filtersActive = query || statusFilter || engineerFilter || view !== "all";
  const clearFilters = () => { setQuery(""); setStatusFilter(""); setEngineerFilter(""); setView("all"); };

  // ── Task board columns ──
  const columns: Column<Task>[] = [
    {
      key: "task", header: "Task", sort: (t) => t.createdAt,
      render: (t) => (
        <div className="min-w-[170px] max-w-[230px] 2xl:max-w-[340px]">
          <p className="truncate font-medium text-fg">{t.title}</p>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-2xs text-fg-subtle">
            <span className="font-mono text-fg-faint">{t.id}</span><span className="text-fg-faint">·</span>{t.location}
          </p>
        </div>
      ),
    },
    { key: "priority", header: "Pri", width: "64px", sort: (t) => ({ "24x7 4h": 3, "8x5 4h": 2, "8x5 NBD": 1 }[t.serviceLevel]),
      render: (t) => <PriorityTag sl={t.serviceLevel} /> },
    {
      key: "engineer", header: "Engineer", sort: (t) => t.engineerName, className: "hidden md:table-cell",
      render: (t) => (
        <span className="flex items-center gap-2 whitespace-nowrap text-fg-muted">
          <Avatar name={t.engineerName} size={22} live={t.status === "in_progress"} />{t.engineerName}
        </span>
      ),
    },
    { key: "status", header: "Status", sort: (t) => STATUS_LABEL[t.status], render: (t) => <StatusBadge status={t.status} /> },
    { key: "sla", header: "SLA", className: "hidden lg:table-cell",
      sort: (t) => ({ breached: 0, at_risk: 1, on_track: 2, met: 3, "n/a": 4 }[slaState(t)]),
      render: (t) => <SlaTag task={t} /> },
    { key: "rule", header: "Rule", className: "hidden min-[1800px]:table-cell",
      render: (t) => <span className="whitespace-nowrap font-mono text-2xs text-fg-subtle">{shortLabel(t.ruleKey)}</span> },
    { key: "checkin", header: "Check in", sort: (t) => t.checkInTime ?? "", className: "hidden 2xl:table-cell",
      render: (t) => <span className="num whitespace-nowrap text-xs text-fg-subtle" title={t.checkInTime ? fmtDate(t.checkInTime) : undefined}>{t.checkInTime ? fmtShort(t.checkInTime) : "—"}</span> },
    { key: "duration", header: "Duration", className: "hidden 2xl:table-cell",
      render: (t) => <span className="num whitespace-nowrap text-xs text-fg-subtle">{t.duration || calcDuration(t.checkInTime, t.checkOutTime)}</span> },
    { key: "revenue", header: "Revenue", align: "right", sort: (t) => t.customerChargeUSD ?? -1,
      render: (t) => t.customerChargeUSD != null
        ? <span className="num font-medium text-fg">{fmtUSD(t.customerChargeUSD)}</span>
        : <span className="num text-xs text-fg-faint" title="Engine estimate — billed on approval">~{fmtUSD(taskValue(t))}</span> },
    { key: "profit", header: "Profit", align: "right", sort: (t) => t.profit ?? -1, className: "hidden 2xl:table-cell",
      render: (t) => t.profit != null ? <span className="num text-[#7bcfa2]">{fmtUSD(t.profit)}</span> : <span className="text-fg-faint">—</span> },
    {
      key: "action", header: <span className="sr-only">Action</span>, align: "right",
      render: (t) => (
        <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          {t.status === "completed" ? (
            <Button size="sm" variant="success" onClick={() => handleApprove(t.id)}>Approve</Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setSelectedTask(t)} aria-label={`View ${t.id}`}>
              View
            </Button>
          )}
        </span>
      ),
    },
  ];

  const prevLabel = (fmt: (n: number) => string, v: number | null) => (v == null || v === 0 ? undefined : fmt(v));
  const updated = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      {/* ── Header ── */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold leading-7 tracking-tight text-fg">Operations overview</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-fg-subtle">
            <span>Orange Business Pakistan · NOC field service</span>
            <span className="inline-flex items-center gap-1.5 text-2xs"><span className="h-1.5 w-1.5 rounded-full bg-ok shadow-[0_0_0_3px_rgb(70_179_123/0.15)]" />Live · updated {updated}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Segmented<RangeKey> label="Reporting period" value={range} onChange={setRange}
            options={[{ value: "7d", label: "7D" }, { value: "30d", label: "30D" }, { value: "90d", label: "90D" }]} />
          <Button variant="primary" onClick={() => setShowForm(true)}><Icons.Plus size={15} />Create task</Button>
        </div>
      </div>

      {/* ── Needs attention ── */}
      <section id="attention" aria-label="Needs attention" className="mb-4 scroll-mt-20 overflow-hidden rounded-xl border border-line">
        <div className="flex items-center justify-between border-b border-line bg-panel px-4 py-2 sm:px-5">
          <p className="flex items-center gap-2 text-2xs font-medium uppercase tracking-[0.08em] text-fg-subtle">
            <Icons.Alert size={12} className="text-brand" />Needs attention
          </p>
          <p className="num text-2xs text-fg-faint">{fmtUSD(att.awaitingValue)} unbilled pending approval</p>
        </div>
        <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-4">
          <AttentionItem tone="warn" count={att.awaiting.length} title="Awaiting approval"
            detail={att.awaiting.length ? `${fmtUSD(att.awaitingValue)} ready to invoice` : "Nothing to approve"}
            action="Review" onClick={() => drill("awaiting")} />
          <AttentionItem tone="crit" count={att.breached.length} title="Past SLA"
            detail={att.breached.length ? "Engineer not yet on site" : "All open tasks within SLA"}
            action="Escalate" onClick={() => drill("breached")} />
          <AttentionItem tone="warn" count={att.atRisk.length} title="Nearing SLA"
            detail={att.atRisk.length ? "Under 25% of window left" : "No tasks close to breach"}
            action="View" onClick={() => drill("at_risk")} />
          <AttentionItem tone="crit" count={att.rejected.length} title="Rejected"
            detail={att.rejected.length ? "Declined by engineer · reassign" : "No rejections"}
            action="Reassign" onClick={() => drill("rejected")} />
        </div>
      </section>

      {/* ── KPI strip ── */}
      <section aria-label="Key metrics" className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi label="Billed revenue" value={s.revenue} format={(n) => fmtUSD(n)}
          delta={pctChange(s.revenue, s.prevRevenue)} prev={prevLabel(fmtUSD, s.prevRevenue)} spark={s.dailyRevenue}
          target={{ label: `${fmtPct(revenueTarget ? s.revenue / revenueTarget : null)} of ${fmtUSD(revenueTarget)} target`, progress: s.revenue / revenueTarget }} />
        <Kpi label="Net profit" value={s.profit} format={(n) => fmtUSD(n)}
          delta={pctChange(s.profit, s.prevProfit)} prev={prevLabel(fmtUSD, s.prevProfit)}
          foot={<span className="flex justify-between"><span>Margin <span className="num text-fg-muted">{fmtPct(margin)}</span></span><span>FE pay <span className="num text-fg-muted">{fmtUSD(s.fePay)}</span></span></span>} />
        <Kpi label="Visits completed" value={s.completed} format={(n) => Math.round(n).toString()}
          delta={pctChange(s.completed, s.prevCompleted)} prev={s.prevCompleted ? String(s.prevCompleted) : undefined} spark={s.dailyCompleted} />
        <Kpi label="SLA compliance" value={(s.slaCompliance ?? 0) * 100} format={(n) => s.slaCompliance == null ? "—" : `${n.toFixed(1)}%`}
          delta={pctChange(s.slaCompliance, s.prevSla)} prev={s.prevSla != null ? fmtPct(s.prevSla, 1) : undefined}
          status={{ tone: slaTone, label: slaTone === "ok" ? "On target" : slaTone === "warn" ? "Below target" : slaTone === "crit" ? "Off target" : "No data" }}
          target={{ label: `Target ${fmtPct(TARGETS.slaCompliance)}`, progress: (s.slaCompliance ?? 0) / TARGETS.slaCompliance }} />
        <Kpi label="Avg response" value={s.avgResponse ?? 0} format={(n) => s.avgResponse == null ? "—" : fmtHrs(n)}
          delta={pctChange(s.avgResponse, s.prevAvgResponse)} good="down" prev={s.prevAvgResponse != null ? fmtHrs(s.prevAvgResponse) : undefined}
          status={s.avgResponse == null ? undefined : s.avgResponse <= TARGETS.avgResponseHrs ? { tone: "ok", label: `≤ ${TARGETS.avgResponseHrs}h` } : { tone: "warn", label: `> ${TARGETS.avgResponseHrs}h target` }}
          foot="Task creation → engineer check-in" />
        <Kpi label="Work in progress" value={openCnt} format={(n) => Math.round(n).toString()}
          foot={<span className="flex justify-between"><span><span className="num text-fg-muted">{onSite}</span> engineers on site</span><span className="num text-fg-muted">{fmtUSD(pipeValue)}</span></span>} />
      </section>

      {/* ── Trend + pipeline ── */}
      <div className="mb-4 grid gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-8"
          title={trendMetric === "revenue" ? "Revenue — actual vs prior period" : "Completed visits per day"}
          subtitle={trendMetric === "revenue"
            ? `Cumulative billed revenue, last ${days} days · dashed orange = run-rate projection (7-day avg)`
            : `Visits checked out per day, last ${days} days · dashed = prior period`}
          actions={<Segmented label="Trend metric" value={trendMetric} onChange={setTrendMetric}
            options={[{ value: "revenue", label: "Revenue" }, { value: "visits", label: "Visits" }]} />}>
          <div className="mb-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
            {trendMetric === "revenue" ? (<>
              <p className="num text-[22px] font-semibold tracking-tight text-fg">{fmtUSD(s.revenue)}</p>
              <p className="text-xs text-fg-subtle">prior <span className="num text-fg-muted">{fmtUSD(s.prevRevenue)}</span></p>
              <p className="text-xs text-fg-subtle">target <span className="num text-fg-muted">{fmtUSD(revenueTarget)}</span></p>
              <span className="ml-auto flex items-center gap-3 text-2xs text-fg-subtle">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-brand" />Actual</span>
                <span className="flex items-center gap-1.5"><span className="w-3 border-t border-dashed border-[#8b8b92]" />Prior</span>
                <span className="flex items-center gap-1.5"><span className="w-3 border-t border-[#a6a6ac]" />Target</span>
              </span>
            </>) : (<>
              <p className="num text-[22px] font-semibold tracking-tight text-fg">{s.completed}</p>
              <p className="text-xs text-fg-subtle">prior <span className="num text-fg-muted">{s.prevCompleted}</span></p>
            </>)}
          </div>
          {trendMetric === "revenue" ? (
            <CumulativeChart labels={s.dailyLabels} actual={s.dailyRevenue} previous={s.prevDailyRevenue}
              targetTotal={revenueTarget} projectDays={Math.max(2, Math.round(days / 5))} format={(n) => fmtUSD(n, true)} />
          ) : (
            <DailyBars labels={s.dailyLabels} current={s.dailyCompleted} previous={s.prevDailyCompleted} unit="visits" />
          )}
        </Panel>

        <Panel className="xl:col-span-4" title="Work pipeline" subtitle="Open tasks by stage · value at engine rates"
          actions={<span className="num text-[13px] font-semibold text-fg">{fmtUSD(pipeValue)}</span>}>
          <ul className="space-y-1">
            {pipe.map((p) => (
              <li key={p.status}>
                <button onClick={() => drill("all", { status: p.status })} disabled={!p.count}
                  className="group w-full rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.03] disabled:hover:bg-transparent">
                  <div className="mb-1.5 flex items-center justify-between text-[13px]">
                    <span className="flex items-center gap-2 text-fg-muted group-hover:text-fg">
                      <span className={cx("h-1.5 w-1.5 rounded-full", toneDot(statusTone(p.status)))} />{p.label}
                    </span>
                    <span className="num flex items-baseline gap-2">
                      <span className="text-2xs text-fg-subtle">{fmtUSD(p.value)}</span>
                      <span className="w-6 text-right font-semibold text-fg">{p.count}</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
                    <div className={cx("h-full rounded-full transition-[width] duration-500", p.status === "completed" ? "bg-warn" : p.status === "in_progress" ? "bg-brand" : "bg-fg-faint")}
                      style={{ width: `${(p.count / pipeMax) * 100}%` }} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line text-xs">
            <div className="bg-panel px-3 py-2.5">
              <p className="text-2xs text-fg-subtle">Engineers on site</p>
              <p className="num mt-0.5 text-[15px] font-semibold text-fg">{onSite}<span className="text-fg-faint"> / {engineers.length}</span></p>
            </div>
            <div className="bg-panel px-3 py-2.5">
              <p className="flex items-center gap-1 text-2xs text-fg-subtle"><Icons.Sparkle size={11} className="text-brand" />AI visit reports</p>
              <p className="num mt-0.5 text-[15px] font-semibold text-fg">{fmtPct(aiShare)}<span className="ml-1 text-2xs font-normal text-fg-faint">of completed</span></p>
            </div>
          </div>
        </Panel>
      </div>

      {/* ── Engineers · SLA tiers · activity ── */}
      <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-12">
        <Panel className="md:col-span-2 xl:col-span-5" title="Engineer performance" subtitle={`Last ${days} days · click to filter the task board`} bodyClass="pb-2">
          <div className="grid grid-cols-[minmax(0,1fr)_48px_72px_88px] items-center gap-3 border-y border-line bg-raised px-4 py-1.5 text-2xs font-medium uppercase tracking-[0.06em] text-fg-subtle sm:px-5">
            <span>Engineer</span><span className="text-right">Visits</span><span className="text-right">Revenue</span><span>SLA</span>
          </div>
          <ul>
            {engs.map((e) => (
              <li key={e.id}>
                <button onClick={() => drill("all", { engineer: e.id })}
                  className="grid w-full grid-cols-[minmax(0,1fr)_48px_72px_88px] items-center gap-3 border-b border-line/60 px-4 py-2.5 text-left text-[13px] transition-colors last:border-0 hover:bg-white/[0.025] sm:px-5">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={e.name} size={26} live={!!e.onSite} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-fg">{e.name}</span>
                      <span className="block truncate text-2xs text-fg-subtle">{e.onSite ? <span className="text-brand-soft">On site · {e.onSite.location.split(",").pop()?.trim()}</span> : `${e.open} open`}</span>
                    </span>
                  </span>
                  <span className="num text-right text-fg-muted">{e.visits}</span>
                  <span className="num text-right font-medium text-fg">{fmtUSD(e.revenue)}</span>
                  <span className="flex items-center gap-2">
                    <span className="flex-1"><Bullet value={e.sla} target={TARGETS.slaCompliance} tone={e.sla == null ? "brand" : e.sla >= TARGETS.slaCompliance ? "ok" : e.sla >= 0.85 ? "warn" : "crit"} /></span>
                    <span className="num w-8 text-right text-2xs text-fg-muted">{fmtPct(e.sla)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel className="xl:col-span-3" title="SLA by tier" subtitle={`Arrival within response window · target ${fmtPct(TARGETS.slaCompliance)}`}>
          <ul className="space-y-4 pt-1">
            {tiers.map((t) => {
              const tone = t.rate == null ? "brand" : t.rate >= TARGETS.slaCompliance ? "ok" : t.rate >= 0.85 ? "warn" : "crit";
              return (
                <li key={t.tier}>
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="flex items-center gap-2 text-[13px] font-medium text-fg">
                      <PriorityTag sl={t.tier} /><span>{t.tier}</span>
                    </span>
                    <span className={cx("num text-[13px] font-semibold", tone === "ok" ? "text-[#7bcfa2]" : tone === "warn" ? "text-[#f0bd6d]" : tone === "crit" ? "text-[#f08a84]" : "text-fg-faint")}>{fmtPct(t.rate, 1)}</span>
                  </div>
                  <Bullet value={t.rate} target={TARGETS.slaCompliance} tone={tone} />
                  <p className="num mt-1.5 flex justify-between text-2xs text-fg-subtle">
                    <span>{t.measured} visits measured</span><span>avg {fmtHrs(t.avg)} / {t.targetHrs}h window</span>
                  </p>
                </li>
              );
            })}
          </ul>
          {(() => {
            const measured = tiers.reduce((a, t) => a + t.measured, 0);
            const breaches = tiers.reduce((a, t) => a + Math.round(t.measured * (1 - (t.rate ?? 1))), 0);
            return (
              <div className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line text-center">
                {[
                  { l: "Measured", v: measured, c: "text-fg" },
                  { l: "Breaches", v: breaches, c: breaches ? "text-[#f08a84]" : "text-fg" },
                  { l: "Open late", v: att.breached.length, c: att.breached.length ? "text-[#f08a84]" : "text-fg" },
                ].map((b) => (
                  <div key={b.l} className="bg-panel px-2 py-2">
                    <p className={cx("num text-[15px] font-semibold", b.c)}>{b.v}</p>
                    <p className="text-2xs text-fg-subtle">{b.l}</p>
                  </div>
                ))}
              </div>
            );
          })()}
        </Panel>

        <Panel className="xl:col-span-4" title="Recent activity" subtitle="Latest field events" bodyClass="pb-2">
          <ol className="relative">
            {feed.map((ev, i) => (
              <li key={i}>
                <button onClick={() => setSelectedTask(ev.task)}
                  className="flex w-full items-start gap-3 rounded-lg px-4 py-2 text-left transition-colors hover:bg-white/[0.025] sm:px-5">
                  <span className={cx("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", toneDot(ACT[ev.kind].tone))} />
                  <span className="min-w-0 flex-1 text-[13px] leading-snug">
                    <span className="text-fg-muted">
                      {ev.kind === "created" || ev.kind === "cancelled"
                        ? <>{ACT[ev.kind].verb} <span className="text-fg">{ev.task.engineerName}</span></>
                        : <><span className="text-fg">{ev.task.engineerName}</span> {ACT[ev.kind].verb}</>}
                    </span>
                    <span className="mt-0.5 block truncate text-2xs text-fg-subtle"><span className="font-mono text-fg-faint">{ev.task.id}</span> · {ev.task.title}</span>
                  </span>
                  <span className="num shrink-0 pt-0.5 text-2xs text-fg-faint">{timeAgo(ev.at)}</span>
                </button>
              </li>
            ))}
            {feed.length === 0 && <li className="px-5 py-8 text-center text-xs text-fg-subtle">No activity yet</li>}
          </ol>
        </Panel>
      </div>

      {/* ── Task board ── */}
      <section id="tasks" aria-label="Task board" className="scroll-mt-20 overflow-hidden rounded-xl border border-line bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-3.5 sm:px-5">
          <div>
            <h2 className="text-[13px] font-semibold tracking-tight text-fg">Live task board</h2>
            <p className="mt-0.5 text-2xs text-fg-subtle">Select a row for full details, timeline and billing</p>
          </div>
          <div className="scroll-thin -mx-1 max-w-full overflow-x-auto px-1">
            <Segmented<View> label="Board view" value={VIEWS.some((v) => v.value === view) ? view : "all"} onChange={setView}
              options={VIEWS.map((v) => ({
                value: v.value,
                label: <span className="flex items-center gap-1.5 whitespace-nowrap">{v.label}<span className="num text-fg-faint">{tasks.filter((t) => matchView(t, v.value)).length}</span></span>,
              }))} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5 sm:px-5">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Icons.Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-faint" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by task, engineer, site, ID…" aria-label="Filter tasks"
              className="h-8 w-full rounded-lg bg-canvas pl-8 pr-3 text-[13px] text-fg placeholder:text-fg-faint ring-1 ring-inset ring-line-strong focus:outline-none focus:ring-2 focus:ring-brand/70" />
          </div>
          <Select aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TaskStatus | "")} className="w-[170px] [&_select]:h-8">
            <option value="">All statuses</option>
            {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((st) => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
          </Select>
          <Select aria-label="Engineer" value={engineerFilter} onChange={(e) => setEngineerFilter(e.target.value)} className="w-[170px] [&_select]:h-8">
            <option value="">All engineers</option>
            {engineers.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
          {view === "at_risk" || view === "rejected" ? <Badge tone="warn">{view === "at_risk" ? "Nearing SLA" : "Rejected"}</Badge> : null}
          {filtersActive && (
            <button onClick={clearFilters} className="text-xs font-medium text-brand-soft hover:text-brand">Clear filters</button>
          )}
          <span className="num ml-auto text-2xs text-fg-subtle">{filtered.length} of {tasks.length} tasks</span>
        </div>

        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={(t) => t.id}
          onRowClick={setSelectedTask}
          selectedKey={selectedTask?.id}
          initialSort={{ key: "task", dir: "desc" }}
          pageSize={12}
          empty={
            <div className="flex flex-col items-center gap-2 text-fg-subtle">
              <Icons.Search size={22} className="text-fg-faint" />
              <p className="text-[13px]">No tasks match your filters</p>
              {filtersActive && <button onClick={clearFilters} className="text-xs font-medium text-brand-soft hover:text-brand">Clear filters</button>}
            </div>
          }
          footer={
            <span className="num hidden text-2xs md:block">
              All-time billed <span className="font-medium text-fg-muted">{fmtUSD(tasks.filter((t) => t.status === "approved").reduce((a, t) => a + (t.customerChargeUSD ?? 0), 0))}</span>
              <span className="mx-2 text-fg-faint">·</span>
              profit <span className="font-medium text-[#7bcfa2]">{fmtUSD(tasks.filter((t) => t.status === "approved").reduce((a, t) => a + (t.profit ?? 0), 0))}</span>
            </span>
          }
        />
      </section>

      {/* ── Overlays ── */}
      {showForm && <CreateTaskDrawer onClose={() => setShowForm(false)} onCreated={refresh} />}

      {selectedTask && (
        <DetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onApprove={handleApprove}
          onCancelClick={() => setCancelTarget(selectedTask)}
          onEditClick={() => setEditTarget(selectedTask)}
          onReassignClick={() => setReassignTarget(selectedTask)}
        />
      )}
      {cancelTarget && <CancelModal task={cancelTarget} onCancel={handleCancel} onClose={() => setCancelTarget(null)} />}
      {editTarget && <EditModal task={editTarget} onSave={handleEdit} onClose={() => setEditTarget(null)} />}
      {reassignTarget && <ReassignModal task={reassignTarget} onReassign={handleReassign} onClose={() => setReassignTarget(null)} />}
    </div>
  );
}
