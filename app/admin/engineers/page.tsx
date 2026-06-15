"use client";

import { useStore } from "@/lib/storeContext";
import { engineers, TaskStatus } from "@/lib/store";

function av(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

const STATUS_COLORS: Record<string, string> = {
  assigned:    "text-blue-600",
  accepted:    "text-indigo-600",
  in_progress: "text-purple-600",
  completed:   "text-amber-600",
  approved:    "text-green-600",
  rejected:    "text-red-500",
  cancelled:   "text-gray-400",
};

export default function EngineersPage() {
  const { tasks } = useStore();

  return (
    <div className="max-w-screen-lg">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Engineer Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Field engineer roster and performance</p>
        </div>
        <button className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-md bg-orange-500 text-white hover:bg-orange-600 transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Engineer
        </button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Engineers</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{engineers.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5 border-l-4 border-l-purple-500">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Currently On Site</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            {new Set(tasks.filter((t) => t.status === "in_progress").map((t) => t.engineerId)).size}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5 border-l-4 border-l-green-500">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total FE Payments</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            ${tasks.filter((t) => t.status === "approved").reduce((s, t) => s + (t.engineerPaymentUSD ?? 0), 0).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Engineer Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {engineers.map((eng) => {
          const engTasks   = tasks.filter((t) => t.engineerId === eng.id);
          const active     = engTasks.filter((t) => t.status === "in_progress");
          const completed  = engTasks.filter((t) => ["completed", "approved"].includes(t.status));
          const totalPay   = engTasks.filter((t) => t.status === "approved").reduce((s, t) => s + (t.engineerPaymentUSD ?? 0), 0);
          const isOnSite   = active.length > 0;

          // Group by status for mini stats
          const statusCounts = engTasks.reduce<Partial<Record<TaskStatus, number>>>((acc, t) => {
            acc[t.status] = (acc[t.status] ?? 0) + 1;
            return acc;
          }, {});

          return (
            <div key={eng.id} className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center text-lg font-bold text-orange-600">
                      {av(eng.name)}
                    </div>
                    {isOnSite && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-purple-500 border-2 border-white rounded-full" />
                    )}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">{eng.name}</p>
                    <p className="text-xs text-gray-400">ID: {eng.id}</p>
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  isOnSite
                    ? "bg-purple-50 text-purple-700 border border-purple-200"
                    : "bg-gray-100 text-gray-500"
                }`}>
                  {isOnSite ? "On Site" : "Available"}
                </span>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-2xl font-bold text-gray-900">{engTasks.length}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Total</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-2xl font-bold text-amber-600">{active.length}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Active</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-2xl font-bold text-green-600">{completed.length}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Done</p>
                </div>
              </div>

              {/* Status breakdown */}
              {Object.entries(statusCounts).length > 0 && (
                <div className="space-y-1 mb-4">
                  {(Object.entries(statusCounts) as [TaskStatus, number][])
                    .sort(([, a], [, b]) => b - a)
                    .map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between text-xs">
                        <span className={`font-medium capitalize ${STATUS_COLORS[status] || "text-gray-500"}`}>
                          {status.replace("_", " ")}
                        </span>
                        <span className="font-semibold text-gray-700">{count}</span>
                      </div>
                    ))}
                </div>
              )}

              {/* Payment */}
              <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
                <span className="text-xs text-gray-500">Total Payments</span>
                <span className="text-sm font-bold text-green-600">
                  {totalPay > 0 ? `$${totalPay.toLocaleString()}` : "—"}
                </span>
              </div>

              {/* Active task */}
              {isOnSite && active[0] && (
                <div className="mt-3 bg-purple-50 border border-purple-200 rounded-md px-3 py-2">
                  <p className="text-xs text-purple-600 font-semibold">Currently working on:</p>
                  <p className="text-xs text-purple-800 font-medium mt-0.5 leading-tight">{active[0].title}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
