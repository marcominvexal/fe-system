"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cx } from "./ui";

// Chart palette — read from the design tokens' literal values so SVG attrs work.
const C = {
  brand: "#f97316", brandSoft: "#fb923c", grid: "#26262a", axis: "#8b8b92",
  prev: "#6b6b72", target: "#a6a6ac",
};

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return m * p;
}

const fmtDay = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// ── Sparkline ────────────────────────────────────────────────────────────────
export function Sparkline({ data: raw, color = C.brand, height = 28, className }: {
  data: number[]; color?: string; height?: number; className?: string;
}) {
  const id = useId();
  const [ref, w] = useWidth<HTMLDivElement>();
  // Bucket long daily series so the sparkline shows trend, not noise
  const size = Math.ceil(raw.length / 14);
  const data: number[] = [];
  if (size <= 1) data.push(...raw);
  else for (let e = raw.length; e - size >= 0; e -= size) data.unshift(raw.slice(e - size, e).reduce((s, v) => s + v, 0));
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => [
    (i / Math.max(1, data.length - 1)) * w,
    height - 2 - (v / max) * (height - 4),
  ]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
  return (
    <div ref={ref} className={cx("w-full", className)} style={{ height }} aria-hidden="true">
      {w > 0 && (
        <svg width={w} height={height} className="overflow-visible">
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.22" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${line}L${w},${height}L0,${height}Z`} fill={`url(#${id})`} />
          <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
          {pts.length > 0 && <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.25" fill={color} />}
        </svg>
      )}
    </div>
  );
}

// ── Shared chart frame ───────────────────────────────────────────────────────
interface Row { label: string; value: string; swatch: React.ReactNode }

function Tooltip({ x, w, title, rows }: { x: number; w: number; title: string; rows: Row[] }) {
  const left = Math.min(Math.max(x + 12, 0), w - 188);
  const flip = x + 200 > w;
  return (
    <div className="pointer-events-none absolute top-1 z-10 w-[176px] rounded-lg border border-line-strong bg-raised/95 px-3 py-2 shadow-xl backdrop-blur-sm"
      style={{ left: flip ? Math.max(0, x - 188) : left }}>
      <p className="mb-1.5 text-2xs font-medium text-fg-subtle">{title}</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-3 py-0.5 text-xs">
          <span className="flex items-center gap-1.5 text-fg-muted">{r.swatch}{r.label}</span>
          <span className="num font-medium text-fg">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

const Sw = {
  area: <span className="h-2 w-2 rounded-sm bg-brand" />,
  dash: <span className="h-0 w-2.5 border-t border-dashed border-[#8b8b92]" />,
  line: <span className="h-0 w-2.5 border-t border-[#a6a6ac]" />,
  proj: <span className="h-0 w-2.5 border-t border-dashed border-brand-soft" />,
};

// ── Cumulative trend: actual vs previous period vs target pace + projection ──
export function CumulativeChart({ labels, actual, previous, targetTotal, projectDays, format, height = 248 }: {
  labels: number[]; actual: number[]; previous: number[];
  targetTotal?: number; projectDays: number; format: (n: number) => string; height?: number;
}) {
  const gid = useId();
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const n = actual.length;
  const cum = (a: number[]) => a.reduce<number[]>((o, v, i) => (o.push((o[i - 1] ?? 0) + v), o), []);
  const act = cum(actual);
  const prev = cum(previous);
  const last = act[n - 1] ?? 0;
  const trailing = actual.slice(-7);
  const rate = trailing.reduce((s, v) => s + v, 0) / Math.max(1, trailing.length);
  const total = n + projectDays;
  const proj = Array.from({ length: projectDays + 1 }, (_, k) => last + rate * k); // index n-1 .. n-1+projectDays
  const tgt = (i: number) => (targetTotal ?? 0) * ((i + 1) / n);

  const pl = 46, pr = 10, pt = 10, pb = 24;
  const iw = Math.max(1, w - pl - pr), ih = height - pt - pb;
  const yMax = niceMax(Math.max(last, prev[n - 1] ?? 0, targetTotal ? tgt(total - 1) : 0, proj[proj.length - 1]) * 1.04);
  const x = (i: number) => pl + (i / Math.max(1, total - 1)) * iw;
  const y = (v: number) => pt + ih - (v / yMax) * ih;
  const path = (vals: number[], off = 0) => vals.map((v, i) => `${i ? "L" : "M"}${x(i + off).toFixed(1)},${y(v).toFixed(1)}`).join("");

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  const step = Math.max(1, Math.round(total / 5));
  const DAY = 86_400_000;
  const labelAt = (i: number) => labels[0] + i * DAY;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - pl) / iw) * (total - 1));
    setHover(Math.max(0, Math.min(total - 1, i)));
  };

  const rows: Row[] = [];
  if (hover != null) {
    if (hover < n) rows.push({ label: "Actual", value: format(act[hover]), swatch: Sw.area });
    else rows.push({ label: "Projected", value: format(proj[hover - n + 1]), swatch: Sw.proj });
    if (hover < n) rows.push({ label: "Prior period", value: format(prev[hover]), swatch: Sw.dash });
    if (targetTotal) rows.push({ label: "Target pace", value: format(tgt(hover)), swatch: Sw.line });
  }

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {w > 0 && (
        <svg width={w} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img"
          aria-label={`Cumulative trend. Actual ${format(last)}, prior period ${format(prev[n - 1] ?? 0)}.`}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={C.brand} stopOpacity="0.28" />
              <stop offset="1" stopColor={C.brand} stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pl} x2={w - pr} y1={y(t)} y2={y(t)} stroke={C.grid} strokeDasharray={t === 0 ? undefined : "2 4"} />
              <text x={pl - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="10.5" fill={C.axis} className="num">{format(t)}</text>
            </g>
          ))}
          {Array.from({ length: total }, (_, i) => i)
            .filter((i) => i === n - 1 || i === 0 || (i % step === 0 && Math.abs(i - (n - 1)) > step * 0.6 && total - 1 - i > step * 0.4))
            .map((i) => (
              <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? "start" : "middle"} fontSize="10.5"
                fill={i === n - 1 ? "#ededee" : C.axis}>{i === n - 1 ? "Today" : fmtDay(labelAt(i))}</text>
            ))}
          <text x={w - pr} y={height - 6} textAnchor="end" fontSize="10.5" fill={C.axis}>{fmtDay(labelAt(total - 1))}</text>
          {/* projection zone */}
          <rect x={x(n - 1)} y={pt} width={Math.max(0, x(total - 1) - x(n - 1))} height={ih} fill="#ffffff" opacity="0.015" />
          {targetTotal ? <path d={`M${x(0)},${y(tgt(0))}L${x(total - 1)},${y(tgt(total - 1))}`} stroke={C.target} strokeWidth="1" opacity="0.55" fill="none" /> : null}
          <path d={path(prev)} fill="none" stroke={C.prev} strokeWidth="1.5" strokeDasharray="4 4" />
          <path d={`${path(act)}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill={`url(#${gid})`} />
          <path d={path(act)} fill="none" stroke={C.brand} strokeWidth="2" strokeLinejoin="round" />
          <path d={path(proj, n - 1)} fill="none" stroke={C.brandSoft} strokeWidth="1.5" strokeDasharray="3 4" opacity="0.85" />
          <circle cx={x(n - 1)} cy={y(last)} r="3.5" fill={C.brand} stroke="#161617" strokeWidth="2" />
          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pt} y2={pt + ih} stroke="#ffffff" opacity="0.18" />
              <circle cx={x(hover)} cy={y(hover < n ? act[hover] : proj[hover - n + 1])} r="3.5" fill={C.brand} stroke="#161617" strokeWidth="2" />
            </g>
          )}
        </svg>
      )}
      {hover != null && w > 0 && <Tooltip x={x(hover)} w={w} title={hover < n ? fmtDay(labelAt(hover)) : `${fmtDay(labelAt(hover))} · projected`} rows={rows} />}
    </div>
  );
}

