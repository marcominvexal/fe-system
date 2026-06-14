"use client";

import { useState } from "react";
import {
  calcDuration,
  Task, engineers, maintenanceTypes, locations,
  MAINTENANCE_LEVELS, SERVICE_LEVELS, DISTANCE_BANDS,
  MaintenanceLevel, ServiceLevel, DistanceBand,
} from "@/lib/store";
import { useStore } from "@/lib/storeContext";
import { calculateCommercial, shortLabel } from "@/lib/commercialEngine";

// ── Status config ──────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  pending:     "Pending",
  assigned:    "Assigned",
  in_progress: "In Progress",
  completed:   "Awaiting Approval",
  approved:    "Approved",
};
const STATUS_STYLE: Record<string, string> = {
  pending:     "bg-gray-100 text-gray-500",
  assigned:    "bg-blue-50 text-blue-700 border border-blue-200",
  in_progress: "bg-purple-50 text-purple-700 border border-purple-200",
  completed:   "bg-amber-50 text-amber-700 border border-amber-200",
  approved:    "bg-green-50 text-green-700 border border-green-200",
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(iso?: string) {
  return iso
    ? new Date(iso).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })
    : "—";
}
function fmtFull(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
function av(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

// ── KPI Card ───────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent, icon }: {
  label: string; value: string | number; sub?: string; accent: string; icon: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${accent}`}>{icon}</div>
      <div>
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5 leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Task Detail Panel ──────────────────────────────────────────────────────────
function TaskDetailPanel({ task, onClose, onApprove }: {
  task: Task; onClose: () => void; onApprove: (id: string) => Promise<void>;
}) {
  const rates = calculateCommercial(task.maintenanceLevel, task.serviceLevel, task.distanceBand);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative bg-white border-l border-gray-200 w-full max-w-lg h-screen overflow-y-auto shadow-xl flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between bg-white sticky top-0 z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-gray-400">{task.id}</span>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_STYLE[task.status]}`}>
                {STATUS_LABEL[task.status]}
              </span>
            </div>
            <h2 className="text-base font-bold text-gray-900">{task.title}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5 shrink-0 p-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 p-5 space-y-5">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Customer</p>
              <p className="font-semibold text-gray-800">{task.customer}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Engineer</p>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600 shrink-0">{av(task.engineerName)}</div>
                <span className="font-semibold text-gray-800">{task.engineerName}</span>
              </div>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Location</p>
              <p className="text-gray-700 text-xs leading-relaxed">{task.location}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Work Type</p>
              <p className="text-gray-700 text-xs">{task.maintenanceType}</p>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Commercial Rule</p>
              <span className="text-xs bg-gray-100 text-gray-500 font-mono px-2 py-0.5 rounded">{task.ruleKey}</span>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="grid grid-cols-3 divide-x divide-gray-200 text-center">
                <div className="p-3">
                  <p className="text-xs text-gray-400 font-medium">Maint. Level</p>
                  <p className="text-xs font-semibold text-gray-700 mt-1 leading-tight">{task.maintenanceLevel}</p>
                </div>
                <div className="p-3">
                  <p className="text-xs text-gray-400 font-medium">SLA</p>
                  <p className="text-sm font-bold text-blue-700 mt-1">{task.serviceLevel}</p>
                </div>
                <div className="p-3">
                  <p className="text-xs text-gray-400 font-medium">Distance</p>
                  <p className="text-sm font-bold text-gray-700 mt-1">{task.distanceBand}</p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Timeline</p>
            <div className="space-y-2">
              {[
                { label: "Created",   time: task.createdAt,    dot: "bg-gray-400" },
                { label: "Check In",  time: task.checkInTime,  dot: "bg-blue-500" },
                { label: "Check Out", time: task.checkOutTime, dot: "bg-amber-500" },
                ...(task.status === "approved"
                  ? [{ label: "Approved", time: task.checkOutTime, dot: "bg-green-500" }]
                  : []),
              ].map((ev, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${ev.time ? ev.dot : "bg-gray-200"}`} />
                  <span className={`w-24 text-xs font-medium ${ev.time ? "text-gray-700" : "text-gray-300"}`}>{ev.label}</span>
                  <span className={`text-xs tabular-nums ${ev.time ? "text-gray-500" : "text-gray-300"}`}>
                    {ev.time ? fmtFull(ev.time) : "Not yet"}
                  </span>
                </div>
              ))}
              {task.checkInTime && task.checkOutTime && (
                <div className="pl-5 text-xs text-gray-400">
                  Duration: <span className="font-semibold text-gray-700">{calcDuration(task.checkInTime, task.checkOutTime)}</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Engineer Comments</p>
            {task.comments ? (
              <div className="bg-blue-50 border border-blue-100 rounded-md p-3 text-sm text-gray-700 leading-relaxed">{task.comments}</div>
            ) : (
              <p className="text-xs text-gray-400 italic">No comments recorded.</p>
            )}
          </div>

          {(task.status === "approved" || task.status === "completed") && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Billing {task.status === "completed" ? "(Preview — pending approval)" : ""}
              </p>
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="grid grid-cols-3 divide-x divide-gray-200 text-center">
                  <div className="p-3">
                    <p className="text-xs text-gray-400 font-medium">Revenue</p>
                    <p className="text-lg font-bold text-gray-900 mt-0.5">${task.customerCharge ?? rates.customerCharge}</p>
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-gray-400 font-medium">FE Cost</p>
                    <p className="text-lg font-bold text-red-500 mt-0.5">${task.feCost ?? rates.feCost}</p>
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-gray-400 font-medium">Profit</p>
                    <p className="text-lg font-bold text-green-600 mt-0.5">${task.profit ?? rates.profit}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 bg-gray-50 sticky bottom-0">
          {task.status === "completed" ? (
            <button onClick={() => onApprove(task.id)}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold text-sm py-3 rounded-md transition-colors flex items-center justify-center gap-2">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Approve &amp; Generate Invoice
            </button>
          ) : task.status === "approved" ? (
            <div className="flex items-center justify-center gap-2 text-sm text-green-700 font-semibold py-1">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Approved — Invoice generated
            </div>
          ) : (
            <p className="text-center text-xs text-gray-400 py-1">Approval available once engineer submits work report</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step form config ───────────────────────────────────────────────────────────
const FORM_STEPS = ["Basic Info", "Location", "Engineer", "SLA & Billing"];

const EMPTY_FORM = {
  title:            "",
  customer:         "Orange Business",
  city:             locations[0],
  siteRef:          "",
  maintenanceType:  maintenanceTypes[0],
  maintenanceLevel: MAINTENANCE_LEVELS[0] as MaintenanceLevel,
  serviceLevel:     SERVICE_LEVELS[0]     as ServiceLevel,
  distanceBand:     DISTANCE_BANDS[0]     as DistanceBand,
  engineerId:       engineers[0].id,
};

// ── Step progress bar ──────────────────────────────────────────────────────────
function FormStepper({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {FORM_STEPS.map((label, i) => (
        <div key={i} className="flex items-center flex-1 last:flex-none">
          <div className="flex items-center gap-2 shrink-0">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
              i < current  ? "bg-blue-600 border-blue-600 text-white" :
              i === current ? "border-blue-600 text-blue-600 bg-white" :
                              "border-gray-300 text-gray-400 bg-white"
            }`}>
              {i < current ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ) : i + 1}
            </div>
            <span className={`text-xs font-semibold whitespace-nowrap ${
              i === current ? "text-blue-700" : i < current ? "text-gray-500" : "text-gray-300"
            }`}>{label}</span>
          </div>
          {i < FORM_STEPS.length - 1 && (
            <div className={`flex-1 h-px mx-3 ${i < current ? "bg-blue-400" : "bg-gray-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { tasks, refresh }              = useStore();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showForm, setShowForm]         = useState(false);
  const [formStep, setFormStep]         = useState(0);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [formError, setFormError]       = useState("");

  const approved   = tasks.filter((t) => t.status === "approved");
  const revenue    = approved.reduce((s, t) => s + (t.customerCharge ?? 0), 0);
  const profit     = approved.reduce((s, t) => s + (t.profit ?? 0), 0);
  const pendingCnt = tasks.filter((t) => t.status !== "approved").length;
  const activeEng  = new Set(
    tasks.filter((t) => t.status === "in_progress").map((t) => t.engineerId)
  ).size;

  const preview = calculateCommercial(form.maintenanceLevel, form.serviceLevel, form.distanceBand);

  const setField = <K extends keyof typeof EMPTY_FORM>(key: K, val: (typeof EMPTY_FORM)[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const canProceed = () => {
    if (formStep === 0) return form.title.trim().length > 0;
    return true;
  };

  const handleNext = () => {
    if (!canProceed()) { setFormError("Please fill in the required field."); return; }
    setFormError("");
    setFormStep((s) => Math.min(s + 1, 3));
  };

  const handleBack = () => {
    setFormError("");
    setFormStep((s) => Math.max(s - 1, 0));
  };

  const handleCreate = async () => {
    const eng = engineers.find((e) => e.id === form.engineerId)!;
    const location = form.siteRef.trim()
      ? `${form.siteRef.trim()}, ${form.city}`
      : form.city;

    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title:            form.title,
        customer:         form.customer,
        location,
        maintenanceType:  form.maintenanceType,
        maintenanceLevel: form.maintenanceLevel,
        serviceLevel:     form.serviceLevel,
        distanceBand:     form.distanceBand,
        engineerId:       eng.id,
        engineerName:     eng.name,
      }),
    });

    refresh();
    setForm(EMPTY_FORM);
    setFormStep(0);
    setShowForm(false);
    setFormError("");
  };

  const handleApprove = async (id: string) => {
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "approve" }),
    });
    const updated = await res.json() as Task;
    refresh();
    setSelectedTask(updated);
  };

  const openForm  = () => { setShowForm(true);  setFormStep(0); setForm(EMPTY_FORM); setFormError(""); };
  const closeForm = () => { setShowForm(false); setFormStep(0); setForm(EMPTY_FORM); setFormError(""); };

  return (
    <div className="max-w-screen-xl">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Operations Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Orange Business — NOC Field Service Management</p>
        </div>
        <button
          onClick={showForm ? closeForm : openForm}
          className={`flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-md border transition-colors ${
            showForm
              ? "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
              : "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
          }`}
        >
          {showForm ? (
            <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Cancel</>
          ) : (
            <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Create Task</>
          )}
        </button>
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <KpiCard label="Total Revenue" value={`$${revenue.toLocaleString()}`} sub={`${approved.length} approved tasks`} accent="bg-blue-50 text-blue-600"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}
        />
        <KpiCard label="Net Profit" value={`$${profit.toLocaleString()}`} sub="Engine-calculated margin" accent="bg-green-50 text-green-600"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>}
        />
        <KpiCard label="Open Tasks" value={pendingCnt} sub="Across all statuses" accent="bg-amber-50 text-amber-600"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
        />
        <KpiCard label="Active Engineers" value={activeEng} sub="Currently on-site" accent="bg-purple-50 text-purple-600"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
        />
      </div>

      {/* ── Step-based Task Creation Form ── */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg mb-6 overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-gray-800">Create &amp; Assign Field Task</p>
              <p className="text-xs text-gray-400 mt-0.5">Step {formStep + 1} of {FORM_STEPS.length} — {FORM_STEPS[formStep]}</p>
            </div>
            <span className="text-xs font-medium text-gray-400 bg-white border border-gray-200 px-2.5 py-1 rounded">
              Orange Business
            </span>
          </div>

          <div className="px-6 py-5">
            <FormStepper current={formStep} />

            {formError && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-xs font-medium px-3 py-2.5 rounded-md flex items-center gap-2">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {formError}
              </div>
            )}

            {/* ── Step 0: Basic Info ── */}
            {formStep === 0 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                    Task Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={form.title}
                    onChange={(e) => setField("title", e.target.value)}
                    placeholder="e.g. Fiber Link Down — Karachi Hub"
                    className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    autoFocus
                  />
                  <p className="text-xs text-gray-400 mt-1.5">Be specific — include site name or fault description</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Work Type</label>
                    <select
                      value={form.maintenanceType}
                      onChange={(e) => setField("maintenanceType", e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      {maintenanceTypes.map((m) => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Customer</label>
                    <div className="w-full border border-gray-200 rounded-md px-3 py-2.5 text-sm bg-gray-50 text-gray-600 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                      Orange Business
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 1: Location ── */}
            {formStep === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">City / Region</label>
                  <select
                    value={form.city}
                    onChange={(e) => setField("city", e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {locations.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                    Site Reference <span className="text-gray-400 font-normal normal-case">(optional)</span>
                  </label>
                  <input
                    value={form.siteRef}
                    onChange={(e) => setField("siteRef", e.target.value)}
                    placeholder="e.g. Site KHI-01, PECHS Block 6"
                    className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-400 mt-1.5">Full address: {form.siteRef ? `${form.siteRef}, ` : ""}{form.city}</p>
                </div>
              </div>
            )}

            {/* ── Step 2: Engineer ── */}
            {formStep === 2 && (
              <div>
                <p className="text-xs text-gray-500 mb-3">Select the engineer to assign this task to</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {engineers.map((eng) => (
                    <button
                      key={eng.id}
                      type="button"
                      onClick={() => setField("engineerId", eng.id)}
                      className={`p-4 rounded-lg border-2 text-left transition-colors ${
                        form.engineerId === eng.id
                          ? "border-blue-600 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300 bg-white"
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold mb-3 ${
                        form.engineerId === eng.id ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"
                      }`}>
                        {av(eng.name)}
                      </div>
                      <p className={`text-sm font-semibold leading-tight ${form.engineerId === eng.id ? "text-blue-700" : "text-gray-800"}`}>
                        {eng.name}
                      </p>
                      {form.engineerId === eng.id && (
                        <div className="flex items-center gap-1 mt-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          <span className="text-xs text-blue-600 font-medium">Selected</span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Step 3: SLA & Billing ── */}
            {formStep === 3 && (
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Maintenance Level</label>
                    <select
                      value={form.maintenanceLevel}
                      onChange={(e) => setField("maintenanceLevel", e.target.value as MaintenanceLevel)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      {MAINTENANCE_LEVELS.map((m) => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Service Level (SLA)</label>
                    <select
                      value={form.serviceLevel}
                      onChange={(e) => setField("serviceLevel", e.target.value as ServiceLevel)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      {SERVICE_LEVELS.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Distance Band</label>
                    <select
                      value={form.distanceBand}
                      onChange={(e) => setField("distanceBand", e.target.value as DistanceBand)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      {DISTANCE_BANDS.map((d) => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-200 flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Live Billing Preview</p>
                    <span className="text-xs font-mono text-gray-400">{preview.ruleKey}</span>
                  </div>
                  <div className="grid grid-cols-3 divide-x divide-gray-200">
                    <div className="px-4 py-4 text-center">
                      <p className="text-xs text-gray-400 font-medium">Customer Charge</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">${preview.customerCharge}</p>
                    </div>
                    <div className="px-4 py-4 text-center">
                      <p className="text-xs text-gray-400 font-medium">FE Cost</p>
                      <p className="text-2xl font-bold text-red-500 mt-1">${preview.feCost}</p>
                    </div>
                    <div className="px-4 py-4 text-center">
                      <p className="text-xs text-gray-400 font-medium">Profit</p>
                      <p className="text-2xl font-bold text-green-600 mt-1">${preview.profit}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Step navigation ── */}
            <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-5">
              <button
                onClick={formStep === 0 ? closeForm : handleBack}
                className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-md border border-gray-300 hover:bg-gray-50 transition-colors font-medium"
              >
                {formStep === 0 ? "Cancel" : "← Back"}
              </button>
              {formStep < 3 ? (
                <button
                  onClick={handleNext}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-md transition-colors flex items-center gap-2"
                >
                  Next: {FORM_STEPS[formStep + 1]}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                  </svg>
                </button>
              ) : (
                <button
                  onClick={handleCreate}
                  className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-5 py-2 rounded-md transition-colors flex items-center gap-2"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Create &amp; Assign Task
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Task Table ── */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Live Task Board</h2>
            <p className="text-xs text-gray-400 mt-0.5">Click any row to view full details</p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {(["assigned","in_progress","completed","approved"] as const).map((s) => {
              const cnt = tasks.filter((t) => t.status === s).length;
              return cnt > 0 ? (
                <span key={s} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLE[s]}`}>
                  {cnt} {STATUS_LABEL[s]}
                </span>
              ) : null;
            })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-semibold whitespace-nowrap w-20">ID</th>
                <th className="text-left px-4 py-3 font-semibold">Task / Work Type</th>
                <th className="text-left px-4 py-3 font-semibold">Engineer</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">SLA Rule</th>
                <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">Check In</th>
                <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">Check Out</th>
                <th className="text-left px-4 py-3 font-semibold">Dur.</th>
                <th className="text-right px-4 py-3 font-semibold">Revenue</th>
                <th className="text-right px-4 py-3 font-semibold">Profit</th>
                <th className="text-right px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tasks.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => setSelectedTask(t)}
                  className={`cursor-pointer transition-colors ${selectedTask?.id === t.id ? "bg-blue-50" : "hover:bg-gray-50"}`}
                >
                  <td className="px-4 py-3.5 font-mono text-xs text-gray-400 whitespace-nowrap">{t.id}</td>
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-gray-800 text-sm leading-tight">{t.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{t.maintenanceType}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600 shrink-0">{av(t.engineerName)}</div>
                      <p className="text-xs font-semibold text-gray-700 whitespace-nowrap">{t.engineerName}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${STATUS_STYLE[t.status]}`}>
                      {STATUS_LABEL[t.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="inline-block text-xs font-mono text-gray-500 bg-gray-100 px-2 py-1 rounded whitespace-nowrap">
                      {shortLabel(t.ruleKey)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-500 tabular-nums whitespace-nowrap">{fmt(t.checkInTime)}</td>
                  <td className="px-4 py-3.5 text-xs text-gray-500 tabular-nums whitespace-nowrap">{fmt(t.checkOutTime)}</td>
                  <td className="px-4 py-3.5 text-xs text-gray-500 tabular-nums whitespace-nowrap">{calcDuration(t.checkInTime, t.checkOutTime)}</td>
                  <td className="px-4 py-3.5 text-right font-semibold text-gray-800 whitespace-nowrap">
                    {t.customerCharge != null ? `$${t.customerCharge}` : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3.5 text-right font-semibold text-green-600 whitespace-nowrap">
                    {t.profit != null ? `$${t.profit}` : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                    {t.status === "completed" ? (
                      <button
                        onClick={() => handleApprove(t.id)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-700 text-white transition-colors whitespace-nowrap"
                      >
                        Approve
                      </button>
                    ) : (
                      <button
                        onClick={() => setSelectedTask(t)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-md border border-gray-200 hover:bg-gray-100 text-gray-600 transition-colors"
                      >
                        View
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
          <span>{tasks.length} total tasks</span>
          <span className="font-medium text-gray-600">
            Revenue: <span className="text-blue-600 font-semibold">${revenue.toLocaleString()}</span>
            <span className="mx-2 text-gray-300">|</span>
            Profit: <span className="text-green-600 font-semibold">${profit.toLocaleString()}</span>
          </span>
        </div>
      </div>

      {/* ── Task Detail Panel ── */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onApprove={handleApprove}
        />
      )}
    </div>
  );
}
