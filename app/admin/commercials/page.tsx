"use client";

import {
  MAINTENANCE_LEVELS, SERVICE_LEVELS, DISTANCE_BANDS, VISIT_DURATIONS,
  MaintenanceLevel, ServiceLevel, DistanceBand, VisitDuration,
} from "@/lib/store";
import { calculateCommercial } from "@/lib/commercialEngine";

const MAINT_SHORT: Record<MaintenanceLevel, string> = {
  "Planned Activity": "Planned",
  "Reactive Support": "Reactive",
};

const SLA_COLORS: Record<ServiceLevel, string> = {
  "8x5 NBD": "bg-blue-50 text-blue-700",
  "8x5 4h":  "bg-amber-50 text-amber-700",
  "24x7 4h": "bg-red-50 text-red-700",
};

export default function CommercialsPage() {
  return (
    <div className="max-w-screen-xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Commercial Rules</h1>
        <p className="text-sm text-gray-500 mt-0.5">Orange Business pricing matrix — all rates in USD</p>
      </div>

      {/* Legend */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-5 py-4 mb-6 flex items-start gap-4">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <div className="text-sm text-blue-800 space-y-1">
          <p className="font-semibold">How billing works</p>
          <p>Customer charge, FE payment, and profit are determined by four factors: <span className="font-semibold">Maintenance Level × SLA × Distance Band × Visit Duration</span>.</p>
          <p>These rates are locked at task creation and confirmed at approval. FE payment ≈ 30% of customer charge.</p>
        </div>
      </div>

      {/* Matrix per distance band */}
      {DISTANCE_BANDS.map((band) => (
        <div key={band} className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-5">
          <div className="px-5 py-3.5 bg-gray-800 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Distance Band: {band}</h2>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
              <circle cx="12" cy="12" r="10"/><polyline points="12 8 8 12 12 16"/><line x1="16" y1="12" x2="8" y2="12"/>
            </svg>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-36">Maintenance</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">SLA</th>
                  {VISIT_DURATIONS.map((vd) => (
                    <th key={vd} colSpan={3} className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide border-l border-gray-200">
                      {vd}
                    </th>
                  ))}
                </tr>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-2" />
                  <th className="px-4 py-2" />
                  {VISIT_DURATIONS.map((vd) => (
                    <>
                      <th key={`${vd}-charge`} className="px-3 py-2 text-right text-xs font-medium text-gray-400 border-l border-gray-200">Charge</th>
                      <th key={`${vd}-fe`} className="px-3 py-2 text-right text-xs font-medium text-gray-400">FE Pay</th>
                      <th key={`${vd}-profit`} className="px-3 py-2 text-right text-xs font-medium text-gray-400">Profit</th>
                    </>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {MAINTENANCE_LEVELS.map((ml) =>
                  SERVICE_LEVELS.map((sl, slIdx) => {
                    // Skip reactive SLAs for non-<50km bands (they share same rate, show once)
                    if (band !== "<50km" && ml === "Reactive Support" && slIdx > 0) return null;
                    const isFirst = slIdx === 0;
                    const rowspan = band !== "<50km" && ml === "Reactive Support"
                      ? SERVICE_LEVELS.length
                      : 1;

                    return (
                      <tr key={`${ml}-${sl}`} className="hover:bg-gray-50 transition-colors">
                        {isFirst && (
                          <td
                            rowSpan={SERVICE_LEVELS.length}
                            className="px-4 py-3 align-middle border-r border-gray-100"
                          >
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                              ml === "Planned Activity"
                                ? "bg-blue-50 text-blue-700"
                                : "bg-orange-50 text-orange-700"
                            }`}>
                              {MAINT_SHORT[ml]}
                            </span>
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${SLA_COLORS[sl]}`}>
                            {band !== "<50km" && ml === "Reactive Support" && slIdx === 0
                              ? "Any"
                              : sl}
                          </span>
                        </td>
                        {VISIT_DURATIONS.map((vd: VisitDuration) => {
                          const r = calculateCommercial(ml, sl, band as DistanceBand, vd);
                          return (
                            <>
                              <td key={`${vd}-charge`} className="px-3 py-3 text-right font-bold text-gray-900 tabular-nums border-l border-gray-100">${r.customerChargeUSD}</td>
                              <td key={`${vd}-fe`} className="px-3 py-3 text-right text-red-500 font-medium tabular-nums">${r.engineerPaymentUSD}</td>
                              <td key={`${vd}-profit`} className="px-3 py-3 text-right text-green-600 font-bold tabular-nums">${r.profit}</td>
                            </>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Key */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Key</p>
        <div className="flex flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-2"><span className="font-bold text-gray-900">Charge</span> = customer invoice amount</div>
          <div className="flex items-center gap-2"><span className="font-bold text-red-500">FE Pay</span> = engineer payment (≈30% of charge)</div>
          <div className="flex items-center gap-2"><span className="font-bold text-green-600">Profit</span> = Charge − FE Pay</div>
          <div className="flex items-center gap-2"><span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded font-medium">Reactive</span> = unplanned / breakdown response</div>
          <div className="flex items-center gap-2"><span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium">Planned</span> = scheduled maintenance</div>
        </div>
      </div>
    </div>
  );
}