// ── Daily columns with prior-period overlay ──────────────────────────────────
export function DailyBars({ labels, current, previous, unit, height = 248 }: {
  labels: number[]; current: number[]; previous: number[]; unit: string; height?: number;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = current.length;
  const pl = 34, pr = 10, pt = 10, pb = 24;
  const iw = Math.max(1, w - pl - pr), ih = height - pt - pb;
  const yMax = niceMax(Math.max(...current, ...previous, 1) * 1.1);
  const slot = iw / n;
  const bw = Math.max(2, Math.min(18, slot * 0.62));
  const cxAt = (i: number) => pl + slot * i + slot / 2;
  const y = (v: number) => pt + ih - (v / yMax) * ih;
  const ticks = [0, 0.5, 1].map((f) => Math.round(f * yMax));
  const step = Math.max(1, Math.round(n / 6));
  const prevLine = previous.map((v, i) => `${i ? "L" : "M"}${cxAt(i).toFixed(1)},${y(v).toFixed(1)}`).join("");

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label={`Daily ${unit}`}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setHover(Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left - pl) / slot))));
          }}
          onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pl} x2={w - pr} y1={y(t)} y2={y(t)} stroke={C.grid} strokeDasharray={t === 0 ? undefined : "2 4"} />
              <text x={pl - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="10.5" fill={C.axis} className="num">{t}</text>
            </g>
          ))}
          {current.map((v, i) => (
            <rect key={i} x={cxAt(i) - bw / 2} y={y(v)} width={bw} height={Math.max(0, y(0) - y(v))} rx="2"
              fill={i === n - 1 ? C.brand : hover === i ? C.brandSoft : "#f9731699"} />
          ))}
          <path d={prevLine} fill="none" stroke={C.prev} strokeWidth="1.25" strokeDasharray="3 3" />
          {labels.map((t, i) => (i % step === 0 ? (
            <text key={i} x={cxAt(i)} y={height - 6} textAnchor="middle" fontSize="10.5" fill={C.axis}>{fmtDay(t)}</text>
          ) : null))}
          {hover != null && <rect x={cxAt(hover) - slot / 2} y={pt} width={slot} height={ih} fill="#ffffff" opacity="0.04" />}
        </svg>
      )}
      {hover != null && w > 0 && (
        <Tooltip x={cxAt(hover)} w={w} title={fmtDay(labels[hover])} rows={[
          { label: "This period", value: `${current[hover]} ${unit}`, swatch: Sw.area },
          { label: "Prior period", value: `${previous[hover]} ${unit}`, swatch: Sw.dash },
        ]} />
      )}
    </div>
  );
}

// ── Bullet bar: actual vs target marker ──────────────────────────────────────
export function Bullet({ value, target, tone = "brand" }: { value: number | null; target: number; tone?: "brand" | "ok" | "warn" | "crit" }) {
  const fill = { brand: "bg-brand", ok: "bg-ok", warn: "bg-warn", crit: "bg-crit" }[tone];
  return (
    <div className="relative h-1.5 w-full rounded-full bg-white/[0.06]">
      <div className={cx("h-full rounded-full transition-[width] duration-500", fill)} style={{ width: `${Math.min(100, (value ?? 0) * 100)}%` }} />
      <div className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-fg" style={{ left: `calc(${target * 100}% - 1px)` }} title={`Target ${Math.round(target * 100)}%`} />
    </div>
  );
}
