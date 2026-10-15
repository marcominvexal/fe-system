"use client";

import { useStore } from "@/lib/storeContext";
import { Task, calcDuration, fmtDate } from "@/lib/store";
import { useShell } from "@/components/shell";
import { Avatar, Badge, PageHeader, Stat, StatStrip } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { Icons } from "@/components/icons";
import { fmtUSD, taskValue } from "@/lib/analytics";

export default function InvoicesPage() {
  const { tasks } = useStore();
  const { query, setQuery } = useShell();

  const approved  = tasks.filter((t) => t.status === "approved");
  const completed = tasks.filter((t) => t.status === "completed");
  const billable  = [...approved, ...completed];

  const totalRev    = approved.reduce((s, t) => s + (t.customerChargeUSD ?? 0), 0);
  const totalCost   = approved.reduce((s, t) => s + (t.engineerPaymentUSD ?? 0), 0);
  const totalProfit = approved.reduce((s, t) => s + (t.profit ?? 0), 0);
  const margin      = totalRev > 0 ? Math.round((totalProfit / totalRev) * 100) : 0;
  const pendingVal  = completed.reduce((s, t) => s + taskValue(t), 0);
  const today       = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const month       = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const q = query.toLowerCase();
  const rows = billable.filter((t) => !q || [t.title, t.id, t.engineerName, t.invoiceNumber ?? ""].some((v) => v.toLowerCase().includes(q)));

  const columns: Column<Task>[] = [
    { key: "inv", header: "Invoice", sort: (t) => t.invoiceNumber ?? "",
      render: (t) => t.invoiceNumber
        ? <span className="whitespace-nowrap font-mono text-xs text-fg">{t.invoiceNumber}</span>
        : <span className="text-xs text-fg-faint">Not issued</span> },
    { key: "task", header: "Task", sort: (t) => t.title,
      render: (t) => (
        <div className="min-w-[160px] max-w-[250px]">
          <p className="truncate font-medium text-fg">{t.title}</p>
          <p className="mt-0.5 truncate text-2xs text-fg-subtle"><span className="font-mono text-fg-faint">{t.id}</span> · {t.serviceLevel} · {t.visitDuration}</p>
        </div>
      ) },
    { key: "eng", header: "Engineer", sort: (t) => t.engineerName, className: "hidden lg:table-cell",
      render: (t) => <span className="flex items-center gap-2 whitespace-nowrap text-fg-muted"><Avatar name={t.engineerName} size={22} />{t.engineerName}</span> },
    { key: "date", header: "Date", sort: (t) => t.checkOutTime || t.createdAt, className: "hidden lg:table-cell",
      render: (t) => <span className="num whitespace-nowrap text-xs text-fg-subtle" title={fmtDate(t.checkOutTime || t.createdAt)}>{new Date(t.checkOutTime || t.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span> },
    { key: "dur", header: "Duration", className: "hidden 2xl:table-cell",
      render: (t) => <span className="num text-xs text-fg-subtle">{t.duration || calcDuration(t.checkInTime, t.checkOutTime)}</span> },
    { key: "charge", header: "Charge", align: "right", sort: (t) => t.customerChargeUSD ?? taskValue(t),
      render: (t) => t.customerChargeUSD != null
        ? <span className="num font-medium text-fg">{fmtUSD(t.customerChargeUSD)}</span>
        : <span className="num text-xs text-fg-faint" title="Engine estimate — confirmed on approval">~{fmtUSD(taskValue(t))}</span> },
    { key: "fe", header: "FE pay", align: "right", className: "hidden sm:table-cell", sort: (t) => t.engineerPaymentUSD ?? 0,
      render: (t) => t.engineerPaymentUSD != null ? <span className="num text-fg-muted">{fmtUSD(t.engineerPaymentUSD)}</span> : <span className="text-fg-faint">—</span> },
    { key: "profit", header: "Profit", align: "right", sort: (t) => t.profit ?? 0,
      render: (t) => t.profit != null ? <span className="num font-medium text-[#7bcfa2]">{fmtUSD(t.profit)}</span> : <span className="text-fg-faint">—</span> },
    { key: "status", header: "Status", sort: (t) => t.status,
      render: (t) => t.status === "approved" ? <Badge tone="ok">Approved</Badge> : <Badge tone="warn">Pending</Badge> },
  ];

  return (
    <div>
      <PageHeader title="Invoice summary"
        subtitle={<>Billing period <span className="text-fg-muted">{month}</span> · generated {today}</>} />

      <StatStrip>
        <Stat label="Invoiced tasks" value={approved.length} foot={`${completed.length} pending approval`} />
        <Stat label="Total revenue" value={fmtUSD(totalRev)} foot="Customer charges" accent />
        <Stat label="FE payments" value={fmtUSD(totalCost)} foot="Engineer cost" />
        <Stat label="Net profit" value={fmtUSD(totalProfit)} foot={`${margin}% margin`} />
      </StatStrip>

      <section className="overflow-hidden rounded-xl border border-line bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-3.5 sm:px-5">
          <div>
            <h2 className="text-[13px] font-semibold tracking-tight text-fg">Task billing</h2>
            <p className="mt-0.5 text-2xs text-fg-subtle">Approved and pending tasks · {fmtUSD(pendingVal)} awaiting approval</p>
          </div>
          <div className="relative w-full sm:w-64">
            <Icons.Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-faint" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter invoices…" aria-label="Filter invoices"
              className="h-8 w-full rounded-lg bg-canvas pl-8 pr-3 text-[13px] text-fg placeholder:text-fg-faint ring-1 ring-inset ring-line-strong focus:outline-none focus:ring-2 focus:ring-brand/70" />
          </div>
        </div>

        {billable.length === 0 ? (
          <div className="border-t border-line py-16 text-center">
            <Icons.Invoice size={22} className="mx-auto text-fg-faint" />
            <p className="mt-3 text-[13px] font-medium text-fg-muted">No billable tasks yet</p>
            <p className="mt-1 text-xs text-fg-subtle">Complete and approve tasks in the dashboard to generate invoices</p>
          </div>
        ) : (
          <>
            <DataTable rows={rows} columns={columns} rowKey={(t) => t.id} pageSize={15}
              initialSort={{ key: "date", dir: "desc" }} />
            <div className="flex flex-wrap items-center justify-end gap-x-10 gap-y-3 border-t border-line bg-raised/60 px-5 py-4">
              <div className="text-right">
                <p className="text-2xs font-medium uppercase tracking-[0.06em] text-fg-subtle">Total revenue</p>
                <p className="num mt-1 text-[17px] font-semibold text-fg">{fmtUSD(totalRev)}</p>
              </div>
              <div className="text-right">
                <p className="text-2xs font-medium uppercase tracking-[0.06em] text-fg-subtle">Total FE cost</p>
                <p className="num mt-1 text-[17px] font-semibold text-fg-muted">{fmtUSD(totalCost)}</p>
              </div>
              <div className="border-l border-line-strong pl-10 text-right">
                <p className="text-2xs font-medium uppercase tracking-[0.06em] text-fg-subtle">Net profit</p>
                <p className="num mt-1 text-[22px] font-semibold text-[#7bcfa2]">{fmtUSD(totalProfit)}</p>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
