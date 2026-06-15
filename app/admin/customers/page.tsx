"use client";

import { useStore } from "@/lib/storeContext";

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

export default function CustomersPage() {
  const { tasks } = useStore();

  return (
    <div className="max-w-screen-lg">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Customer Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Active service accounts</p>
        </div>
        <button className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-md bg-orange-500 text-white hover:bg-orange-600 transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Customer
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Customers</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{CUSTOMER_LIST.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5 border-l-4 border-l-orange-500">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Active Tasks</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            {tasks.filter((t) => !["approved","cancelled","rejected"].includes(t.status)).length}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5 border-l-4 border-l-green-500">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Billed</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            ${tasks.filter((t) => t.status === "approved").reduce((s, t) => s + (t.customerChargeUSD ?? 0), 0).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-800">Service Accounts</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
              <th className="text-left px-4 py-3 font-semibold">Customer</th>
              <th className="text-left px-4 py-3 font-semibold">Type</th>
              <th className="text-left px-4 py-3 font-semibold">Country</th>
              <th className="text-left px-4 py-3 font-semibold">Default SLA</th>
              <th className="text-left px-4 py-3 font-semibold">Contact</th>
              <th className="text-right px-4 py-3 font-semibold">Total Tasks</th>
              <th className="text-right px-4 py-3 font-semibold">Total Billed</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {CUSTOMER_LIST.map((c) => {
              const cTasks   = tasks.filter((t) => t.customer === c.name);
              const cBilled  = cTasks.filter((t) => t.status === "approved").reduce((s, t) => s + (t.customerChargeUSD ?? 0), 0);
              return (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center text-sm font-bold text-orange-600 shrink-0">
                        {c.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800">{c.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">{c.type}</span>
                  </td>
                  <td className="px-4 py-4 text-gray-600 text-sm">{c.country}</td>
                  <td className="px-4 py-4">
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-orange-50 text-orange-700">{c.sla}</span>
                  </td>
                  <td className="px-4 py-4 text-gray-500 text-xs">{c.contact}</td>
                  <td className="px-4 py-4 text-right font-semibold text-gray-800">{cTasks.length}</td>
                  <td className="px-4 py-4 text-right font-bold text-green-600">
                    {cBilled > 0 ? `$${cBilled.toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-4">
                    {c.active ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700">Active</span>
                    ) : (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Inactive</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
