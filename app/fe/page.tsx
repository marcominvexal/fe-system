"use client";

import { useState } from "react";
import { visits, users, customers, RATE_CARD, Visit } from "@/lib/data";

const ACTIVE_ENGINEER = users.find((u) => u.role === "engineer")!;
type FlowState = "idle" | "checked_in" | "checked_out";

export default function FEPage() {
  const [flow, setFlow] = useState<FlowState>("idle");
  const [currentVisit, setCurrentVisit] = useState<Visit | null>(null);
  const [comments, setComments] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(customers[0].id);

  const handleCheckIn = () => {
    const now = new Date().toISOString();
    const newVisit: Visit = {
      id: `v${Date.now()}`,
      engineerId: ACTIVE_ENGINEER.id,
      engineerName: ACTIVE_ENGINEER.name,
      customerId: selectedCustomer,
      customerName: customers.find((c) => c.id === selectedCustomer)!.name,
      status: "checked_in",
      checkInTime: now,
      createdAt: now,
    };
    visits.push(newVisit);
    setCurrentVisit(newVisit);
    setFlow("checked_in");
  };

  const handleCheckOut = () => {
    if (!currentVisit) return;
    const now = new Date().toISOString();
    const idx = visits.findIndex((v) => v.id === currentVisit.id);
    if (idx !== -1) {
      visits[idx] = { ...visits[idx], status: "checked_out", checkOutTime: now, comments: comments || undefined };
      setCurrentVisit(visits[idx]);
    }
    setFlow("checked_out");
  };

  const reset = () => {
    setFlow("idle");
    setCurrentVisit(null);
    setComments("");
    setSelectedCustomer(customers[0].id);
  };

  const fmt = (iso?: string) =>
    iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—";

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Field Engineer Portal</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Logged in as <span className="font-semibold text-gray-700">{ACTIVE_ENGINEER.name}</span>
          </p>
        </div>
        <span className={`inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-full border ${
          flow === "idle" ? "bg-gray-50 text-gray-500 border-gray-200"
          : flow === "checked_in" ? "bg-blue-50 text-blue-700 border-blue-200"
          : "bg-green-50 text-green-700 border-green-200"
        }`}>
          <span className={`w-2 h-2 rounded-full ${
            flow === "idle" ? "bg-gray-400" : flow === "checked_in" ? "bg-blue-500" : "bg-green-500"
          }`} />
          {flow === "idle" ? "Not Started" : flow === "checked_in" ? "On Site" : "Visit Complete"}
        </span>
      </div>

      {flow === "idle" && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
            <p className="text-sm font-semibold text-gray-700">Start New Visit</p>
            <p className="text-xs text-gray-400 mt-0.5">Select the customer site and check in to begin</p>
          </div>
          <div className="p-5 space-y-5">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Customer Site</label>
              <select
                value={selectedCustomer}
                onChange={(e) => setSelectedCustomer(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-md p-4 grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-blue-500 font-medium">Customer Charge</p>
                <p className="text-lg font-bold text-blue-800 mt-0.5">${RATE_CARD.customerCharge}</p>
              </div>
              <div>
                <p className="text-xs text-blue-500 font-medium">Your Cost</p>
                <p className="text-lg font-bold text-blue-800 mt-0.5">${RATE_CARD.feCost}</p>
              </div>
              <div>
                <p className="text-xs text-blue-500 font-medium">Margin</p>
                <p className="text-lg font-bold text-blue-800 mt-0.5">${RATE_CARD.profit}</p>
              </div>
            </div>
            <button
              onClick={handleCheckIn}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm py-3 rounded-md transition-colors flex items-center justify-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
              Check In
            </button>
          </div>
        </div>
      )}

      {flow === "checked_in" && currentVisit && (
        <div className="space-y-4">
          <div className="bg-white border border-blue-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 bg-blue-600 flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              <p className="text-sm font-semibold text-white">Visit In Progress</p>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Customer</p>
                <p className="font-semibold text-gray-800 mt-1">{currentVisit.customerName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Engineer</p>
                <p className="font-semibold text-gray-800 mt-1">{currentVisit.engineerName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Check-in Time</p>
                <p className="font-semibold text-gray-800 mt-1">{fmt(currentVisit.checkInTime)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Visit ID</p>
                <p className="font-mono text-xs text-gray-500 mt-1 pt-0.5">{currentVisit.id}</p>
              </div>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
              Work Comments <span className="text-gray-400 normal-case font-normal">(optional)</span>
            </label>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={4}
              placeholder="Describe work performed, parts used, or any observations..."
              className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none placeholder-gray-400"
            />
          </div>
          <button
            onClick={handleCheckOut}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm py-3 rounded-md transition-colors flex items-center justify-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Check Out &amp; Submit
          </button>
        </div>
      )}

      {flow === "checked_out" && currentVisit && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-green-800">Visit submitted successfully</p>
              <p className="text-xs text-green-600 mt-0.5">Awaiting admin approval to generate invoice.</p>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-200 bg-gray-50">
              <p className="text-sm font-semibold text-gray-700">Visit Summary</p>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Customer</p>
                <p className="font-semibold text-gray-800 mt-1">{currentVisit.customerName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Status</p>
                <span className="inline-block mt-1 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">Awaiting Approval</span>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Check In</p>
                <p className="font-semibold text-gray-800 mt-1">{fmt(currentVisit.checkInTime)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Check Out</p>
                <p className="font-semibold text-gray-800 mt-1">{fmt(currentVisit.checkOutTime)}</p>
              </div>
              {currentVisit.comments && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Comments</p>
                  <p className="text-gray-700 mt-1">{currentVisit.comments}</p>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
              <span>Pending charge: <span className="font-semibold text-gray-700">${RATE_CARD.customerCharge}</span></span>
              <span>Your cost: <span className="font-semibold text-gray-700">${RATE_CARD.feCost}</span></span>
            </div>
          </div>
          <button
            onClick={reset}
            className="w-full border border-gray-300 hover:bg-gray-100 text-gray-700 font-semibold text-sm py-3 rounded-md transition-colors"
          >
            Start New Visit
          </button>
        </div>
      )}
    </div>
  );
}
