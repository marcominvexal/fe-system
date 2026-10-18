"use client";

import { useStore } from "@/lib/storeContext";
import { engineers, TaskStatus } from "@/lib/store";
import { Avatar, Badge, Button, PageHeader, Stat, StatStrip, STATUS_LABEL, cx, statusTone, toneDot } from "@/components/ui";
import { Icons } from "@/components/icons";
import { fmtUSD, slaState } from "@/lib/analytics";

export default function EngineersPage() {
  const { tasks } = useStore();
  const onSite = new Set(tasks.filter((t) => t.status === "in_progress").map((t) => t.engineerId)).size;
  const fePay  = tasks.filter((t) => t.status === "approved").reduce((s, t) => s + (t.engineerPaymentUSD ?? 0), 0);

  return (
    <div>
      <PageHeader title="Engineer management" subtitle="Field engineer roster and performance"
        actions={<Button variant="primary"><Icons.Plus size={15} />Add engineer</Button>} />

      <StatStrip cols="sm:grid-cols-3">
        <Stat label="Total engineers" value={engineers.length} />
        <Stat label="Currently on site" value={onSite} foot={`${engineers.length - onSite} available`} accent={onSite > 0} />
        <Stat label="Total FE payments" value={fmtUSD(fePay)} foot="Approved visits" />
      </StatStrip>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {engineers.map((eng) => {
          const engTasks   = tasks.filter((t) => t.engineerId === eng.id);
          const active     = engTasks.filter((t) => t.status === "in_progress");
          const completed  = engTasks.filter((t) => ["completed", "approved"].includes(t.status));
          const totalPay   = engTasks.filter((t) => t.status === "approved").reduce((s, t) => s + (t.engineerPaymentUSD ?? 0), 0);
          const isOnSite   = active.length > 0;
          const measured   = engTasks.filter((t) => t.checkInTime);
          const slaRate    = measured.length ? measured.filter((t) => slaState(t) === "met").length / measured.length : null;

          // Group by status for the distribution bar
          const statusCounts = engTasks.reduce<Partial<Record<TaskStatus, number>>>((acc, t) => {
            acc[t.status] = (acc[t.status] ?? 0) + 1;
            return acc;
          }, {});
          const entries = (Object.entries(statusCounts) as [TaskStatus, number][]).sort(([, a], [, b]) => b - a);

          return (
            <article key={eng.id} className="flex flex-col rounded-xl border border-line bg-panel transition-colors duration-200 hover:border-line-strong">
              <div className="flex items-start justify-between gap-3 p-4 pb-3 sm:p-5 sm:pb-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={eng.name} size={40} live={isOnSite} />
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-fg">{eng.name}</p>
                    <p className="font-mono text-2xs text-fg-faint">ID {eng.id}</p>
                  </div>
                </div>
                {isOnSite ? <Badge tone="brand">On site</Badge> : <Badge tone="neutral">Available</Badge>}
              </div>

              <div className="mx-4 grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-line bg-line sm:mx-5">
                {[
                  { l: "Total", v: engTasks.length, c: "text-fg" },
                  { l: "Active", v: active.length, c: active.length ? "text-brand-soft" : "text-fg" },
                  { l: "Done", v: completed.length, c: "text-fg" },
                  { l: "SLA", v: slaRate == null ? "—" : `${Math.round(slaRate * 100)}%`, c: slaRate != null && slaRate < 0.95 ? "text-[#f0bd6d]" : "text-[#7bcfa2]" },
                ].map((s) => (
                  <div key={s.l} className="bg-panel px-2 py-2.5 text-center">
                    <p className={cx("num text-[17px] font-semibold leading-none", s.c)}>{s.v}</p>
                    <p className="mt-1.5 text-2xs text-fg-subtle">{s.l}</p>
                  </div>
                ))}
              </div>

              {entries.length > 0 && (
                <div className="px-4 pt-4 sm:px-5">
                  <div className="flex h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                    {entries.map(([status, count]) => (
                      <span key={status} className={toneDot(statusTone(status))} style={{ width: `${(count / engTasks.length) * 100}%` }} title={`${STATUS_LABEL[status]}: ${count}`} />
                    ))}
                  </div>
                  <ul className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1">
                    {entries.map(([status, count]) => (
                      <li key={status} className="flex items-center justify-between text-2xs">
                        <span className="flex items-center gap-1.5 text-fg-subtle"><span className={cx("h-1.5 w-1.5 rounded-full", toneDot(statusTone(status)))} />{STATUS_LABEL[status]}</span>
                        <span className="num font-medium text-fg-muted">{count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {isOnSite && active[0] && (
                <div className="mx-4 mt-4 rounded-lg border border-brand/20 bg-brand/[0.05] px-3 py-2 sm:mx-5">
                  <p className="text-2xs font-medium text-brand-soft">Currently working on</p>
                  <p className="mt-0.5 truncate text-xs text-fg">{active[0].title}</p>
                </div>
              )}

              <div className="min-h-4 flex-1" />
              <div className="flex items-center justify-between border-t border-line px-4 py-3 sm:px-5">
                <span className="text-2xs text-fg-subtle">Total payments</span>
                <span className="num text-[13px] font-semibold text-fg">{totalPay > 0 ? fmtUSD(totalPay) : "—"}</span>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
