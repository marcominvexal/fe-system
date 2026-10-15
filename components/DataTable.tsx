"use client";

import { useMemo, useState } from "react";
import { Icons } from "./icons";
import { cx } from "./ui";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T) => React.ReactNode;
  /** Provide to make the column sortable */
  sort?: (row: T) => string | number;
  align?: "left" | "right";
  /** Tailwind classes, e.g. "hidden lg:table-cell" to drop columns on small screens */
  className?: string;
  width?: string;
}

export function DataTable<T>({
  rows, columns, rowKey, onRowClick, selectedKey, pageSize = 12,
  initialSort, empty, footer, maxHeight = "min(640px, 70vh)",
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (r: T) => string;
  onRowClick?: (r: T) => void;
  selectedKey?: string | null;
  pageSize?: number;
  initialSort?: { key: string; dir: "asc" | "desc" };
  empty?: React.ReactNode;
  footer?: React.ReactNode;
  maxHeight?: string;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const get = col.sort;
    return [...rows].sort((a, b) => {
      const va = get(a), vb = get(b);
      const r = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === "asc" ? r : -r;
    });
  }, [rows, columns, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  // Reset to first page when the row set changes (filters/search)
  const [seenLen, setSeenLen] = useState(rows.length);
  if (seenLen !== rows.length) { setSeenLen(rows.length); setPage(0); }
  const p = Math.min(page, pages - 1);
  const view = sorted.slice(p * pageSize, p * pageSize + pageSize);

  const toggle = (key: string) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  return (
    <div>
      <div className="scroll-thin overflow-auto [scrollbar-gutter:stable]" style={{ maxHeight }}>
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} scope="col" style={{ width: c.width }}
                    aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={cx(
                      "sticky top-0 z-[1] border-y border-line bg-raised px-2.5 py-2 text-2xs font-medium uppercase tracking-[0.06em] text-fg-subtle whitespace-nowrap first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5",
                      c.align === "right" ? "text-right" : "text-left", c.className,
                    )}>
                    {c.sort ? (
                      <button onClick={() => toggle(c.key)}
                        className={cx("inline-flex items-center gap-1 uppercase tracking-[0.06em] transition-colors hover:text-fg", active && "text-fg", c.align === "right" && "flex-row-reverse")}>
                        {c.header}
                        <span className={cx("transition-opacity", active ? "opacity-100" : "opacity-40")}>
                          {active ? (sort!.dir === "asc" ? <Icons.ChevronD size={12} className="rotate-180" /> : <Icons.ChevronD size={12} />) : <Icons.Sort size={12} />}
                        </span>
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {view.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-5 py-14 text-center">{empty ?? <span className="text-fg-subtle">No records</span>}</td></tr>
            ) : view.map((r) => {
              const k = rowKey(r);
              const sel = selectedKey === k;
              return (
                <tr key={k}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  onKeyDown={onRowClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(r); } } : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  className={cx("group transition-colors duration-150", onRowClick && "cursor-pointer",
                    sel ? "bg-brand/[0.07]" : "hover:bg-white/[0.025]")}>
                  {columns.map((c, ci) => (
                    <td key={c.key}
                      className={cx("border-b border-line/70 px-2.5 py-2.5 align-middle first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5",
                        c.align === "right" && "text-right", c.className,
                        ci === 0 && sel && "shadow-[inset_2px_0_0_var(--color-brand)]")}>
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-2xs text-fg-subtle sm:px-5">
        <span className="num">
          {sorted.length === 0 ? "0 results" : `${p * pageSize + 1}–${Math.min(sorted.length, (p + 1) * pageSize)} of ${sorted.length}`}
        </span>
        {footer}
        <div className="flex items-center gap-1">
          <button aria-label="Previous page" disabled={p === 0} onClick={() => setPage(p - 1)}
            className="grid h-7 w-7 place-items-center rounded-md text-fg-muted ring-1 ring-inset ring-line hover:bg-white/5 disabled:opacity-30">
            <Icons.ChevronL size={14} />
          </button>
          <span className="num px-2 text-fg-muted">{p + 1} / {pages}</span>
          <button aria-label="Next page" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}
            className="grid h-7 w-7 place-items-center rounded-md text-fg-muted ring-1 ring-inset ring-line hover:bg-white/5 disabled:opacity-30">
            <Icons.ChevronR size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
