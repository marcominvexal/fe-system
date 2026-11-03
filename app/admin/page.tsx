"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { knownEngineer, type Task } from "@/lib/store";
import { useStore } from "@/lib/storeContext";
import { useShell, type JobView } from "@/components/shell";
import { Icons } from "@/components/icons";
import { Panel, cx } from "@/components/ui";
import { MailBanner, MailButtons, useMailActions } from "@/components/mail";
import { getPricing } from "@/lib/pricing";
import { cycleFor } from "@/lib/cycle";
import { cycleSummary, fmtDate, fmtDateTime, fmtPkr, plainStatus } from "@/lib/report";
import { attention, fmtUSD, OPEN_STATUSES } from "@/lib/analytics";
import { stages } from "@/lib/workflow";
import { needsReview } from "@/lib/confidence";

/** One big, plain figure. */
function Figure({ label, value, children, tone }: {
  label: string; value: React.ReactNode; children?: React.ReactNode; tone?: "alert" | "brand";
}) {
  return (
    <div className={cx("min-w-0 border-t-4 bg-panel px-5 pb-5 pt-4",
      tone === "alert" ? "border-crit" : tone === "brand" ? "border-brand" : "border-black")}>
      <p className="text-[13px] font-bold text-fg">{label}</p>
      <p className="num mt-2 text-[34px] font-bold leading-none tracking-tight text-fg">{value}</p>
      {children && <div className="mt-3 text-[13px] leading-relaxed text-fg-subtle">{children}</div>}
    </div>
  );
}

