"use client";

import { useState, useEffect } from "react";
import { engineers, calcDuration, Task } from "@/lib/store";
import { useStore } from "@/lib/storeContext";

// ─── Engineer picker (demo only — replaces auth) ──────────────────────────────
const DEFAULT_ENGINEER = engineers[0];

// ─── Gemini AI note improvement ───────────────────────────────────────────────
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
  if (!res.ok) throw new Error(data.error ?? `API error: ${res.status}`);
  if (!data.text) throw new Error("Empty response from AI");
  return data.text;
}

// ─── Step type ────────────────────────────────────────────────────────────────
type Step = "queue" | "detail" | "working" | "done";

// ─── Elapsed timer hook ───────────────────────────────────────────────────────
function useElapsed(startISO: string | undefined) {
  const [elapsed, setElapsed] = useState("0:00");
  useEffect(() => {
    if (!startISO) return;
    const tick = () => {
      const secs = Math.floor(
        (Date.now() - new Date(startISO).getTime()) / 1000
      );
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      setElapsed(
        h > 0
          ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
          : `${m}:${String(s).padStart(2, "0")}`
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startISO]);
  return elapsed;
}

// ─── SLA badge colour ─────────────────────────────────────────────────────────
function slaBadge(sl: string) {
  if (sl.startsWith("24x7")) return "bg-red-100 text-red-700";
  if (sl.includes("4h")) return "bg-amber-100 text-amber-700";
  return "bg-blue-100 text-blue-700";
}

// ─── Step progress bar ────────────────────────────────────────────────────────
const WORKSPACE_STEPS = ["Task Queue", "Task Details", "On Site", "Complete"];

function StepBar({ current }: { current: number }) {
  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="flex items-center max-w-lg mx-auto">
        {WORKSPACE_STEPS.map((label, i) => (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-1.5 shrink-0">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                i < current  ? "bg-blue-600 border-blue-600 text-white" :
                i === current ? "border-blue-600 text-blue-600 bg-white" :
                                "border-gray-200 text-gray-300 bg-white"
              }`}>
                {i < current ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ) : i + 1}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${
                i === current ? "text-blue-700" : i < current ? "text-gray-400" : "text-gray-300"
              }`}>{label}</span>
            </div>
            {i < WORKSPACE_STEPS.length - 1 && (
              <div className={`flex-1 h-px mx-2 ${i < current ? "bg-blue-400" : "bg-gray-200"}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function WorkspacePage() {
  const [engineerId, setEngineerId] = useState(DEFAULT_ENGINEER.id);
  const [step, setStep] = useState<Step>("queue");
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [notes, setNotes] = useState("");
  const [aiReport, setAiReport] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [checkInTime, setCheckInTime] = useState<string | undefined>();
  const { tasks: allTasks, refresh } = useStore();

  const engineer   = engineers.find((e) => e.id === engineerId)!;
  const localTasks = allTasks.filter(
    (t) => t.engineerId === engineerId && (t.status === "assigned" || t.status === "in_progress")
  );

  // Refresh when engineer changes
  useEffect(() => { refresh(); }, [engineerId, refresh]);

  const elapsed = useElapsed(step === "working" ? checkInTime : undefined);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const handleAccept = (task: Task) => {
    setActiveTask(task);
    setStep("detail");
  };

  const handleStartWork = async () => {
    if (!activeTask) return;
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: activeTask.id, action: "start" }),
    });
    const updated = await res.json() as Task;
    setCheckInTime(updated.checkInTime ?? new Date().toISOString());
    refresh();
    setStep("working");
  };

  const handleImproveNotes = async () => {
    if (!activeTask) return;
    setAiLoading(true);
    setAiError("");
    try {
      const report = await callGemini(notes, activeTask);
      setAiReport(report);
    } catch {
      setAiError("AI unavailable. Your notes are saved as-is.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleFinishWork = async () => {
    if (!activeTask) return;
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id:       activeTask.id,
        action:   "finish",
        comments: notes || undefined,
        aiReport: aiReport || undefined,
      }),
    });
    const updated = await res.json() as Task;
    setActiveTask(updated);
    refresh();
    setStep("done");
  };

  const handleReset = () => {
    setStep("queue");
    setActiveTask(null);
    setNotes("");
    setAiReport("");
    setAiError("");
    setCheckInTime(undefined);
    refresh();
  };

  // ─── Screens ─────────────────────────────────────────────────────────────────

  // ── QUEUE ──
  if (step === "queue") {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col">
        <div className="bg-blue-600 text-white px-5 pt-10 pb-6">
          <p className="text-xs font-medium text-blue-200 uppercase tracking-widest mb-1">Field Workspace</p>
          <h1 className="text-2xl font-bold leading-tight">My Tasks</h1>
          <p className="text-sm text-blue-200 mt-1">{engineer.name}</p>
        </div>

        <div className="bg-white border-b border-gray-200 px-5 py-3">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mr-3">View as:</label>
          <select
            value={engineerId}
            onChange={(e) => setEngineerId(e.target.value)}
            className="text-sm font-medium text-gray-800 border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {engineers.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>

        <StepBar current={0} />

        <div className="flex-1 px-4 py-5 space-y-3 max-w-lg mx-auto w-full">
          {localTasks.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center shadow-sm">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <p className="text-base font-semibold text-gray-700">All clear!</p>
              <p className="text-sm text-gray-400 mt-1">No tasks assigned right now.</p>
            </div>
          ) : (
            localTasks.map((task) => (
              <div key={task.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 pt-5 pb-4">
                  <div className="flex items-center gap-2 mb-3">
                    {task.status === "in_progress" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                        In Progress
                      </span>
                    ) : (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
                        Assigned
                      </span>
                    )}
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${slaBadge(task.serviceLevel)}`}>
                      {task.serviceLevel}
                    </span>
                  </div>

                  <h2 className="text-base font-bold text-gray-900 leading-snug">{task.title}</h2>

                  <div className="mt-2.5 space-y-1.5">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                      </svg>
                      <span className="font-medium">{task.customer}</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-gray-500">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                      </svg>
                      <span>{task.location}</span>
                    </div>
                  </div>
                </div>

                <div className="px-5 pb-5">
                  <button
                    onClick={() => handleAccept(task)}
                    className="w-full py-3.5 rounded-xl font-semibold text-sm transition-colors bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2"
                  >
                    {task.status === "in_progress" ? "Resume Task" : "Accept Task"}
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

  // ── DETAIL (accepted, pre-start) ──
  if (step === "detail" && activeTask) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col">
        <div className="bg-white border-b border-gray-200 px-5 h-14 flex items-center gap-3">
          <button onClick={() => setStep("queue")} className="text-blue-600 p-1 -ml-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
            </svg>
          </button>
          <p className="text-sm font-semibold text-gray-700">Task Details</p>
        </div>

        <StepBar current={1} />

        <div className="flex-1 px-4 py-5 max-w-lg mx-auto w-full space-y-4">
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${slaBadge(activeTask.serviceLevel)}`}>
                {activeTask.serviceLevel}
              </span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
                {activeTask.maintenanceType}
              </span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">{activeTask.title}</h2>

            <div className="space-y-3 text-sm">
              <div className="flex gap-3">
                <div className="w-5 shrink-0 mt-0.5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Customer</p>
                  <p className="font-semibold text-gray-800 mt-0.5">{activeTask.customer}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-5 shrink-0 mt-0.5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Location</p>
                  <p className="font-semibold text-gray-800 mt-0.5">{activeTask.location}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-5 shrink-0 mt-0.5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">SLA</p>
                  <p className="font-semibold text-gray-800 mt-0.5">{activeTask.serviceLevel}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-5 shrink-0 mt-0.5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Engineer</p>
                  <p className="font-semibold text-gray-800 mt-0.5">{activeTask.engineerName}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-gray-500 font-medium">Task Reference</span>
            <span className="text-xs font-mono font-bold text-gray-700">{activeTask.id}</span>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-4">
          <button
            onClick={handleStartWork}
            className="w-full py-4 rounded-2xl font-bold text-base bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center justify-center gap-3"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>
            </svg>
            Start Work
          </button>
        </div>
      </div>
    );
  }

  // ── WORKING ──
  if (step === "working" && activeTask) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col">
        <div className="bg-blue-600 text-white px-5 pt-8 pb-5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-blue-200 uppercase tracking-widest">On Site</span>
            <span className="inline-flex items-center gap-1.5 bg-blue-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              LIVE
            </span>
          </div>
          <h2 className="text-xl font-bold leading-tight">{activeTask.title}</h2>
          <p className="text-sm text-blue-200 mt-1">{activeTask.customer}</p>
          <div className="mt-4 bg-blue-500 rounded-2xl px-5 py-4 text-center">
            <p className="text-xs text-blue-200 font-medium uppercase tracking-widest mb-1">Time on Site</p>
            <p className="text-4xl font-bold font-mono tracking-tight">{elapsed}</p>
          </div>
        </div>

        <StepBar current={2} />

        <div className="flex-1 px-4 py-5 max-w-lg mx-auto w-full space-y-4">
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-widest mb-3">
              Work Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={6}
              placeholder="Describe the work you performed, parts used, issues found..."
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none leading-relaxed"
            />
            <button
              onClick={handleImproveNotes}
              disabled={aiLoading || !notes.trim()}
              className={`mt-3 w-full py-3 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2
                ${aiLoading || !notes.trim()
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-purple-600 hover:bg-purple-700 text-white"}`}
            >
              {aiLoading ? (
                <>
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  Generating report...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                  </svg>
                  Improve Notes with AI
                </>
              )}
            </button>
            {aiError && (
              <p className="mt-2 text-xs text-red-500 text-center">{aiError}</p>
            )}
          </div>

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
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-4">
          <button
            onClick={handleFinishWork}
            className="w-full py-4 rounded-2xl font-bold text-base bg-green-600 hover:bg-green-700 text-white transition-colors flex items-center justify-center gap-3"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Finish Work
          </button>
        </div>
      </div>
    );
  }

  // ── DONE ──
  if (step === "done" && activeTask) {
    const duration = calcDuration(activeTask.checkInTime, activeTask.checkOutTime);
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col">
        <div className="bg-green-600 text-white px-5 pt-10 pb-8 text-center">
          <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h2 className="text-2xl font-bold">Task Complete!</h2>
          <p className="text-green-200 mt-1 text-sm">Report submitted to admin for approval</p>
        </div>

        <StepBar current={3} />

        <div className="flex-1 px-4 py-5 max-w-lg mx-auto w-full space-y-4">
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Visit Summary</p>
            </div>
            <div className="px-5 py-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Task</p>
                <p className="font-semibold text-gray-800 mt-0.5">{activeTask.title}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Customer</p>
                <p className="font-semibold text-gray-800 mt-0.5">{activeTask.customer}</p>
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
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Check In</p>
                <p className="font-medium text-gray-700 mt-0.5 text-xs">
                  {activeTask.checkInTime ? new Date(activeTask.checkInTime).toLocaleString("en-GB", { timeStyle: "short", dateStyle: "short" }) : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Check Out</p>
                <p className="font-medium text-gray-700 mt-0.5 text-xs">
                  {activeTask.checkOutTime ? new Date(activeTask.checkOutTime).toLocaleString("en-GB", { timeStyle: "short", dateStyle: "short" }) : "—"}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4">
            <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-2">Billing (pending admin approval)</p>
            <p className="text-sm text-blue-800">
              This visit will be invoiced under the <span className="font-semibold">{activeTask.serviceLevel}</span> SLA rate.
              Billing is calculated automatically once an admin approves your report.
            </p>
          </div>

          {(aiReport || activeTask.aiReport) && (
            <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                </svg>
                <p className="text-xs font-bold text-purple-700 uppercase tracking-widest">AI Site Report</p>
              </div>
              <pre className="text-xs text-purple-900 whitespace-pre-wrap leading-relaxed font-sans">
                {aiReport || activeTask.aiReport}
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
