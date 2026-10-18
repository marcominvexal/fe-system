"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Task } from "@/lib/store";
import { useStore } from "@/lib/storeContext";
import { useShell, type JobView } from "@/components/shell";
import { Icons } from "@/components/icons";
import { Delta, Panel, Segmented, cx, statusTone, toneDot, toneText, useCountUp, type Tone } from "@/components/ui";
import { Bullet, CumulativeChart, DailyBars, Sparkline } from "@/components/charts";
import { PriorityTag } from "@/components/tasks";
import { MailBanner, MailButtons, useMailActions } from "@/components/mail";
import { StageTracker } from "@/components/workflow";
import { headline, stages, timeline, type EventKind } from "@/lib/workflow";
import { needsReview } from "@/lib/confidence";
import {
  TARGETS, RANGE_DAYS, type RangeKey, summarize, pctChange, pipeline, attention,
  slaByTier, OPEN_STATUSES, fmtUSD, fmtPct, fmtHrs, timeAgo,
} from "@/lib/analytics";

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
        <span className="hidden items-center gap-0.5 text-2xs font-medium text-fg-subtle transition-colors group-hover:text-brand-soft sm:flex xl:hidden 2xl:flex">
          {action}<Icons.ChevronR size={12} />
        </span>
      )}
    </button>
  );
}

const EVENT_DOT: Record<EventKind, string> = {
  email: "bg-info", site: "bg-brand", billing: "bg-ok", plan: "bg-fg-subtle", cancel: "bg-crit",
};

