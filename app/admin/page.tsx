"use client";

import { useState, useMemo } from "react";
import {
  Task, TaskStatus,
  engineers, maintenanceTypes, locations, customers,
  MAINTENANCE_LEVELS, SERVICE_LEVELS, DISTANCE_BANDS, VISIT_DURATIONS,
  MaintenanceLevel, ServiceLevel, DistanceBand, VisitDuration,
  calcDuration, fmtDate, shortLabel,
} from "@/lib/store";
import { useStore } from "@/lib/storeContext";
import { calculateCommercial } from "@/lib/commercialEngine";

// ── Status config ──────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<TaskStatus, string> = {
  assigned:    "Assigned",
  accepted:    "Accepted",
  rejected:    "Rejected",
  in_progress: "In Progress",
  completed:   "Awaiting Approval",
  approved:    "Approved",
  cancelled:   "Cancelled",
};
const STATUS_STYLE: Record<TaskStatus, string> = {
  assigned:    "bg-blue-50 text-blue-700 border border-blue-200",
  accepted:    "bg-indigo-50 text-indigo-700 border border-indigo-200",
  rejected:    "bg-red-50 text-red-600 border border-red-200",
  in_progress: "bg-purple-50 text-purple-700 border border-purple-200",
  completed:   "bg-amber-50 text-amber-700 border border-amber-200",
  approved:    "bg-green-50 text-green-700 border border-green-200",
  cancelled:   "bg-gray-100 text-gray-500 border border-gray-300",
};

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

