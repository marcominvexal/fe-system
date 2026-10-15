"use client";

import { useEffect, useRef, useState } from "react";
import type { TaskStatus } from "@/lib/store";
import { Icons } from "./icons";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ── Status vocabulary (shared by every page) ─────────────────────────────────
// Few hues: neutral for queued, blue for acknowledged, orange for live work,
// amber for "needs you", green for done, red for failure.
export const STATUS_LABEL: Record<TaskStatus, string> = {
  assigned:    "Assigned",
  accepted:    "Accepted",
  rejected:    "Rejected",
  in_progress: "In Progress",
  completed:   "Awaiting Approval",
  approved:    "Approved",
  cancelled:   "Cancelled",
};
const STATUS_TONE: Record<TaskStatus, Tone> = {
  assigned: "neutral", accepted: "info", in_progress: "brand",
  completed: "warn", approved: "ok", rejected: "crit", cancelled: "muted",
};

export type Tone = "neutral" | "muted" | "info" | "brand" | "warn" | "ok" | "crit";
const TONE: Record<Tone, { dot: string; text: string; bg: string }> = {
  neutral: { dot: "bg-fg-subtle", text: "text-fg-muted",   bg: "bg-white/[0.04] ring-white/10" },
  muted:   { dot: "bg-fg-faint",  text: "text-fg-subtle",  bg: "bg-white/[0.02] ring-white/[0.06]" },
  info:    { dot: "bg-info",      text: "text-[#8dbaf5]",  bg: "bg-info/10 ring-info/20" },
  brand:   { dot: "bg-brand",     text: "text-brand-soft", bg: "bg-brand/10 ring-brand/25" },
  warn:    { dot: "bg-warn",      text: "text-[#f0bd6d]",  bg: "bg-warn/10 ring-warn/20" },
  ok:      { dot: "bg-ok",        text: "text-[#7bcfa2]",  bg: "bg-ok/10 ring-ok/20" },
  crit:    { dot: "bg-crit",      text: "text-[#f08a84]",  bg: "bg-crit/10 ring-crit/20" },
};
export const toneText = (t: Tone) => TONE[t].text;
export const toneDot  = (t: Tone) => TONE[t].dot;

export function Badge({ tone = "neutral", children, dot = true, className }: {
  tone?: Tone; children: React.ReactNode; dot?: boolean; className?: string;
}) {
  const s = TONE[tone];
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-2xs font-medium ring-1 ring-inset whitespace-nowrap", s.bg, s.text, className)}>
      {dot && <span className={cx("h-1.5 w-1.5 rounded-full", s.dot)} />}
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}
export const statusTone = (s: TaskStatus) => STATUS_TONE[s];

// ── Surfaces ─────────────────────────────────────────────────────────────────
export function Panel({ title, subtitle, actions, children, className, bodyClass, id }: {
  title?: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode;
  children: React.ReactNode; className?: string; bodyClass?: string; id?: string;
}) {
  return (
    <section id={id} className={cx("rounded-xl border border-line bg-panel", className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-3 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-[13px] font-semibold tracking-tight text-fg">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-2xs text-fg-subtle">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClass ?? "px-4 pb-4 sm:px-5"}>{children}</div>
    </section>
  );
}

// ── Buttons ──────────────────────────────────────────────────────────────────
type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
const BTN: Record<BtnVariant, string> = {
  primary:   "bg-brand text-[#1a0d03] hover:bg-brand-soft shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]",
  secondary: "bg-raised text-fg ring-1 ring-inset ring-line-strong hover:bg-hover",
  ghost:     "text-fg-muted hover:text-fg hover:bg-white/5",
  danger:    "bg-crit/10 text-[#f08a84] ring-1 ring-inset ring-crit/25 hover:bg-crit/20",
  success:   "bg-ok text-[#04130b] hover:bg-[#58c48c]",
};
export function Button({ variant = "secondary", size = "md", className, ...p }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" }) {
  return (
    <button
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-[13px]",
        BTN[variant], className,
      )}
    />
  );
}

// ── Segmented control ────────────────────────────────────────────────────────
export function Segmented<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-canvas p-0.5 ring-1 ring-inset ring-line">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cx(
            "h-7 rounded-md px-2.5 text-xs font-medium transition-colors duration-150",
            value === o.value ? "bg-raised text-fg shadow-sm ring-1 ring-inset ring-line-strong" : "text-fg-subtle hover:text-fg",
          )}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Form controls ────────────────────────────────────────────────────────────
export const inputCls =
  "w-full h-9 rounded-lg bg-canvas px-3 text-[13px] text-fg placeholder:text-fg-faint ring-1 ring-inset ring-line-strong transition-shadow focus:outline-none focus:ring-2 focus:ring-brand/70";