// ── Page ──────────────────────────────────────────────────────────────────────
export default function OverviewPage() {
  const router = useRouter();
  const { tasks, refresh } = useStore();
  const { range, setRange, setJobView } = useShell();
  const mail = useMailActions(refresh);
  const [trendMetric, setTrendMetric] = useState<"revenue" | "visits">("revenue");

  const days  = RANGE_DAYS[range];
  const s     = useMemo(() => summarize(tasks, days), [tasks, days]);
  const att   = useMemo(() => attention(tasks), [tasks]);
  const pipe  = useMemo(() => pipeline(tasks), [tasks]);
  const tiers = useMemo(() => slaByTier(tasks, days), [tasks, days]);

  const open = tasks.filter((t) => OPEN_STATUSES.includes(t.status));
  const active = [...open].sort((a, b) => (a.scheduledAt ?? a.createdAt).localeCompare(b.scheduledAt ?? b.createdAt)).slice(0, 6);
  const revenueTarget = TARGETS.revenuePer30d * (days / 30);
  const pipeValue = pipe.reduce((a, p) => a + p.value, 0);
  const pipeMax = Math.max(1, ...pipe.map((p) => p.count));
  const margin = s.revenue > 0 ? s.profit / s.revenue : null;
  const slaTone: Tone = s.slaCompliance == null ? "muted" : s.slaCompliance >= TARGETS.slaCompliance ? "ok" : s.slaCompliance >= TARGETS.slaCompliance - 0.1 ? "warn" : "crit";
  const late = open.filter((t) => stages(t).some((x) => x.state === "late")).length;
  const reviewCount = tasks.filter(needsReview).length;

  // Latest workflow events across all work orders
  const feed = useMemo(() => tasks
    .flatMap((t) => timeline(t).filter((e) => !e.future).map((e) => ({ ...e, task: t })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 9), [tasks]);

  const goJobs = (v: JobView) => { setJobView(v); router.push("/admin/jobs"); };
  const prevLabel = (fmt: (n: number) => string, v: number | null) => (v == null || v === 0 ? undefined : fmt(v));
  const updated = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      {/* ── Header ── */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold leading-7 tracking-tight text-fg">Overview</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-fg-subtle">
            <span>Orange Business work orders, tracked and billed from email</span>
            <span className="inline-flex items-center gap-1.5 text-2xs"><span className="h-1.5 w-1.5 rounded-full bg-ok shadow-[0_0_0_3px_rgb(70_179_123/0.15)]" />Updated {updated}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Segmented<RangeKey> label="Reporting period" value={range} onChange={setRange}
            options={[{ value: "7d", label: "7D" }, { value: "30d", label: "30D" }, { value: "90d", label: "90D" }]} />
          <MailButtons actions={mail} />
        </div>
      </div>

      <MailBanner actions={mail} />

      {/* ── Needs attention ── */}
      <section id="attention" aria-label="Needs attention" className="mb-4 scroll-mt-20 overflow-hidden rounded-xl border border-line">
        <div className="flex items-center justify-between border-b border-line bg-panel px-4 py-2 sm:px-5">
          <p className="flex items-center gap-2 text-2xs font-medium uppercase tracking-[0.08em] text-fg-subtle">
            <Icons.Alert size={12} className="text-brand" />Needs attention
          </p>
          <p className="num text-2xs text-fg-faint">{fmtUSD(att.awaitingClosureValue)} waiting on Orange closure</p>
        </div>
        <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-4">
          <AttentionItem tone="crit" count={late} title="Engineer late"
            detail={late ? "Booked time passed, not on site" : "Every visit on time"}
            action="View" onClick={() => goJobs("late")} />
          <AttentionItem tone="brand" count={att.awaitingClosure.length} title="Awaiting closure"
            detail={att.awaitingClosure.length ? `${fmtUSD(att.awaitingClosureValue)} not yet cleared` : "All visits closed out"}
            action="View" onClick={() => goJobs("closure")} />
          <AttentionItem tone="warn" count={att.awaiting.length} title="Cleared, not billed"
            detail={att.awaiting.length ? `${fmtUSD(att.awaitingValue)} ready to bill` : "Everything cleared is billed"}
            action="Bill" onClick={() => goJobs("cleared")} />
          <AttentionItem tone="warn" count={reviewCount} title="Prices to review"
            detail={reviewCount ? "Low confidence, check before invoicing" : "Every billed price is confident"}
            action="Review" onClick={() => router.push("/admin/insights")} />
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
        <Kpi label="Visits cleared" value={s.completed} format={(n) => Math.round(n).toString()}
          delta={pctChange(s.completed, s.prevCompleted)} prev={s.prevCompleted ? String(s.prevCompleted) : undefined} spark={s.dailyCompleted} />
        <Kpi label="On-time arrival" value={(s.slaCompliance ?? 0) * 100} format={(n) => s.slaCompliance == null ? "—" : `${n.toFixed(1)}%`}
          delta={pctChange(s.slaCompliance, s.prevSla)} prev={s.prevSla != null ? fmtPct(s.prevSla, 1) : undefined}
          status={{ tone: slaTone, label: slaTone === "ok" ? "On target" : slaTone === "warn" ? "Below target" : slaTone === "crit" ? "Off target" : "No data" }}
          target={{ label: `Target ${fmtPct(TARGETS.slaCompliance)}`, progress: (s.slaCompliance ?? 0) / TARGETS.slaCompliance }} />
        <Kpi label="Arrival vs booking" value={s.avgResponse ?? 0} format={(n) => s.avgResponse == null ? "—" : fmtHrs(n)}
          delta={pctChange(s.avgResponse, s.prevAvgResponse)} good="down" prev={s.prevAvgResponse != null ? fmtHrs(s.prevAvgResponse) : undefined}
          foot="Average time from booked start to arrival" />
        <Kpi label="Open work orders" value={open.length} format={(n) => Math.round(n).toString()}
          foot={<span className="flex justify-between"><span>Estimated value</span><span className="num text-fg-muted">{fmtUSD(pipeValue)}</span></span>} />
      </section>

      {/* ── Trend + pipeline ── */}
      <div className="mb-4 grid gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-8"
          title={trendMetric === "revenue" ? "Billed revenue — actual vs prior period" : "Visits cleared per day"}
          subtitle={trendMetric === "revenue"
            ? `Cumulative, last ${days} days · dashed orange = run-rate projection (7-day avg)`
            : `Visits Orange cleared per day, last ${days} days · dashed = prior period`}
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

        <Panel className="xl:col-span-4" title="Work order pipeline" subtitle="Open work orders by stage · estimated value"
          actions={<span className="num text-[13px] font-semibold text-fg">{fmtUSD(pipeValue)}</span>}>
          <ul className="space-y-1">
            {pipe.map((p) => (
              <li key={p.status}>
                <button onClick={() => goJobs(p.status === "completed" ? "cleared" : "open")} disabled={!p.count}
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
          <Link href="/admin/jobs" onClick={() => setJobView("all")}
            className="mt-3 flex items-center justify-center gap-1 rounded-lg border border-line py-2 text-xs font-medium text-fg-muted transition-colors hover:bg-white/[0.03] hover:text-fg">
            All work orders<Icons.ChevronR size={12} />
          </Link>
        </Panel>
      </div>

      {/* ── Active work orders · SLA tiers · activity ── */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
        <Panel className="md:col-span-2 xl:col-span-5" title="Active work orders" subtitle="Soonest booked first · select one to track it" bodyClass="pb-2"
          actions={<Link href="/admin/jobs" onClick={() => setJobView("open")} className="text-xs font-medium text-brand-soft hover:text-brand">View all</Link>}>
          {active.length ? (
            <ul>
              {active.map((t: Task) => {
                const h = headline(t);
                return (
                  <li key={t.id}>
                    <Link href={`/admin/jobs/${t.id}`}
                      className="flex items-center gap-3 border-b border-line/60 px-4 py-2.5 transition-colors last:border-0 hover:bg-white/[0.025] sm:px-5">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-baseline gap-2">
                          <span className="font-mono text-[13px] font-semibold text-fg">{t.workOrder ?? t.id}</span>
                          <span className="truncate text-xs text-fg-subtle">{t.endCustomer ?? t.title}</span>
                        </p>
                        <p className={cx("mt-0.5 truncate text-2xs", toneText(h.tone))}>{h.text}</p>
                      </div>
                      <StageTracker task={t} size="compact" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-5 py-10 text-center">
              <p className="text-[13px] text-fg-muted">No open work orders</p>
              <p className="mt-1 text-xs text-fg-subtle">New dispatch emails appear here automatically.</p>
            </div>
          )}
        </Panel>

        <Panel className="xl:col-span-3" title="On-time arrival by SLA" subtitle={`Arrived within the booked window · target ${fmtPct(TARGETS.slaCompliance)}`}>
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
                  <p className="num mt-1.5 text-2xs text-fg-subtle">{t.measured} visit{t.measured === 1 ? "" : "s"} measured</p>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel className="xl:col-span-4" title="Latest updates" subtitle="From Orange's emails and on-site times" bodyClass="pb-2">
          <ol>
            {feed.map((ev, i) => (
              <li key={`${ev.task.id}-${ev.at}-${i}`}>
                <Link href={`/admin/jobs/${ev.task.id}`}
                  className="flex items-start gap-3 rounded-lg px-4 py-2 transition-colors hover:bg-white/[0.025] sm:px-5">
                  <span className={cx("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", EVENT_DOT[ev.kind])} />
                  <span className="min-w-0 flex-1 text-[13px] leading-snug">
                    <span className="text-fg">{ev.title}</span>
                    <span className="mt-0.5 block truncate text-2xs text-fg-subtle">
                      <span className="font-mono text-fg-faint">{ev.task.workOrder ?? ev.task.id}</span> · {ev.task.endCustomer ?? ev.task.title}
                    </span>
                  </span>
                  <span className="num shrink-0 pt-0.5 text-2xs text-fg-faint">{timeAgo(new Date(ev.at).getTime())}</span>
                </Link>
              </li>
            ))}
            {feed.length === 0 && <li className="px-5 py-8 text-center text-xs text-fg-subtle">No updates yet</li>}
          </ol>
        </Panel>
      </div>
    </div>
  );
}
