"use client";

import { useStore } from "@/lib/storeContext";
import { Badge, Button, PageHeader, Stat, StatStrip } from "@/components/ui";
import { Icons } from "@/components/icons";
import { fmtUSD } from "@/lib/analytics";

const CUSTOMER_LIST = [
  {
    id:       "c1",
    name:     "Orange Business",
    country:  "Pakistan",
    contact:  "noc@orangebusiness.com",
    type:     "Telecom",
    sla:      "24x7 4h",
    active:   true,
  },
];

const th = "border-y border-line bg-raised px-3 py-2 text-2xs font-medium uppercase tracking-[0.06em] text-fg-subtle whitespace-nowrap first:pl-5 last:pr-5";

export default function CustomersPage() {
  const { tasks } = useStore();

  return (
    <div>
      <PageHeader title="Customer management" subtitle="Active service accounts"
        actions={<Button variant="primary"><Icons.Plus size={15} />Add customer</Button>} />

      <StatStrip cols="sm:grid-cols-3">
        <Stat label="Total customers" value={CUSTOMER_LIST.length} />
        <Stat label="Active tasks" value={tasks.filter((t) => !["approved","cancelled","rejected"].includes(t.status)).length} accent />
        <Stat label="Total billed" value={fmtUSD(tasks.filter((t) => t.status === "approved").reduce((s, t) => s + (t.customerChargeUSD ?? 0), 0))} />
      </StatStrip>

      <section className="overflow-hidden rounded-xl border border-line bg-panel">
        <div className="px-5 pb-3 pt-3.5">
          <h2 className="text-[13px] font-semibold tracking-tight text-fg">Service accounts</h2>
        </div>
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr>
                <th className={`${th} text-left`}>Customer</th>
                <th className={`${th} text-left`}>Type</th>
                <th className={`${th} text-left`}>Country</th>
                <th className={`${th} text-left`}>Default SLA</th>
                <th className={`${th} text-left`}>Contact</th>
                <th className={`${th} text-right`}>Total tasks</th>
                <th className={`${th} text-right`}>Total billed</th>
                <th className={`${th} text-left`}>Status</th>
              </tr>
            </thead>
            <tbody>
              {CUSTOMER_LIST.map((c) => {
                const cTasks   = tasks.filter((t) => t.customer === c.name);
                const cBilled  = cTasks.filter((t) => t.status === "approved").reduce((s, t) => s + (t.customerChargeUSD ?? 0), 0);
                const td = "border-b border-line/70 px-3 py-3.5 first:pl-5 last:pr-5";
                return (
                  <tr key={c.id} className="transition-colors hover:bg-white/[0.025]">
                    <td className={td}>
                      <div className="flex items-center gap-3">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand/10 text-[13px] font-semibold text-brand-soft ring-1 ring-inset ring-brand/20">
                          {c.name.charAt(0)}
                        </span>
                        <span className="whitespace-nowrap font-medium text-fg">{c.name}</span>
                      </div>
                    </td>
                    <td className={td}><Badge tone="info" dot={false}>{c.type}</Badge></td>
                    <td className={`${td} text-fg-muted`}>{c.country}</td>
                    <td className={td}><Badge tone="neutral" dot={false}>{c.sla}</Badge></td>
                    <td className={`${td} text-xs text-fg-subtle`}>{c.contact}</td>
                    <td className={`${td} num text-right font-medium text-fg`}>{cTasks.length}</td>
                    <td className={`${td} num text-right font-medium text-fg`}>{cBilled > 0 ? fmtUSD(cBilled) : "—"}</td>
                    <td className={td}>{c.active ? <Badge tone="ok">Active</Badge> : <Badge tone="muted">Inactive</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
