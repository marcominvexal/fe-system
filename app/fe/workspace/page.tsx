"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { engineers, Task, calcDuration } from "@/lib/store";

// ── Gemini call ───────────────────────────────────────────────────────────────
async function callGemini(rawNotes: string, task: Task): Promise<string> {
  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      notes: rawNotes,
      task: {
        title:           task.title,
        customer:        task.customer,
        location:        task.location,
        maintenanceType: task.maintenanceType,
        serviceLevel:    task.serviceLevel,
      },
    }),
  });
  const data = await res.json() as { text?: string; error?: string };
  if (!res.ok || !data.text) throw new Error(data.error ?? "AI unavailable");
  return data.text;
}

// ── Elapsed timer ─────────────────────────────────────────────────────────────
function useElapsed(startISO: string | undefined) {
  const [elapsed, setElapsed] = useState("0:00");
  useEffect(() => {
    if (!startISO) return;
    const tick = () => {
      const secs = Math.floor((Date.now() - new Date(startISO).getTime()) / 1000);
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      setElapsed(h > 0
        ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
        : `${m}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startISO]);
  return elapsed;
}

function slaBadge(sl: string) {
  if (sl.startsWith("24x7")) return "bg-red-100 text-red-700";
  if (sl.includes("4h"))    return "bg-amber-100 text-amber-700";
  return "bg-blue-100 text-blue-700";
}

function av(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

// ── Screen type ───────────────────────────────────────────────────────────────
type Screen = "queue" | "detail" | "working" | "done";

// ── Reject modal ──────────────────────────────────────────────────────────────
function RejectModal({ task, onReject, onClose }: {
  task: Task;
  onReject: (id: string, reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const REASONS = [
    "Outside my service area",
    "Not trained for this equipment",
    "Schedule conflict",
    "Safety concern at site",
    "Task description incomplete",
    "Other",
  ];
  const [reason, setReason] = useState(REASONS[0]);
  const [custom, setCustom] = useState("");
  const [busy, setBusy]     = useState(false);

  const finalReason = reason === "Other" ? custom : reason;

  const submit = async () => {
    if (!finalReason.trim()) return;
    setBusy(true);
    await onReject(task.id, finalReason);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-gray-900">Reject Task</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Why are you rejecting <span className="font-semibold text-gray-700">{task.title}</span>?
        </p>

        <div className="space-y-2 mb-4">
          {REASONS.map((r) => (
            <button key={r} onClick={() => setReason(r)}
              className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-medium transition-colors ${
                reason === r ? "border-red-500 bg-red-50 text-red-700" : "border-gray-200 text-gray-700 hover:border-gray-300"
              }`}>
              {r}
            </button>
          ))}
        </div>

        {reason === "Other" && (
          <textarea
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Describe your reason…"
            rows={3}
            autoFocus
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none mb-4"
          />
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 border border-gray-300 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || (reason === "Other" && !custom.trim())}
            className="flex-1 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-40 rounded-xl text-sm font-bold text-white transition-colors"
          >
            {busy ? "Submitting…" : "Reject Task"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main workspace ────────────────────────────────────────────────────────────
function WorkspaceInner() {
  const searchParams  = useSearchParams();
  const router        = useRouter();
  const engineerId    = searchParams.get("engineer") ?? engineers[0].id;
  const engineer      = engineers.find((e) => e.id === engineerId) ?? engineers[0];

  const [tasks, setTasks]         = useState<Task[]>([]);
  const [screen, setScreen]       = useState<Screen>("queue");
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [notes, setNotes]         = useState("");
  const [aiReport, setAiReport]   = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError]     = useState("");
  const [rejectTarget, setRejectTarget] = useState<Task | null>(null);
  const [checkInTime, setCheckInTime]   = useState<string | undefined>();
  const elapsed = useElapsed(screen === "working" ? checkInTime : undefined);

  const fetchTasks = useCallback(async () => {
    try {
      const res  = await fetch("/api/tasks");
      const data = await res.json() as Task[];
      setTasks(data);
    } catch { /* network error */ }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // Auto-poll while on queue screen to pick up admin assignments
  useEffect(() => {
    if (screen !== "queue") return;
    const id = setInterval(fetchTasks, 10_000);
    return () => clearInterval(id);
  }, [screen, fetchTasks]);

  const myTasks = tasks.filter(
    (t) => t.engineerId === engineerId && ["assigned", "accepted", "in_progress"].includes(t.status)
  );

  // ── Actions ──────────────────────────────────────────────────────────────────

  const patchTask = async (id: string, body: object): Promise<Task> => {
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    return await res.json() as Task;
  };

  const handleSelectTask = (task: Task) => {
    setActiveTask(task);
    // If already in progress, jump to working screen
    if (task.status === "in_progress") {
      setCheckInTime(task.checkInTime);
      setScreen("working");
    } else {
      setScreen("detail");
    }
  };

  const handleAccept = async () => {
    if (!activeTask) return;
    const updated = await patchTask(activeTask.id, { action: "accept" });
    setActiveTask(updated);
    await fetchTasks();
  };

  const handleReject = async (id: string, reason: string) => {
    await patchTask(id, { action: "reject", rejectionReason: reason });
    await fetchTasks();
    setRejectTarget(null);
    setActiveTask(null);
    setScreen("queue");
  };

  const handleStartWork = async () => {
    if (!activeTask) return;
    const updated = await patchTask(activeTask.id, { action: "start" });
    setCheckInTime(updated.checkInTime ?? new Date().toISOString());
    setActiveTask(updated);
    await fetchTasks();
    setScreen("working");
  };

  const handleImproveNotes = async () => {
    if (!activeTask) return;
    setAiLoading(true);
    setAiError("");
    try {
      const report = await callGemini(notes, activeTask);
      setAiReport(report);
    } catch {
      setAiError("AI unavailable — your notes will be saved as-is.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleFinish = async () => {
    if (!activeTask) return;
    const updated = await patchTask(activeTask.id, {
      action:   "finish",
      comments: notes || undefined,
      aiSummary: aiReport || undefined,
    });
    setActiveTask(updated);
    await fetchTasks();
    setScreen("done");
  };

  const handleReset = () => {
    setScreen("queue");
    setActiveTask(null);
    setNotes("");
    setAiReport("");
    setAiError("");
    setCheckInTime(undefined);
    fetchTasks();
  };

  // ── Queue ────────────────────────────────────────────────────────────────────
  if (screen === "queue") {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col">
        {/* Header */}
        <div className="bg-blue-700 text-white px-5 pt-10 pb-6">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-medium text-blue-300 uppercase tracking-widest">FE Portal</p>
            <button onClick={() => router.push("/fe")}
              className="text-xs text-blue-300 hover:text-white font-medium flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
              </svg>
              Switch
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-lg font-bold backdrop-blur-sm">
              {av(engineer.name)}
            </div>
            <div>
              <h1 className="text-xl font-bold">{engineer.name}</h1>
              <p className="text-sm text-blue-200">Field Engineer</p>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center gap-6 text-center">
          {[
            { label: "Assigned", count: myTasks.filter((t) => t.status === "assigned").length, color: "text-blue-600" },
            { label: "Accepted", count: myTasks.filter((t) => t.status === "accepted").length, color: "text-indigo-600" },
            { label: "On Site",  count: myTasks.filter((t) => t.status === "in_progress").length, color: "text-purple-600" },
          ].map((s) => (
            <div key={s.label} className="flex-1">
              <p className={`text-xl font-bold ${s.color}`}>{s.count}</p>
              <p className="text-xs text-gray-400 font-medium">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Task list */}
        <div className="flex-1 px-4 py-5 space-y-3 max-w-lg mx-auto w-full">
          {myTasks.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center shadow-sm">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <p className="text-base font-semibold text-gray-700">All clear!</p>
              <p className="text-sm text-gray-400 mt-1">No tasks assigned right now.</p>
              <button onClick={fetchTasks} className="mt-4 text-xs text-blue-600 font-medium hover:underline">Refresh</button>
            </div>
          ) : (
            myTasks.map((task) => (
              <div key={task.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 pt-5 pb-3">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    {task.status === "in_progress" && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-100 text-purple-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                        On Site
                      </span>
                    )}
                    {task.status === "accepted" && (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700">Accepted</span>
                    )}
                    {task.status === "assigned" && (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">New Task</span>
                    )}
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${slaBadge(task.serviceLevel)}`}>
                      {task.serviceLevel}
                    </span>
                  </div>

                  <h2 className="text-base font-bold text-gray-900 leading-snug mb-2">{task.title}</h2>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                      </svg>
                      <span className="font-medium">{task.customer}</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-gray-500">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                      </svg>
                      <span>{task.location}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                      </svg>
                      {task.maintenanceType} · {task.visitDuration}
                    </div>
                  </div>
                </div>

                <div className="px-5 pb-5">
                  <button
                    onClick={() => handleSelectTask(task)}
                    className="w-full py-3.5 rounded-xl font-bold text-sm transition-colors bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2"
                  >
                    {task.status === "in_progress" ? "Resume Task" :
                     task.status === "accepted"    ? "Start Work"  : "View Task"}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // ── Task Detail (before start) ───────────────────────────────────────────────
  if (screen === "detail" && activeTask) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col">
        {/* Top bar */}
        <div className="bg-white border-b border-gray-200 px-5 h-14 flex items-center gap-3 sticky top-0 z-10">
          <button onClick={() => { setActiveTask(null); setScreen("queue"); }} className="text-blue-600 p-1 -ml-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
            </svg>
          </button>
          <p className="text-sm font-semibold text-gray-700 flex-1">Task Details</p>
          <span className="text-xs font-mono text-gray-400">{activeTask.id}</span>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-5 max-w-lg mx-auto w-full space-y-4">
          {/* Header card */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${slaBadge(activeTask.serviceLevel)}`}>
                {activeTask.serviceLevel}
              </span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
                {activeTask.maintenanceType}
              </span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700">
                {activeTask.visitDuration}
              </span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">{activeTask.title}</h2>

            {activeTask.description && (
              <p className="text-sm text-gray-600 bg-blue-50 rounded-lg px-4 py-3 mb-4 leading-relaxed">
                {activeTask.description}
              </p>
            )}

            <div className="space-y-3 text-sm">
              {[
                { icon: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8", label: "Customer", value: activeTask.customer },
                { icon: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6", label: "Location", value: activeTask.location },
                { icon: "M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6", label: "SLA", value: `${activeTask.serviceLevel} · ${activeTask.distanceBand}` },
              ].map(({ icon, label, value }) => (
                <div key={label} className="flex gap-3">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                    <path d={icon} />
                  </svg>
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
                    <p className="font-semibold text-gray-800 mt-0.5">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Placeholders */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Pre-Visit Checklist</p>
            <div className="space-y-2">
              {[
                { label: "📍 Location verified",  done: true },
                { label: "🔧 Equipment checked",  done: true },
                { label: "📸 Camera ready",       done: false },
              ].map(({ label, done }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${done ? "bg-green-100" : "bg-gray-100"}`}>
                    {done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                  <span className={`text-sm ${done ? "text-gray-700" : "text-gray-400"}`}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-4 space-y-2">
          {activeTask.status === "assigned" && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setRejectTarget(activeTask)}
                className="py-3.5 rounded-2xl font-bold text-base border-2 border-red-500 text-red-600 hover:bg-red-50 transition-colors"
              >
                Reject
              </button>
              <button
                onClick={handleAccept}
                className="py-3.5 rounded-2xl font-bold text-base bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
              >
                Accept ✓
              </button>
            </div>
          )}
          {activeTask.status === "accepted" && (
            <button
              onClick={handleStartWork}
              className="w-full py-4 rounded-2xl font-bold text-base bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center justify-center gap-3"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>
              </svg>
              Time In — Start Work
            </button>
          )}
        </div>

        {/* Reject Modal */}
        {rejectTarget && (
          <RejectModal
            task={rejectTarget}
            onReject={handleReject}
            onClose={() => setRejectTarget(null)}
          />
        )}
      </div>
    );
  }

  // ── Working ──────────────────────────────────────────────────────────────────
  if (screen === "working" && activeTask) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col">
        {/* On-site header */}
        <div className="bg-blue-700 text-white px-5 pt-8 pb-5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-blue-300 uppercase tracking-widest">On Site</span>
            <span className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              LIVE
            </span>
          </div>
          <h2 className="text-xl font-bold leading-tight">{activeTask.title}</h2>
          <p className="text-sm text-blue-300 mt-0.5">{activeTask.customer} · {activeTask.location}</p>

          {/* Timer */}
          <div className="mt-4 bg-blue-600/50 rounded-2xl px-5 py-4 text-center">
            <p className="text-xs text-blue-300 font-medium uppercase tracking-widest mb-1">Time on Site</p>
            <p className="text-4xl font-bold font-mono tracking-tight">{elapsed}</p>
          </div>
        </div>

        <div className="flex-1 px-4 py-5 max-w-lg mx-auto w-full space-y-4">
          {/* Notes */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-widest mb-3">Work Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={6}
              placeholder="Describe what you did, parts replaced, issues found, equipment condition…"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none leading-relaxed"
            />
            <button
              onClick={handleImproveNotes}
              disabled={aiLoading || !notes.trim()}
              className={`mt-3 w-full py-3 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2 ${
                aiLoading || !notes.trim()
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-purple-600 hover:bg-purple-700 text-white"
              }`}
            >
              {aiLoading ? (
                <><svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Generating report…</>
              ) : (
                <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>Improve Notes with AI</>
              )}
            </button>
            {aiError && <p className="mt-2 text-xs text-red-500 text-center">{aiError}</p>}
          </div>

          {/* AI Report */}
          {aiReport && (
            <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                </svg>
                <p className="text-xs font-bold text-purple-700 uppercase tracking-widest">AI Report</p>
              </div>
              <pre className="text-xs text-purple-900 whitespace-pre-wrap leading-relaxed font-sans">{aiReport}</pre>
            </div>
          )}

          {/* Photo placeholder */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <p className="text-xs font-bold text-gray-700 uppercase tracking-widest mb-3">Photos</p>
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              <p className="text-sm text-gray-400 font-medium">Photo upload</p>
              <p className="text-xs text-gray-300 mt-0.5">Coming soon</p>
            </div>
          </div>

          {/* Location placeholder */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <p className="text-xs font-bold text-gray-700 uppercase tracking-widest mb-3">Location</p>
            <div className="bg-gray-100 rounded-xl p-5 text-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              <p className="text-sm text-gray-400 font-medium">{activeTask.location}</p>
              <p className="text-xs text-gray-300 mt-0.5">GPS tracking coming soon</p>
            </div>
          </div>
        </div>

        {/* Finish button */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-4">
          <button
            onClick={handleFinish}
            className="w-full py-4 rounded-2xl font-bold text-base bg-green-600 hover:bg-green-700 text-white transition-colors flex items-center justify-center gap-3"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Time Out — Finish Work
          </button>
        </div>
      </div>
    );
  }

  // ── Done ─────────────────────────────────────────────────────────────────────
  if (screen === "done" && activeTask) {
    const duration = activeTask.duration || calcDuration(activeTask.checkInTime, activeTask.checkOutTime);
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col">
        <div className="bg-green-600 text-white px-5 pt-10 pb-8 text-center">
          <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h2 className="text-2xl font-bold">Task Complete!</h2>
          <p className="text-green-200 mt-1 text-sm">Report submitted for admin approval</p>
        </div>

        <div className="flex-1 px-4 py-5 max-w-lg mx-auto w-full space-y-4">
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Visit Summary</p>
            </div>
            <div className="px-5 py-4 grid grid-cols-2 gap-4 text-sm">
              <div className="col-span-2">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Task</p>
                <p className="font-semibold text-gray-800 mt-0.5 leading-tight">{activeTask.title}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Duration</p>
                <p className="font-bold text-blue-600 text-lg mt-0.5">{duration}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Status</p>
                <span className="inline-flex items-center gap-1.5 mt-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                  Awaiting Approval
                </span>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Time In</p>
                <p className="font-medium text-gray-700 mt-0.5 text-xs">
                  {activeTask.checkInTime ? new Date(activeTask.checkInTime).toLocaleString("en-GB", { timeStyle: "short", dateStyle: "short" }) : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Time Out</p>
                <p className="font-medium text-gray-700 mt-0.5 text-xs">
                  {activeTask.checkOutTime ? new Date(activeTask.checkOutTime).toLocaleString("en-GB", { timeStyle: "short", dateStyle: "short" }) : "—"}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4">
            <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-2">What happens next?</p>
            <p className="text-sm text-blue-800 leading-relaxed">
              Your report has been submitted. An admin will review and approve it shortly.
              Once approved, billing will be calculated automatically under the <span className="font-semibold">{activeTask.serviceLevel}</span> SLA ({activeTask.visitDuration}).
            </p>
          </div>

          {(aiReport || activeTask.aiSummary) && (
            <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                </svg>
                <p className="text-xs font-bold text-purple-700 uppercase tracking-widest">AI Site Report</p>
              </div>
              <pre className="text-xs text-purple-900 whitespace-pre-wrap leading-relaxed font-sans">
                {aiReport || activeTask.aiSummary}
              </pre>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-4">
          <button
            onClick={handleReset}
            className="w-full py-4 rounded-2xl font-bold text-base bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            Back to My Tasks
          </button>
        </div>
      </div>
    );
  }

  return null;
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-blue-700 flex items-center justify-center">
        <div className="text-white text-sm font-medium">Loading workspace…</div>
      </div>
    }>
      <WorkspaceInner />
    </Suspense>
  );
}