// ── Cancel Modal ───────────────────────────────────────────────────────────────
function CancelModal({ task, onCancel, onClose }: {
  task: Task;
  onCancel: (id: string, reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    await onCancel(task.id, reason);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h3 className="text-base font-bold text-gray-900 mb-1">Cancel Task</h3>
        <p className="text-sm text-gray-500 mb-4">
          Cancel <span className="font-semibold text-gray-700">{task.title}</span>? This cannot be undone.
        </p>
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
          Reason <span className="text-red-500">*</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Why is this task being cancelled?"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
          autoFocus
        />
        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-50">
            Keep Task
          </button>
          <button
            onClick={submit}
            disabled={!reason.trim() || busy}
            className="flex-1 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 rounded-md text-sm font-semibold text-white transition-colors"
          >
            {busy ? "Cancelling…" : "Cancel Task"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Task Modal ────────────────────────────────────────────────────────────
function EditModal({ task, onSave, onClose }: {
  task: Task;
  onSave: (id: string, patch: Partial<Task>) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle]       = useState(task.title);
  const [desc, setDesc]         = useState(task.description || "");
  const [location, setLocation] = useState(task.location);
  const [engId, setEngId]       = useState(task.engineerId);
  const [busy, setBusy]         = useState(false);

  const submit = async () => {
    setBusy(true);
    const eng = engineers.find((e) => e.id === engId)!;
    await onSave(task.id, {
      title,
      description:  desc,
      location,
      engineerId:   eng.id,
      engineerName: eng.name,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6">
        <h3 className="text-base font-bold text-gray-900 mb-4">Edit Task</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Description</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Location</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Assigned Engineer</label>
            <select
              value={engId}
              onChange={(e) => setEngId(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
            >
              {engineers.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-50">
            Discard
          </button>
          <button
            onClick={submit}
            disabled={!title.trim() || busy}
            className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 rounded-md text-sm font-semibold text-white transition-colors"
          >
            {busy ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reassign Modal ─────────────────────────────────────────────────────────────
function ReassignModal({ task, onReassign, onClose }: {
  task: Task;
  onReassign: (id: string, engineerId: string, engineerName: string) => Promise<void>;
  onClose: () => void;
}) {
  const [engId, setEngId] = useState(task.engineerId);
  const [busy, setBusy]   = useState(false);

  const submit = async () => {
    setBusy(true);
    const eng = engineers.find((e) => e.id === engId)!;
    await onReassign(task.id, eng.id, eng.name);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h3 className="text-base font-bold text-gray-900 mb-1">Reassign Task</h3>
        <p className="text-sm text-gray-500 mb-4">Choose an engineer to reassign this task to.</p>
        <select
          value={engId}
          onChange={(e) => setEngId(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white mb-4"
        >
          {engineers.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            onClick={submit}
            disabled={busy}
            className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 rounded-md text-sm font-semibold text-white transition-colors"
          >
            {busy ? "Reassigning…" : "Reassign"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Task Detail Panel ──────────────────────────────────────────────────────────
function DetailPanel({ task, onClose, onApprove, onCancelClick, onEditClick, onReassignClick }: {
  task: Task;
  onClose: () => void;
  onApprove: (id: string) => Promise<void>;
  onCancelClick: () => void;
  onEditClick: () => void;
  onReassignClick: () => void;
}) {
  const [approving, setApproving] = useState(false);
  const rates = calculateCommercial(
    task.maintenanceLevel, task.serviceLevel, task.distanceBand, task.visitDuration
  );

  const handleApprove = async () => {
    setApproving(true);
    await onApprove(task.id);
    setApproving(false);
  };

  const canCancel   = !["approved", "cancelled", "completed"].includes(task.status);
  const canEdit     = task.status === "assigned";
  const canReassign = ["rejected", "cancelled"].includes(task.status);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative bg-white border-l border-gray-200 w-full max-w-lg h-screen overflow-y-auto shadow-2xl flex flex-col">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 bg-white sticky top-0 z-10 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-mono text-gray-400">{task.id}</span>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_STYLE[task.status]}`}>
                {STATUS_LABEL[task.status]}
              </span>
              {task.invoiceNumber && (
                <span className="text-xs font-mono text-green-600 bg-green-50 px-2 py-0.5 rounded">
                  {task.invoiceNumber}
                </span>
              )}
            </div>
            <h2 className="text-base font-bold text-gray-900">{task.title}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 shrink-0 mt-0.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 p-5 space-y-5">

          {/* Task Info */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Customer</p>
              <p className="font-semibold text-gray-800">{task.customer}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Engineer</p>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center text-xs font-bold text-orange-600 shrink-0">{av(task.engineerName)}</div>
                <span className="font-semibold text-gray-800 text-xs">{task.engineerName}</span>
              </div>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Location</p>
              <p className="text-gray-700 text-xs">{task.location}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Work Type</p>
              <p className="text-gray-700 text-xs">{task.maintenanceType}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Visit Duration</p>
              <p className="text-gray-700 text-xs font-semibold">{task.visitDuration}</p>
            </div>
            {task.description && (
              <div className="col-span-2">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Description</p>
                <p className="text-gray-700 text-xs leading-relaxed">{task.description}</p>
              </div>
            )}
          </div>

          {/* Commercial Rule */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">SLA &amp; Commercial Rule</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="grid grid-cols-4 divide-x divide-gray-200 text-center">
                {[
                  { label: "Level", value: task.maintenanceLevel === "Planned Activity" ? "Planned" : "Reactive" },
                  { label: "SLA",   value: task.serviceLevel, accent: true },
                  { label: "Dist.", value: task.distanceBand },
                  { label: "Visit", value: task.visitDuration },
                ].map(({ label, value, accent }) => (
                  <div key={label} className="p-3">
                    <p className="text-xs text-gray-400 font-medium">{label}</p>
                    <p className={`text-xs font-bold mt-1 leading-tight ${accent ? "text-orange-600" : "text-gray-700"}`}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Rejection / Cancellation notice */}
          {task.status === "rejected" && task.rejectionReason && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-xs font-bold text-red-600 uppercase tracking-wide mb-1">Rejection Reason</p>
              <p className="text-sm text-red-800">{task.rejectionReason}</p>
            </div>
          )}
          {task.status === "cancelled" && task.cancelReason && (
            <div className="bg-gray-100 border border-gray-300 rounded-lg p-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Cancellation Reason</p>
              <p className="text-sm text-gray-700">{task.cancelReason}</p>
            </div>
          )}

          {/* Timeline */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Timeline</p>
            <div className="space-y-2.5">
              {[
                { label: "Created",   time: task.createdAt,    dot: "bg-gray-400" },
                { label: "Accepted",  time: task.acceptedAt,   dot: "bg-indigo-500" },
                { label: "Rejected",  time: task.rejectedAt,   dot: "bg-red-400" },
                { label: "Time In",   time: task.checkInTime,  dot: "bg-blue-500" },
                { label: "Time Out",  time: task.checkOutTime, dot: "bg-amber-500" },
                ...(task.status === "approved"
                  ? [{ label: "Approved", time: task.checkOutTime, dot: "bg-green-500" }]
                  : []),
                { label: "Cancelled", time: task.cancelledAt,  dot: "bg-gray-400" },
              ]
                .filter((ev) => ev.time)
                .map((ev, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${ev.dot}`} />
                    <span className="w-20 text-xs font-medium text-gray-700">{ev.label}</span>
                    <span className="text-xs tabular-nums text-gray-500">{fmtDate(ev.time)}</span>
                  </div>
                ))}
              {task.checkInTime && task.checkOutTime && (
                <div className="pl-5 text-xs text-gray-400 mt-1">
                  Duration: <span className="font-semibold text-gray-700">{calcDuration(task.checkInTime, task.checkOutTime)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Engineer Comments */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Engineer Comments</p>
            {task.comments ? (
              <div className="bg-blue-50 border border-blue-100 rounded-md p-3 text-sm text-gray-700 leading-relaxed">{task.comments}</div>
            ) : (
              <p className="text-xs text-gray-400 italic">No comments recorded.</p>
            )}
          </div>

          {/* AI Report */}
          {task.aiSummary && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                </svg>
                AI Visit Report
              </p>
              <div className="bg-purple-50 border border-purple-200 rounded-md p-3 text-xs text-purple-900 leading-relaxed whitespace-pre-wrap">{task.aiSummary}</div>
            </div>
          )}

          {/* Billing */}
          {["completed", "approved"].includes(task.status) && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Billing {task.status === "completed" ? <span className="text-amber-500 ml-1">(Pending Approval)</span> : null}
              </p>
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="grid grid-cols-3 divide-x divide-gray-200 text-center">
                  <div className="p-4">
                    <p className="text-xs text-gray-400 font-medium">Revenue</p>
                    <p className="text-xl font-bold text-gray-900 mt-0.5">${task.customerChargeUSD ?? rates.customerChargeUSD}</p>
                  </div>
                  <div className="p-4">
                    <p className="text-xs text-gray-400 font-medium">FE Payment</p>
                    <p className="text-xl font-bold text-red-500 mt-0.5">${task.engineerPaymentUSD ?? rates.engineerPaymentUSD}</p>
                  </div>
                  <div className="p-4">
                    <p className="text-xs text-gray-400 font-medium">Profit</p>
                    <p className="text-xl font-bold text-green-600 mt-0.5">${task.profit ?? rates.profit}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-gray-200 bg-gray-50 sticky bottom-0 space-y-2">
          {task.status === "completed" && (
            <button
              onClick={handleApprove}
              disabled={approving}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold text-sm py-3 rounded-md transition-colors flex items-center justify-center gap-2"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              {approving ? "Approving…" : "Approve & Generate Invoice"}
            </button>
          )}
          {task.status === "approved" && (
            <div className="flex items-center justify-center gap-2 text-sm text-green-700 font-semibold py-1">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Approved — {task.invoiceNumber}
            </div>
          )}
          <div className="flex gap-2">
            {canEdit && (
              <button onClick={onEditClick} className="flex-1 text-sm font-medium py-2 rounded-md border border-gray-300 hover:bg-white text-gray-600 transition-colors">
                Edit Task
              </button>
            )}
            {canReassign && (
              <button onClick={onReassignClick} className="flex-1 text-sm font-medium py-2 rounded-md border border-orange-300 hover:bg-orange-50 text-orange-600 transition-colors">
                Reassign
              </button>
            )}
            {canCancel && (
              <button onClick={onCancelClick} className="flex-1 text-sm font-medium py-2 rounded-md border border-red-200 hover:bg-red-50 text-red-600 transition-colors">
                Cancel Task
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Create Task Form ───────────────────────────────────────────────────────────
const FORM_STEPS = ["Basic Info", "Location & Desc", "Engineer", "SLA & Billing"];

const EMPTY_FORM = {
  title:            "",
  description:      "",
  customer:         customers[0].name,
  city:             locations[0],
  siteRef:          "",
  maintenanceType:  maintenanceTypes[0],
  maintenanceLevel: MAINTENANCE_LEVELS[0] as MaintenanceLevel,
  serviceLevel:     SERVICE_LEVELS[0]     as ServiceLevel,
  distanceBand:     DISTANCE_BANDS[0]     as DistanceBand,
  visitDuration:    VISIT_DURATIONS[0]    as VisitDuration,
  engineerId:       engineers[0].id,
};

function FormStepper({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {FORM_STEPS.map((label, i) => (
        <div key={i} className="flex items-center flex-1 last:flex-none">
          <div className="flex items-center gap-2 shrink-0">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
              i < current  ? "bg-orange-500 border-orange-500 text-white" :
              i === current ? "border-orange-500 text-orange-600 bg-white" :
                              "border-gray-300 text-gray-400 bg-white"
            }`}>
              {i < current ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ) : i + 1}
            </div>
            <span className={`text-xs font-semibold whitespace-nowrap hidden sm:block ${
              i === current ? "text-orange-600" : i < current ? "text-gray-500" : "text-gray-300"
            }`}>{label}</span>
          </div>
          {i < FORM_STEPS.length - 1 && (
            <div className={`flex-1 h-px mx-3 ${i < current ? "bg-orange-300" : "bg-gray-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { tasks, refresh } = useStore();

  // UI state
  const [selectedTask, setSelectedTask]     = useState<Task | null>(null);
  const [showForm, setShowForm]             = useState(false);
  const [formStep, setFormStep]             = useState(0);
  const [form, setForm]                     = useState(EMPTY_FORM);
  const [formError, setFormError]           = useState("");
  const [cancelTarget, setCancelTarget]     = useState<Task | null>(null);
  const [editTarget, setEditTarget]         = useState<Task | null>(null);
  const [reassignTarget, setReassignTarget] = useState<Task | null>(null);

  // Filters
  const [search, setSearch]               = useState("");
  const [statusFilter, setStatusFilter]   = useState<TaskStatus | "">("");
  const [engineerFilter, setEngineerFilter] = useState("");

  // KPIs
  const approved   = tasks.filter((t) => t.status === "approved");
  const revenue    = approved.reduce((s, t) => s + (t.customerChargeUSD ?? 0), 0);
  const profit     = approved.reduce((s, t) => s + (t.profit ?? 0), 0);
  const activeCnt  = tasks.filter((t) => !["approved", "cancelled", "rejected"].includes(t.status)).length;
  const activeEng  = new Set(tasks.filter((t) => t.status === "in_progress").map((t) => t.engineerId)).size;

  // Filtered tasks
  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      const q = search.toLowerCase();
      const matchSearch = !q || (
        t.title.toLowerCase().includes(q) ||
        t.customer.toLowerCase().includes(q) ||
        t.engineerName.toLowerCase().includes(q) ||
        t.location.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q)
      );
      const matchStatus  = !statusFilter  || t.status === statusFilter;
      const matchEngineer = !engineerFilter || t.engineerId === engineerFilter;
      return matchSearch && matchStatus && matchEngineer;
    });
  }, [tasks, search, statusFilter, engineerFilter]);

  const preview = calculateCommercial(
    form.maintenanceLevel, form.serviceLevel, form.distanceBand, form.visitDuration
  );

  const setField = <K extends keyof typeof EMPTY_FORM>(key: K, val: (typeof EMPTY_FORM)[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const canProceed = () => formStep === 0 ? form.title.trim().length > 0 : true;

  const handleNext = () => {
    if (!canProceed()) { setFormError("Task title is required."); return; }
    setFormError("");
    setFormStep((s) => Math.min(s + 1, 3));
  };

  const handleCreate = async () => {
    const eng = engineers.find((e) => e.id === form.engineerId)!;
    const location = form.siteRef.trim() ? `${form.siteRef.trim()}, ${form.city}` : form.city;

    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title:            form.title,
        description:      form.description,
        customer:         form.customer,
        location,
        maintenanceType:  form.maintenanceType,
        maintenanceLevel: form.maintenanceLevel,
        serviceLevel:     form.serviceLevel,
        distanceBand:     form.distanceBand,
        visitDuration:    form.visitDuration,
        engineerId:       eng.id,
        engineerName:     eng.name,
      }),
    });

    refresh();
    setForm(EMPTY_FORM);
    setFormStep(0);
    setShowForm(false);
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

  const handleCancel = async (id: string, cancelReason: string) => {
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "cancel", cancelReason }),
    });
    refresh();
    setSelectedTask(null);
  };

  const handleEdit = async (id: string, patch: Partial<Task>) => {
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    const updated = await res.json() as Task;
    refresh();
    setSelectedTask(updated);
  };

  const handleReassign = async (id: string, engineerId: string, engineerName: string) => {
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "reassign", engineerId, engineerName }),
    });
    const updated = await res.json() as Task;
    refresh();
    setSelectedTask(updated);
  };

  const closeForm  = () => { setShowForm(false); setFormStep(0); setForm(EMPTY_FORM); setFormError(""); };
  const openForm   = () => { setShowForm(true);  setFormStep(0); setForm(EMPTY_FORM); setFormError(""); };

  return (
    <div className="max-w-screen-xl">

      {/* ── Page Header ── */}
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
              : "bg-orange-500 text-white border-orange-500 hover:bg-orange-600"
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
        <KpiCard label="Total Revenue" value={`$${revenue.toLocaleString()}`} sub={`${approved.length} approved tasks`} accent="bg-orange-50 text-orange-500"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}
        />
        <KpiCard label="Net Profit" value={`$${profit.toLocaleString()}`} sub="Engine-calculated margin" accent="bg-green-50 text-green-600"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>}
        />
        <KpiCard label="Active Tasks" value={activeCnt} sub="Across all open statuses" accent="bg-amber-50 text-amber-600"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
        />
        <KpiCard label="Engineers On Site" value={activeEng} sub="Currently in progress" accent="bg-purple-50 text-purple-600"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
        />
      </div>

      {/* ── Create Task Form ── */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg mb-6 overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-gray-800">Create &amp; Assign Field Task</p>
              <p className="text-xs text-gray-400 mt-0.5">Step {formStep + 1} of {FORM_STEPS.length} — {FORM_STEPS[formStep]}</p>
            </div>
            <span className="text-xs font-medium text-gray-400 bg-white border border-gray-200 px-2.5 py-1 rounded">Orange Business</span>
          </div>
          <div className="px-6 py-5">
            <FormStepper current={formStep} />

            {formError && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-xs font-medium px-3 py-2.5 rounded-md flex items-center gap-2">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {formError}
              </div>
            )}

            {/* Step 0: Basic Info */}
            {formStep === 0 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Task Title <span className="text-red-500">*</span></label>
                  <input
                    value={form.title}
                    onChange={(e) => setField("title", e.target.value)}
                    placeholder="e.g. Fiber Link Down — Karachi Hub"
                    className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Work Type</label>
                    <select value={form.maintenanceType} onChange={(e) => setField("maintenanceType", e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white">
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

            {/* Step 1: Location & Description */}
            {formStep === 1 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">City / Region</label>
                    <select value={form.city} onChange={(e) => setField("city", e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white">
                      {locations.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Site Reference <span className="text-gray-400 font-normal">(optional)</span></label>
                    <input value={form.siteRef} onChange={(e) => setField("siteRef", e.target.value)}
                      placeholder="e.g. Site KHI-01" className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Description <span className="text-gray-400 font-normal">(optional)</span></label>
                  <textarea value={form.description} onChange={(e) => setField("description", e.target.value)}
                    rows={3} placeholder="Detailed task instructions for the engineer…"
                    className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none" />
                </div>
                <p className="text-xs text-gray-400">Full address: {form.siteRef ? `${form.siteRef}, ` : ""}{form.city}</p>
              </div>
            )}

            {/* Step 2: Engineer */}
            {formStep === 2 && (
              <div>
                <p className="text-xs text-gray-500 mb-3">Select the engineer to assign this task to</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {engineers.map((eng) => (
                    <button key={eng.id} type="button" onClick={() => setField("engineerId", eng.id)}
                      className={`p-4 rounded-lg border-2 text-left transition-colors ${
                        form.engineerId === eng.id ? "border-orange-500 bg-orange-50" : "border-gray-200 hover:border-gray-300 bg-white"
                      }`}>
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold mb-3 ${
                        form.engineerId === eng.id ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-600"
                      }`}>{av(eng.name)}</div>
                      <p className={`text-sm font-semibold leading-tight ${form.engineerId === eng.id ? "text-orange-700" : "text-gray-800"}`}>{eng.name}</p>
                      {form.engineerId === eng.id && (
                        <div className="flex items-center gap-1 mt-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                          <span className="text-xs text-orange-600 font-medium">Selected</span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3: SLA & Billing */}
            {formStep === 3 && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Maintenance</label>
                    <select value={form.maintenanceLevel} onChange={(e) => setField("maintenanceLevel", e.target.value as MaintenanceLevel)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white">
                      {MAINTENANCE_LEVELS.map((m) => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">SLA</label>
                    <select value={form.serviceLevel} onChange={(e) => setField("serviceLevel", e.target.value as ServiceLevel)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white">
                      {SERVICE_LEVELS.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Distance</label>
                    <select value={form.distanceBand} onChange={(e) => setField("distanceBand", e.target.value as DistanceBand)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white">
                      {DISTANCE_BANDS.map((d) => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Visit Duration</label>
                    <select value={form.visitDuration} onChange={(e) => setField("visitDuration", e.target.value as VisitDuration)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white">
                      {VISIT_DURATIONS.map((d) => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-200">
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Live Billing Preview</p>
                  </div>
                  <div className="grid grid-cols-3 divide-x divide-gray-200">
                    <div className="px-4 py-4 text-center">
                      <p className="text-xs text-gray-400 font-medium">Customer Charge</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">${preview.customerChargeUSD}</p>
                    </div>
                    <div className="px-4 py-4 text-center">
                      <p className="text-xs text-gray-400 font-medium">FE Payment</p>
                      <p className="text-2xl font-bold text-red-500 mt-1">${preview.engineerPaymentUSD}</p>
                    </div>
                    <div className="px-4 py-4 text-center">
                      <p className="text-xs text-gray-400 font-medium">Profit</p>
                      <p className="text-2xl font-bold text-green-600 mt-1">${preview.profit}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Nav buttons */}
            <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-5">
              <button onClick={formStep === 0 ? closeForm : () => { setFormError(""); setFormStep((s) => s - 1); }}
                className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-md border border-gray-300 hover:bg-gray-50 transition-colors font-medium">
                {formStep === 0 ? "Cancel" : "← Back"}
              </button>
              {formStep < 3 ? (
                <button onClick={handleNext}
                  className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-5 py-2 rounded-md transition-colors flex items-center gap-2">
                  Next: {FORM_STEPS[formStep + 1]}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                  </svg>
                </button>
              ) : (
                <button onClick={handleCreate}
                  className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-5 py-2 rounded-md transition-colors flex items-center gap-2">
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

      {/* ── Filters ── */}
      <div className="bg-white border border-gray-200 rounded-lg mb-4 px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks, engineers, locations…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TaskStatus | "")}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white text-gray-600">
          <option value="">All Statuses</option>
          {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
        <select value={engineerFilter} onChange={(e) => setEngineerFilter(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white text-gray-600">
          <option value="">All Engineers</option>
          {engineers.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        {(search || statusFilter || engineerFilter) && (
          <button onClick={() => { setSearch(""); setStatusFilter(""); setEngineerFilter(""); }}
            className="text-xs text-orange-600 hover:text-orange-700 font-medium whitespace-nowrap">
            Clear filters
          </button>
        )}
        <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">{filtered.length} of {tasks.length} tasks</span>
      </div>

      {/* ── Task Table ── */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Live Task Board</h2>
            <p className="text-xs text-gray-400 mt-0.5">Click any row to view full details</p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {(["assigned","accepted","in_progress","completed","approved"] as const).map((s) => {
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
                <th className="text-left px-4 py-3 font-semibold w-20">ID</th>
                <th className="text-left px-4 py-3 font-semibold">Task</th>
                <th className="text-left px-4 py-3 font-semibold">Engineer</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-left px-4 py-3 font-semibold">SLA Rule</th>
                <th className="text-left px-4 py-3 font-semibold">Check In</th>
                <th className="text-left px-4 py-3 font-semibold">Duration</th>
                <th className="text-right px-4 py-3 font-semibold">Revenue</th>
                <th className="text-right px-4 py-3 font-semibold">Profit</th>
                <th className="text-right px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-14 text-center text-sm text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                      </svg>
                      No tasks match your filters
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((t) => (
                  <tr key={t.id} onClick={() => setSelectedTask(t)}
                    className={`cursor-pointer transition-colors ${selectedTask?.id === t.id ? "bg-orange-50" : "hover:bg-gray-50"}`}>
                    <td className="px-4 py-3.5 font-mono text-xs text-gray-400 whitespace-nowrap">{t.id}</td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-gray-800 text-sm leading-tight">{t.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{t.maintenanceType} · {t.location}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center text-xs font-bold text-orange-600 shrink-0">{av(t.engineerName)}</div>
                        <p className="text-xs font-semibold text-gray-700 whitespace-nowrap">{t.engineerName}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${STATUS_STYLE[t.status]}`}>
                        {STATUS_LABEL[t.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-1 rounded whitespace-nowrap">
                        {shortLabel(t.ruleKey)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-500 tabular-nums whitespace-nowrap">
                      {t.checkInTime ? fmtDate(t.checkInTime) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-500 tabular-nums whitespace-nowrap">
                      {t.duration || calcDuration(t.checkInTime, t.checkOutTime)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold text-gray-800 whitespace-nowrap">
                      {t.customerChargeUSD != null ? `$${t.customerChargeUSD}` : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold text-green-600 whitespace-nowrap">
                      {t.profit != null ? `$${t.profit}` : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                      {t.status === "completed" ? (
                        <button onClick={() => handleApprove(t.id)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-700 text-white transition-colors whitespace-nowrap">
                          Approve
                        </button>
                      ) : (
                        <button onClick={() => setSelectedTask(t)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-md border border-gray-200 hover:bg-gray-100 text-gray-600 transition-colors">
                          View
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
          <span>{tasks.length} total tasks</span>
          <span className="font-medium text-gray-600">
            Revenue: <span className="text-orange-600 font-semibold">${revenue.toLocaleString()}</span>
            <span className="mx-2 text-gray-300">|</span>
            Profit: <span className="text-green-600 font-semibold">${profit.toLocaleString()}</span>
          </span>
        </div>
      </div>

      {/* ── Detail Panel ── */}
      {selectedTask && (
        <DetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onApprove={handleApprove}
          onCancelClick={() => setCancelTarget(selectedTask)}
          onEditClick={() => setEditTarget(selectedTask)}
          onReassignClick={() => setReassignTarget(selectedTask)}
        />
      )}

      {/* ── Cancel Modal ── */}
      {cancelTarget && (
        <CancelModal
          task={cancelTarget}
          onCancel={handleCancel}
          onClose={() => setCancelTarget(null)}
        />
      )}

      {/* ── Edit Modal ── */}
      {editTarget && (
        <EditModal
          task={editTarget}
          onSave={handleEdit}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* ── Reassign Modal ── */}
      {reassignTarget && (
        <ReassignModal
          task={reassignTarget}
          onReassign={handleReassign}
          onClose={() => setReassignTarget(null)}
        />
      )}
    </div>
  );
}
