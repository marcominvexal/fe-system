"use client";

import { useStore } from "@/lib/storeContext";

export default function InvoicePage() {
  const { tasks } = useStore();

  const approved    = tasks.filter((t) => t.status === "approved");
  const completed   = tasks.filter((t) => t.status === "completed");
  const billable    = [...approved, ...completed];

  const totalRev    = approved.reduce((s, t) => s + (t.customerCharge ?? 0), 0);
  const totalCost   = approved.reduce((s, t) => s + (t.feCost ?? 0), 0);
  const totalProfit = approved.reduce((s, t) => s + (t.profit ?? 0), 0);
  const margin      = totalRev > 0 ? Math.round((totalProfit / totalRev) * 100) : 0;

  const fmt = (iso?: string) =>
    iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—";

  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const month = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <div className="max-w-screen-lg">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Monthly Invoice Summary</h1>
          <p className="text-sm text-gray-500 mt-0.5">Billing period: <span className="font-medium text-gray-700">{month}</span></p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Generated</p>
          <p className="text-sm font-semibold text-gray-700">{today}</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-7">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Invoiced Tasks</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{approved.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">{completed.length} pending approval</p>
        </div>
        <div className="bg-white border border-gray-200 border-l-4 border-l-blue-500 rounded-lg p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Revenue</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">${totalRev.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-0.5">customer charges</p>
        </div>
        <div className="bg-white border border-gray-200 border-l-4 border-l-red-400 rounded-lg p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">FE Cost</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">${totalCost.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-0.5">engineer cost</p>
        </div>
        <div className="bg-white border border-gray-200 border-l-4 border-l-green-500 rounded-lg p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Net Profit</p>
          <p className="text-3xl font-bold text-green-600 mt-1">${totalProfit.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-0.5">{margin}% margin</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Task Billing</h2>
            <p className="text-xs text-gray-400 mt-0.5">Approved + completed tasks from store</p>
          </div>
          <span className="text-xs font-medium text-gray-500 bg-gray-100 px-3 py-1.5 rounded-md">
            {billable.length} records
          </span>
        </div>

        {billable.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500">No billable tasks yet</p>
            <p className="text-xs text-gray-400 mt-1">Complete tasks in the FE Workspace to generate billing</p>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-semibold">Task</th>
                  <th className="text-left px-4 py-3 font-semibold">Engineer</th>
                  <th className="text-left px-4 py-3 font-semibold">Customer</th>
                  <th className="text-left px-4 py-3 font-semibold">SLA</th>
                  <th className="text-left px-4 py-3 font-semibold">Check In</th>
                  <th className="text-left px-4 py-3 font-semibold">Check Out</th>
                  <th className="text-right px-4 py-3 font-semibold">Charge</th>
                  <th className="text-right px-4 py-3 font-semibold">FE Cost</th>
                  <th className="text-right px-4 py-3 font-semibold">Profit</th>
                  <th className="text-left px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {billable.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800 text-xs">{t.title}</p>
                      <p className="text-xs text-gray-400 font-mono">{t.id}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600 shrink-0">
                          {t.engineerName.charAt(0)}
                        </div>
                        <span className="text-gray-700 text-xs">{t.engineerName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{t.customer}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{t.serviceLevel}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs tabular-nums">{fmt(t.checkInTime)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs tabular-nums">{fmt(t.checkOutTime)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">
                      {t.customerCharge != null ? `$${t.customerCharge}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-red-500 font-medium">
                      {t.feCost != null ? `$${t.feCost}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-green-600">
                      {t.profit != null ? `$${t.profit}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {t.status === "approved" ? (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700">Approved</span>
                      ) : (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Pending</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="border-t-2 border-gray-200 bg-gray-50">
              <div className="flex items-center justify-end px-5 py-4 gap-12 text-sm">
                <div className="text-right">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Total Revenue</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">${totalRev.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Total FE Cost</p>
                  <p className="text-lg font-bold text-red-500 mt-0.5">${totalCost.toLocaleString()}</p>
                </div>
                <div className="text-right border-l border-gray-300 pl-12">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Net Profit</p>
                  <p className="text-2xl font-bold text-green-600 mt-0.5">${totalProfit.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
