"use client";

import { Fragment } from "react";
import {
  MAINTENANCE_LEVELS, SERVICE_LEVELS, DISTANCE_BANDS, VISIT_DURATIONS,
  MaintenanceLevel, DistanceBand, VisitDuration,
} from "@/lib/store";
import { calculateCommercial } from "@/lib/commercialEngine";
import { Badge, PageHeader } from "@/components/ui";
import { PriorityTag } from "@/components/tasks";
import { Icons } from "@/components/icons";

const MAINT_SHORT: Record<MaintenanceLevel, string> = {
  "Planned Activity": "Planned",
  "Reactive Support": "Reactive",
};

const th = "px-3 py-2 text-2xs font-medium uppercase tracking-[0.06em] text-fg-subtle whitespace-nowrap";

export default function CommercialsPage() {
  return (
    <div>
      <PageHeader title="Commercial rules" subtitle="Orange Business pricing matrix · all rates in USD" />

      {/* How billing works */}
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-line bg-panel px-5 py-4">
        <Icons.Info size={16} className="mt-0.5 shrink-0 text-brand" />
        <div className="space-y-1 text-[13px] text-fg-muted">
          <p className="font-medium text-fg">How billing works</p>
          <p>Customer charge, FE payment and profit are determined by four factors: <span className="text-fg">Maintenance level × SLA × Distance band × Visit duration</span>.</p>
          <p>These rates are locked at task creation and confirmed at approval. FE payment ≈ 30% of customer charge.</p>
        </div>
      </div>

      {/* Matrix per distance band */}
      <div className="space-y-4">
        {DISTANCE_BANDS.map((band) => (
          <section key={band} className="overflow-hidden rounded-xl border border-line bg-panel">
            <div className="flex items-center justify-between px-5 py-3">
              <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-tight text-fg">
                <Icons.MapPin size={14} className="text-brand" />Distance band <span className="font-mono text-brand-soft">{band}</span>
              </h2>
              <span className="text-2xs text-fg-subtle">Charge · FE pay · Profit per visit length</span>
            </div>

            <div className="scroll-thin overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 text-[13px]">
                <thead className="bg-raised">
                  <tr>
                    <th className={`${th} border-t border-line pl-5 text-left`}>Maintenance</th>
                    <th className={`${th} border-t border-line text-left`}>SLA</th>
                    {VISIT_DURATIONS.map((vd) => (
                      <th key={vd} colSpan={3} className={`${th} border-l border-t border-line text-center text-fg-muted`}>{vd}</th>
                    ))}
                  </tr>
                  <tr>
                    <th className="border-b border-line" />
                    <th className="border-b border-line" />
                    {VISIT_DURATIONS.map((vd) => (
                      <Fragment key={vd}>
                        <th className={`${th} border-b border-l border-line text-right normal-case tracking-normal text-fg-faint`}>Charge</th>
                        <th className={`${th} border-b border-line text-right normal-case tracking-normal text-fg-faint`}>FE pay</th>
                        <th className={`${th} border-b border-line pr-4 text-right normal-case tracking-normal text-fg-faint`}>Profit</th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MAINTENANCE_LEVELS.map((ml) =>
                    SERVICE_LEVELS.map((sl, slIdx) => {
                      // Skip reactive SLAs for non-<50km bands (they share same rate, show once)
                      if (band !== "<50km" && ml === "Reactive Support" && slIdx > 0) return null;
                      const isFirst = slIdx === 0;

                      return (
                        <tr key={`${ml}-${sl}`} className="transition-colors hover:bg-white/[0.025]">
                          {isFirst && (
                            <td rowSpan={band !== "<50km" && ml === "Reactive Support" ? 1 : SERVICE_LEVELS.length} className="border-b border-r border-line/70 px-3 py-3 pl-5 align-middle">
                              <Badge tone={ml === "Planned Activity" ? "info" : "brand"}>{MAINT_SHORT[ml]}</Badge>
                            </td>
                          )}
                          <td className="border-b border-line/70 px-3 py-2.5">
                            {band !== "<50km" && ml === "Reactive Support" && slIdx === 0
                              ? <span className="text-xs text-fg-muted">Any SLA</span>
                              : <span className="flex items-center gap-2 whitespace-nowrap text-xs text-fg-muted"><PriorityTag sl={sl} />{sl}</span>}
                          </td>
                          {VISIT_DURATIONS.map((vd: VisitDuration) => {
                            const r = calculateCommercial(ml, sl, band as DistanceBand, vd);
                            return (
                              <Fragment key={vd}>
                                <td className="num border-b border-l border-line/70 px-3 py-2.5 text-right font-semibold text-fg">${r.customerChargeUSD}</td>
                                <td className="num border-b border-line/70 px-3 py-2.5 text-right text-fg-subtle">${r.engineerPaymentUSD}</td>
                                <td className="num border-b border-line/70 px-3 py-2.5 pr-4 text-right font-medium text-[#7bcfa2]">${r.profit}</td>
                              </Fragment>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      {/* Key */}
      <div className="mt-4 rounded-xl border border-line bg-panel px-5 py-4">
        <p className="mb-3 text-2xs font-medium uppercase tracking-[0.08em] text-fg-subtle">Key</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-fg-muted">
          <span><span className="font-semibold text-fg">Charge</span> = customer invoice amount</span>
          <span><span className="font-semibold text-fg-subtle">FE pay</span> = engineer payment (≈30% of charge)</span>
          <span><span className="font-semibold text-[#7bcfa2]">Profit</span> = Charge − FE pay</span>
          <span className="flex items-center gap-1.5"><Badge tone="brand">Reactive</Badge> unplanned / breakdown response</span>
          <span className="flex items-center gap-1.5"><Badge tone="info">Planned</Badge> scheduled maintenance</span>
        </div>
      </div>
    </div>
  );
}