function Progress({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="mt-3 h-2 w-full overflow-hidden bg-black/[0.08]" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className="h-full bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** A plain sentence about something that needs doing, with the button that does it. */
function Todo({ count, text, action, onClick, urgent }: {
  count: number; text: string; action: string; onClick: () => void; urgent?: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-5 py-3.5 last:border-0">
      <span className={cx("num grid h-9 min-w-9 place-items-center px-2 text-[16px] font-bold",
        urgent ? "bg-crit text-white" : "bg-brand text-black")}>{count}</span>
      <p className="min-w-0 flex-1 text-[15px] text-fg">{text}</p>
      <button onClick={onClick}
        className="inline-flex h-9 items-center gap-1 border border-black px-3.5 text-[13px] font-bold text-black transition-colors hover:bg-black hover:text-white">
        {action}<Icons.ChevronR size={14} />
      </button>
    </li>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function DashboardPage() {
  const router = useRouter();
  const { tasks, refresh } = useStore();
  const { setJobView } = useShell();
  const mail = useMailActions(refresh);
  const [now] = useState(() => Date.now()); // when this view was loaded

  const contract = getPricing().contract;
  const cycle = useMemo(() => cycleFor(now, contract?.cycleStartDay ?? 25), [now, contract?.cycleStartDay]);
  const s = useMemo(() => cycleSummary(tasks, cycle, contract ?? null), [tasks, cycle, contract]);
  const att = useMemo(() => attention(tasks), [tasks]);

  const open = tasks.filter((t) => OPEN_STATUSES.includes(t.status) && t.status !== "completed")
    .sort((a, b) => (a.scheduledAt ?? a.createdAt).localeCompare(b.scheduledAt ?? b.createdAt));
  const isLate = (t: Task) => stages(t).some((x) => x.state === "late");
  const onSite = open.filter((t) => t.status === "in_progress").length;
  const late = open.filter(isLate).length;
  const noName = tasks.filter((t) => t.status !== "cancelled" && !knownEngineer(t)).length;
  const review = tasks.filter(needsReview).length;
  const daysLeft = Math.max(0, Math.ceil((new Date(`${cycle.end}T23:59:59+05:00`).getTime() - now) / 86_400_000));

  const goJobs = (v: JobView) => { setJobView(v); router.push("/admin/jobs"); };
  const todos = [
    { count: late, text: `${late === 1 ? "An engineer is" : `${late} engineers are`} late to site.`, action: "See who", urgent: true, go: () => goJobs("late") },
    { count: att.awaiting.length, text: `${plural(att.awaiting.length, "visit")} finished but the price is not confirmed yet.`, action: "Confirm prices", go: () => goJobs("cleared") },
    { count: review, text: `${plural(review, "price")} may be wrong and should be checked before invoicing.`, action: "Check prices", go: () => router.push("/admin/insights") },
    { count: noName, text: `${plural(noName, "job")} ${noName === 1 ? "has" : "have"} no engineer name yet.`, action: "Add names", go: () => goJobs("noname") },
    { count: att.awaitingClosure.length, text: `${plural(att.awaitingClosure.length, "visit")} should be finished but Orange has not closed ${att.awaitingClosure.length === 1 ? "it" : "them"} yet.`, action: "View", go: () => goJobs("closure") },
  ].filter((x) => x.count > 0);

  const recent = [...s.visits].reverse().slice(0, 8);
  const visitOf = (t: Task) => s.visits.find((v) => v.task.id === t.id);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-fg">Dashboard</h1>
          <p className="mt-1 text-[15px] text-fg-subtle">
            Billing cycle <span className="font-bold text-fg">{cycle.name}</span> · {cycle.range} · {plural(daysLeft, "day")} left
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/reports"
            className="inline-flex h-9 items-center gap-1.5 border border-black bg-white px-3.5 text-[13px] font-bold text-black transition-colors hover:bg-black hover:text-white">
            <Icons.Download size={14} />Reports
          </Link>
          <MailButtons actions={mail} />
        </div>
      </div>

      <MailBanner actions={mail} />

      {/* The four numbers that matter */}
      <section aria-label="This billing cycle" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Figure label="Visits this cycle" value={<>{s.done}<span className="text-[20px] text-fg-faint"> of {s.committed}</span></>} tone="brand">
          <Progress value={s.done} max={s.committed} />
          <p className="mt-2">In-city {s.inCity.done} of {s.inCity.committed} · Intercity {s.interCity.done} of {s.interCity.committed}</p>
          {s.inCity.extra + s.interCity.extra > 0 && (
            <p className="font-bold text-fg">{plural(s.inCity.extra + s.interCity.extra, "extra visit")} beyond the commitment</p>
          )}
        </Figure>
        <Figure label="To bill so far" value={fmtUSD(s.total)}>
          <p>Monthly charge {fmtUSD(s.mrc)}{s.extras > 0 && <> + extra visits {fmtUSD(s.extras)}</>}{s.hotel > 0 && <> + hotel {fmtUSD(s.hotel)}</>}</p>
          <p className="font-bold text-fg">{fmtPkr(s.totalPkr)}</p>
        </Figure>
        <Figure label="Jobs in progress" value={open.length}>
          <p>{plural(onSite, "engineer")} on site now · {open.length - onSite} booked</p>
        </Figure>
        <Figure label="Needs your attention" value={todos.reduce((n, x) => n + x.count, 0)} tone={todos.length ? "alert" : undefined}>
          <p>{todos.length ? "See the list below." : "Nothing to do right now."}</p>
        </Figure>
      </section>

      {/* What to do */}
      <Panel title="What needs your attention" className="mb-6" bodyClass="p-0">
        {todos.length ? (
          <ul>{todos.map((x) => <Todo key={x.text} count={x.count} text={x.text} action={x.action} onClick={x.go} urgent={x.urgent} />)}</ul>
        ) : (
          <p className="flex items-center gap-2 px-5 py-5 text-[15px] text-fg"><Icons.Check size={18} className="text-ok-fg" />All caught up. New Orange emails are read automatically throughout the day.</p>
        )}
      </Panel>

      <div className="grid gap-6 2xl:grid-cols-2">
        <Panel title="Jobs in progress" subtitle="Soonest first"
          actions={<Link href="/admin/jobs" onClick={() => setJobView("open")} className="text-[13px] font-bold text-brand-soft hover:underline">All work orders</Link>}
          bodyClass="p-0">
          <JobTable rows={open.slice(0, 8)} empty="No jobs in progress. New dispatches from Orange appear here."
            cols={[
              { head: "Booked for", cell: (t) => t.scheduledAt ? fmtDateTime(t.scheduledAt) : "Not set" },
              { head: "Status", cell: (t) => isLate(t)
                ? <span className="font-bold text-crit-fg">Engineer late</span>
                : <span className="text-fg-muted">{plainStatus(t)}</span> },
            ]} />
        </Panel>

        <Panel title="Finished this cycle" subtitle={`${plural(s.done, "visit")} closed by Orange since ${fmtDate(`${cycle.start}T12:00:00+05:00`)}`}
          actions={<Link href="/admin/reports" className="text-[13px] font-bold text-brand-soft hover:underline">Cycle report</Link>}
          bodyClass="p-0">
          <JobTable rows={recent.map((v) => v.task)} empty="No visits finished in this cycle yet."
            cols={[
              { head: "Finished", cell: (t) => fmtDate(visitOf(t)?.cleared) },
              { head: "Billing", cell: (t) => {
                const v = visitOf(t);
                if (!v) return null;
                return v.included ? <span className="text-fg-muted">Included</span> : <span className="font-bold text-fg">Extra · {fmtUSD(v.charge)}</span>;
              } },
            ]} />
        </Panel>
      </div>
    </div>
  );
}

/** Simple job table: work order, customer and site, engineer, plus page-specific columns. */
function JobTable({ rows, cols, empty }: {
  rows: Task[]; empty: string;
  cols: { head: string; cell: (t: Task) => React.ReactNode }[];
}) {
  const router = useRouter();
  if (!rows.length) return <p className="px-5 py-8 text-center text-[14px] text-fg-subtle">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[14px]">
        <thead>
          <tr className="border-b border-line text-[12px] font-bold text-fg-subtle">
            <th className="px-5 py-2.5">Work order</th>
            <th className="px-3 py-2.5">Engineer</th>
            {cols.map((c) => <th key={c.head} className="px-3 py-2.5 last:pr-5">{c.head}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const name = knownEngineer(t);
            return (
              <tr key={t.id} onClick={() => router.push(`/admin/jobs/${t.id}`)}
                className="cursor-pointer border-b border-line align-top transition-colors last:border-0 hover:bg-hover">
                <td className="px-5 py-3">
                  <p className="font-bold text-fg">{t.workOrder ?? t.id}</p>
                  <p className="max-w-[380px] truncate text-[12px] text-fg-subtle">{t.endCustomer ?? t.title}{t.siteId ? ` · ${t.siteId}` : ""}</p>
                </td>
                <td className="px-3 py-3">{name ? <span className="block max-w-[260px] truncate text-fg" title={name}>{name}</span> : <span className="whitespace-nowrap text-warn-fg">Not received</span>}</td>
                {cols.map((c) => <td key={c.head} className="whitespace-nowrap px-3 py-3 last:pr-5">{c.cell(t)}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
