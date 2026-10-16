"use client";

import type { Task } from "@/lib/store";
import { stages, timeline, type Stage, type StageState, type EventKind } from "@/lib/workflow";
import { Icons } from "./icons";
import { cx } from "./ui";

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

const DOT: Record<StageState, string> = {
  done:      "bg-brand text-[#1a0d03] ring-brand",
  current:   "bg-panel text-brand-soft ring-brand",
  late:      "bg-panel text-[#f08a84] ring-crit",
  upcoming:  "bg-panel text-fg-faint ring-line-strong",
  skipped:   "bg-panel text-fg-faint ring-line-strong",
  cancelled: "bg-panel text-fg-faint ring-line",
};

function StageIcon({ s, size }: { s: Stage; size: number }) {
  if (s.state === "done") return <Icons.Check size={size} />;
  if (s.state === "late") return <Icons.Alert size={size} />;
  if (s.state === "cancelled") return <Icons.X size={size} />;
  if (s.state === "current") return <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />;
  return <span className="h-1 w-1 rounded-full bg-fg-faint" />;
}

/** Five-step progress: Dispatched → Booked → On site → Cleared → Billed. */
export function StageTracker({ task, size = "full" }: { task: Task; size?: "full" | "compact" }) {
  const list = stages(task);

  if (size === "compact") {
    const current = list.find((s) => s.state === "current" || s.state === "late");
    return (
      <div className="flex items-center gap-2" aria-label={`Progress: ${list.filter((s) => s.state === "done").map((s) => s.label).join(", ") || "not started"}`}>
        <div className="flex items-center">
          {list.map((s, i) => (
            <div key={s.key} className="flex items-center">
              {i > 0 && <span className={cx("h-px w-3", list[i - 1].state === "done" && (s.state === "done" || s.state === "skipped") ? "bg-brand" : "bg-line-strong")} />}
              <span title={`${s.label}${s.at ? ` · ${fmtWhen(s.at)}` : ""}`}
                className={cx("grid h-[14px] w-[14px] place-items-center rounded-full ring-1 ring-inset", DOT[s.state])}>
                <StageIcon s={s} size={9} />
              </span>
            </div>
          ))}
        </div>
        <span className={cx("whitespace-nowrap text-2xs", current?.state === "late" ? "text-[#f08a84]" : "text-fg-subtle")}>
          {task.status === "cancelled" ? "Cancelled" : current ? current.label : "Complete"}
        </span>
      </div>
    );
  }

  return (
    <ol className="grid grid-cols-5 gap-0">
      {list.map((s, i) => {
        const lineDone = i > 0 && list[i - 1].state === "done" && (s.state === "done" || s.state === "skipped");
        return (
          <li key={s.key} className="relative flex flex-col items-center px-1 text-center">
            {i > 0 && (
              <span aria-hidden="true" className={cx("absolute right-1/2 top-[14px] h-0.5 w-full",
                lineDone ? "bg-brand" : "bg-line-strong")} />
            )}
            <span className={cx("relative z-[1] grid h-[30px] w-[30px] place-items-center rounded-full ring-2 ring-inset transition-colors", DOT[s.state])}>
              <StageIcon s={s} size={15} />
            </span>
            <p className={cx("mt-2.5 text-[13px] font-medium",
              s.state === "done" ? "text-fg" : s.state === "late" ? "text-[#f08a84]" : s.state === "current" ? "text-brand-soft" : "text-fg-subtle")}>
              {s.label}
            </p>
            <p className="num mt-0.5 text-2xs text-fg-subtle">{s.at ? fmtWhen(s.at) : s.state === "skipped" ? "—" : s.state === "cancelled" ? "Cancelled" : "Pending"}</p>
            {s.detail && <p className="mt-0.5 hidden text-2xs text-fg-faint sm:block">{s.detail}</p>}
          </li>
        );
      })}
    </ol>
  );
}

const KIND_ICON: Record<EventKind, { icon: React.ReactNode; cls: string; label: string }> = {
  email:   { icon: <Icons.Mail size={13} />,    cls: "bg-info/12 text-[#8dbaf5]",     label: "Email" },
  site:    { icon: <Icons.MapPin size={13} />,  cls: "bg-brand/12 text-brand-soft",   label: "On site" },
  billing: { icon: <Icons.Invoice size={13} />, cls: "bg-ok/12 text-[#7bcfa2]",       label: "Billing" },
  plan:    { icon: <Icons.Calendar size={13} />, cls: "bg-white/[0.05] text-fg-muted", label: "Plan" },
  cancel:  { icon: <Icons.X size={13} />,       cls: "bg-crit/12 text-[#f08a84]",     label: "Cancelled" },
};

/** Everything that happened to the job, oldest first, grouped by day. */
export function JobTimeline({ task }: { task: Task }) {
  const events = timeline(task);
  const days: { day: string; items: typeof events }[] = [];
  for (const e of events) {
    const day = new Date(e.at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    const last = days[days.length - 1];
    if (last?.day === day) last.items.push(e); else days.push({ day, items: [e] });
  }
  if (!events.length) return <p className="py-6 text-center text-xs text-fg-subtle">No updates yet</p>;

  return (
    <div className="space-y-5">
      {days.map((d) => (
        <section key={d.day}>
          <p className="mb-2 text-2xs font-medium uppercase tracking-[0.08em] text-fg-subtle">{d.day}</p>
          <ol className="relative space-y-0.5 before:absolute before:bottom-3 before:left-[13px] before:top-3 before:w-px before:bg-line">
            {d.items.map((e, i) => {
              const k = KIND_ICON[e.kind];
              return (
                <li key={`${e.at}-${i}`} className={cx("relative flex gap-3 rounded-lg py-1.5 pr-2", e.future && "opacity-60")}>
                  <span className={cx("relative z-[1] grid h-[27px] w-[27px] shrink-0 place-items-center rounded-full ring-4 ring-panel", k.cls)} title={k.label}>
                    {k.icon}
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[13px] font-medium text-fg">{e.title}{e.future && <span className="ml-2 text-2xs font-normal text-fg-subtle">upcoming</span>}</p>
                      <span className="num shrink-0 text-xs text-fg-subtle">{fmtTime(e.at)}</span>
                    </div>
                    {e.detail && <p className="mt-0.5 truncate text-xs text-fg-subtle" title={e.detail}>{e.detail}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