export const textareaCls = inputCls.replace("h-9", "py-2 min-h-[84px] resize-none");
export const labelCls = "mb-1.5 block text-2xs font-medium uppercase tracking-[0.06em] text-fg-subtle";

export function Select({ className, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cx("relative", className)}>
      <select {...p} className={cx(inputCls, "appearance-none pr-8 cursor-pointer")}>{children}</select>
      <Icons.ChevronD size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
    </div>
  );
}

// ── Avatar ───────────────────────────────────────────────────────────────────
export const initials = (name: string) =>
  name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

export function Avatar({ name, size = 24, live }: { name: string; size?: number; live?: boolean }) {
  return (
    <span className="relative inline-flex shrink-0">
      <span style={{ width: size, height: size, fontSize: size * 0.4 }}
        className="inline-flex items-center justify-center rounded-full bg-raised font-semibold text-fg-muted ring-1 ring-inset ring-line-strong">
        {initials(name)}
      </span>
      {live && <span className="absolute -bottom-px -right-px h-2 w-2 rounded-full bg-brand ring-2 ring-panel" />}
    </span>
  );
}

// ── Delta chip ───────────────────────────────────────────────────────────────
/** `good` decides colour: for response time, down is good. */
export function Delta({ value, good = "up" }: { value: number | null; good?: "up" | "down" }) {
  if (value == null || !isFinite(value)) return <span className="text-2xs text-fg-faint">no prior data</span>;
  const up = value >= 0;
  const positive = good === "up" ? up : !up;
  const flat = Math.abs(value) < 0.005;
  return (
    <span className={cx("inline-flex items-center gap-0.5 text-2xs font-medium num",
      flat ? "text-fg-subtle" : positive ? "text-[#7bcfa2]" : "text-[#f08a84]")}>
      {!flat && (up ? <Icons.ArrowUp size={11} /> : <Icons.ArrowDn size={11} />)}
      {Math.abs(value * 100).toFixed(Math.abs(value) < 0.1 ? 1 : 0)}%
    </span>
  );
}

// ── Count-up for KPI transitions ─────────────────────────────────────────────
export function useCountUp(target: number, ms = 450) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setV(a + (target - a) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = target; };
  }, [target, ms]);
  return v;
}

// ── Overlays ─────────────────────────────────────────────────────────────────
/** Modals listen in the capture phase and stop the event, so Escape closes
 *  only the top-most layer (modal over drawer). */
function useEscape(onClose: () => void, top = false) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (top) e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", h, top);
    return () => window.removeEventListener("keydown", h, top);
  }, [onClose, top]);
}

export function Drawer({ onClose, children, width = "max-w-xl", label }: {
  onClose: () => void; children: React.ReactNode; width?: string; label: string;
}) {
  useEscape(onClose);
  return (
    <div className="admin-shell fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={label}>
      <div className="anim-fade absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cx("anim-slide relative flex h-full w-full flex-col border-l border-line bg-panel shadow-2xl", width)}>
        {children}
      </div>
    </div>
  );
}

export function Modal({ onClose, children, width = "max-w-md", label }: {
  onClose: () => void; children: React.ReactNode; width?: string; label: string;
}) {
  useEscape(onClose, true);
  return (
    <div className="admin-shell fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={label}>
      <div className="anim-fade absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={cx("anim-pop relative w-full rounded-xl border border-line-strong bg-raised p-5 shadow-2xl", width)}>
        {children}
      </div>
    </div>
  );
}

// ── Page header ──────────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle, actions }: {
  title: string; subtitle?: React.ReactNode; actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[20px] font-semibold leading-7 tracking-tight text-fg">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-fg-subtle">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Compact stat for secondary pages (label, value, footnote). */
export function Stat({ label, value, foot, accent }: {
  label: string; value: React.ReactNode; foot?: React.ReactNode; accent?: boolean;
}) {
  return (
    <div className="min-w-0 bg-panel px-4 py-3.5 sm:px-5">
      <p className="text-2xs font-medium uppercase tracking-[0.06em] text-fg-subtle">{label}</p>
      <p className={cx("num mt-1.5 text-[22px] font-semibold leading-none tracking-tight", accent ? "text-brand-soft" : "text-fg")}>{value}</p>
      {foot && <p className="mt-1.5 text-2xs text-fg-subtle">{foot}</p>}
    </div>
  );
}

export function StatStrip({ children, cols = "sm:grid-cols-4" }: { children: React.ReactNode; cols?: string }) {
  return (
    <div className={cx("mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line", cols)}>
      {children}
    </div>
  );
}
