"use client";

import { useState } from "react";
import {
  Task,
  engineers, maintenanceTypes, locations, customers,
  MAINTENANCE_LEVELS, SERVICE_LEVELS, DISTANCE_BANDS, VISIT_DURATIONS,
  MaintenanceLevel, ServiceLevel, DistanceBand, VisitDuration,
  calcDuration, fmtDate,
} from "@/lib/store";
import { calculateCommercial } from "@/lib/commercialEngine";
import { slaState, slaHoursLeft, lateByHours, SLA_TARGET_HOURS, fmtHrs, responseHours } from "@/lib/analytics";
import { Icons } from "./icons";
import {
  Avatar, Badge, Button, Drawer, Modal, Select, StatusBadge, cx,
  inputCls, labelCls, textareaCls, type Tone,
} from "./ui";

// ── SLA / priority helpers (display only) ──────────────────────────────────────
export const PRIORITY: Record<ServiceLevel, { p: string; tone: Tone }> = {
  "24x7 4h": { p: "P1", tone: "crit" },
  "8x5 4h":  { p: "P2", tone: "warn" },
  "8x5 NBD": { p: "P3", tone: "neutral" },
};

export function PriorityTag({ sl }: { sl: ServiceLevel }) {
  const { p, tone } = PRIORITY[sl];
  const bars = p === "P1" ? 3 : p === "P2" ? 2 : 1;
  const col = tone === "crit" ? "bg-crit" : tone === "warn" ? "bg-warn" : "bg-fg-subtle";
  return (
    <span className="inline-flex items-center gap-1.5 text-2xs font-medium text-fg-muted" title={`${p} — ${sl}`}>
      <span className="flex items-end gap-[2px]" aria-hidden="true">
        {[1, 2, 3].map((b) => (
          <span key={b} className={cx("w-[3px] rounded-sm", b <= bars ? col : "bg-white/10")} style={{ height: 3 + b * 3 }} />
        ))}
      </span>
      {p}
    </span>
  );
}

export function SlaTag({ task }: { task: Task }) {
  const s = slaState(task);
  if (s === "n/a") return <span className="text-fg-faint">—</span>;
  if (s === "met") return <Badge tone="ok" dot={false}>Met · {fmtHrs(responseHours(task) ?? null)}</Badge>;
  if (s === "breached") {
    const over = lateByHours(task);
    return <Badge tone="crit" dot={false}>Breached +{fmtHrs(over)}</Badge>;
  }
  if (s === "at_risk") return <Badge tone="warn" dot={false}>{fmtHrs(slaHoursLeft(task))} left</Badge>;
  return <span className="num text-2xs text-fg-subtle">{fmtHrs(slaHoursLeft(task))} left</span>;
}

// ── Cancel Modal ───────────────────────────────────────────────────────────────
export function CancelModal({ task, onCancel, onClose }: {
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
    <Modal onClose={onClose} label="Cancel task">
      <h3 className="text-[15px] font-semibold text-fg">Cancel task</h3>
      <p className="mt-1 text-[13px] text-fg-muted">
        Cancel <span className="font-medium text-fg">{task.title}</span>? This cannot be undone.
      </p>
      <label className={cx(labelCls, "mt-4")} htmlFor="cancel-reason">Reason <span className="text-crit">*</span></label>
      <textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
        placeholder="Why is this task being cancelled?" className={textareaCls} autoFocus />
      <div className="mt-4 flex gap-2">
        <Button onClick={onClose} className="flex-1">Keep task</Button>
        <Button variant="danger" onClick={submit} disabled={!reason.trim() || busy} className="flex-1">
          {busy ? "Cancelling…" : "Cancel task"}
        </Button>
      </div>
    </Modal>
  );
}

// ── Edit Task Modal ────────────────────────────────────────────────────────────
export function EditModal({ task, onSave, onClose }: {
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
    <Modal onClose={onClose} label="Edit task" width="max-w-lg">
      <h3 className="mb-4 text-[15px] font-semibold text-fg">Edit task <span className="ml-1 font-mono text-xs font-normal text-fg-subtle">{task.id}</span></h3>
      <div className="space-y-3.5">
        <div><label className={labelCls} htmlFor="e-title">Title</label>
          <input id="e-title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} /></div>
        <div><label className={labelCls} htmlFor="e-desc">Description</label>
          <textarea id="e-desc" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} className={textareaCls} /></div>
        <div><label className={labelCls} htmlFor="e-loc">Location</label>
          <input id="e-loc" value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls} /></div>
        <div><label className={labelCls} htmlFor="e-eng">Assigned engineer</label>
          <Select id="e-eng" value={engId} onChange={(e) => setEngId(e.target.value)}>
            {engineers.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select></div>
      </div>
      <div className="mt-5 flex gap-2">
        <Button onClick={onClose} className="flex-1">Discard</Button>
        <Button variant="primary" onClick={submit} disabled={!title.trim() || busy} className="flex-1">
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </Modal>
  );
}

// ── Reassign Modal ─────────────────────────────────────────────────────────────
export function ReassignModal({ task, onReassign, onClose }: {
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
    <Modal onClose={onClose} label="Reassign task" width="max-w-sm">
      <h3 className="text-[15px] font-semibold text-fg">Reassign task</h3>
      <p className="mb-4 mt-1 text-[13px] text-fg-muted">Choose an engineer to reassign this task to.</p>
      <Select aria-label="Engineer" value={engId} onChange={(e) => setEngId(e.target.value)}>
        {engineers.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
      </Select>
      <div className="mt-4 flex gap-2">
        <Button onClick={onClose} className="flex-1">Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={busy} className="flex-1">{busy ? "Reassigning…" : "Reassign"}</Button>
      </div>
    </Modal>
  );
}

// ── Task Detail Drawer ─────────────────────────────────────────────────────────
function Field({ label, children, span }: { label: string; children: React.ReactNode; span?: boolean }) {
  return (
    <div className={span ? "col-span-2" : undefined}>
      <p className="text-2xs font-medium uppercase tracking-[0.06em] text-fg-faint">{label}</p>
      <div className="mt-1 text-[13px] text-fg">{children}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2.5 text-2xs font-medium uppercase tracking-[0.08em] text-fg-subtle">{children}</p>;
}

export function DetailPanel({ task, onClose, onApprove, onAssign, onCancelClick, onEditClick, onReassignClick }: {
  task: Task;
  onClose: () => void;
  onApprove: (id: string) => Promise<void>;
  onAssign: (id: string, payload: AssignPayload) => Promise<void>;
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

  const timeline = [
    { label: "Created",   time: task.createdAt,    dot: "bg-fg-subtle" },
    { label: "Accepted",  time: task.acceptedAt,   dot: "bg-info" },
    { label: "Rejected",  time: task.rejectedAt,   dot: "bg-crit" },
    { label: "Time in",   time: task.checkInTime,  dot: "bg-brand" },
    { label: "Time out",  time: task.checkOutTime, dot: "bg-warn" },
    ...(task.status === "approved"
      ? [{ label: "Approved", time: task.checkOutTime, dot: "bg-ok" }]
      : []),
    { label: "Cancelled", time: task.cancelledAt,  dot: "bg-fg-faint" },
  ].filter((ev) => ev.time);

  return (
    <Drawer onClose={onClose} label={`Task ${task.id}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="font-mono text-2xs text-fg-subtle">{task.id}</span>
            <StatusBadge status={task.status} />
            <PriorityTag sl={task.serviceLevel} />
            {task.invoiceNumber && <Badge tone="ok" dot={false} className="font-mono">{task.invoiceNumber}</Badge>}
          </div>
          <h2 className="text-[16px] font-semibold leading-snug tracking-tight text-fg">{task.title}</h2>
        </div>
        <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-fg-subtle hover:bg-white/5 hover:text-fg">
          <Icons.X size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="scroll-thin flex-1 space-y-6 overflow-y-auto px-5 py-5">
        {task.status === "pending" && <AssignPanel task={task} onAssign={onAssign} />}
        {task.source === "email" && <OrangeDetails task={task} />}
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <Field label="Customer">{task.customer}</Field>
          <Field label="Engineer">
            <span className="flex items-center gap-2"><Avatar name={task.engineerName} size={20} live={task.status === "in_progress"} />{task.engineerName}</span>
          </Field>
          <Field label="Location" span><span className="flex items-center gap-1.5 text-fg-muted"><Icons.MapPin size={13} className="text-fg-faint" />{task.location}</span></Field>
          <Field label="Work type">{task.maintenanceType}</Field>
          <Field label="Visit duration">{task.visitDuration}</Field>
          {task.description && <Field label="Description" span><Expandable text={task.description} /></Field>}
        </div>

        <div>
          <SectionLabel>SLA &amp; commercial rule</SectionLabel>
          <div className="grid grid-cols-4 divide-x divide-line overflow-hidden rounded-lg border border-line bg-canvas/50">
            {[
              { label: "Level", value: task.maintenanceLevel === "Planned Activity" ? "Planned" : "Reactive" },
              { label: "SLA",   value: task.serviceLevel, accent: true },
              { label: "Distance", value: task.distanceBand },
              { label: "Visit", value: task.visitDuration },
            ].map(({ label, value, accent }) => (
              <div key={label} className="px-3 py-2.5">
                <p className="text-2xs text-fg-faint">{label}</p>
                <p className={cx("mt-0.5 text-xs font-medium", accent ? "text-brand-soft" : "text-fg")}>{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-fg-subtle">
            <span>{task.scheduledAt ? <>Booked arrival {fmtDate(task.scheduledAt)}</> : <>Response target {SLA_TARGET_HOURS[task.serviceLevel]}h</>}</span>
            <SlaTag task={task} />
          </div>
        </div>

        {task.status === "rejected" && task.rejectionReason && (
          <div className="rounded-lg border border-crit/25 bg-crit/[0.07] px-4 py-3">
            <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-[#f08a84]">Rejection reason</p>
            <p className="mt-1 text-[13px] text-fg">{task.rejectionReason}</p>
          </div>
        )}
        {task.status === "cancelled" && task.cancelReason && (
          <div className="rounded-lg border border-line bg-white/[0.03] px-4 py-3">
            <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-fg-subtle">Cancellation reason</p>
            <p className="mt-1 text-[13px] text-fg-muted">{task.cancelReason}</p>
          </div>
        )}

        <div>
          <SectionLabel>Timeline</SectionLabel>
          <ol className="relative space-y-3 before:absolute before:bottom-1 before:left-[3px] before:top-1 before:w-px before:bg-line">
            {timeline.map((ev, i) => (
              <li key={i} className="relative flex items-center gap-3 pl-0">
                <span className={cx("relative z-[1] h-[7px] w-[7px] shrink-0 rounded-full ring-4 ring-panel", ev.dot)} />
                <span className="w-20 text-xs font-medium text-fg">{ev.label}</span>
                <span className="num text-xs text-fg-subtle">{fmtDate(ev.time)}</span>
              </li>
            ))}
          </ol>
          {task.checkInTime && task.checkOutTime && (
            <p className="mt-2.5 pl-[19px] text-xs text-fg-subtle">
              On site <span className="num font-medium text-fg">{calcDuration(task.checkInTime, task.checkOutTime)}</span>
            </p>
          )}
        </div>

        {task.emailLog && task.emailLog.length > 0 && <EmailTrail task={task} />}

        <div>
          <SectionLabel>Engineer comments</SectionLabel>
          {task.comments ? (
            <p className="whitespace-pre-wrap rounded-lg border border-line bg-canvas/50 px-3.5 py-3 text-[13px] leading-relaxed text-fg-muted">{task.comments}</p>
          ) : (
            <p className="text-xs text-fg-faint">No comments recorded.</p>
          )}
        </div>

        {task.aiSummary && (
          <div>
            <SectionLabel><span className="inline-flex items-center gap-1.5"><Icons.Sparkle size={12} className="text-brand" />AI visit report</span></SectionLabel>
            <div className="whitespace-pre-wrap rounded-lg border border-brand/20 bg-brand/[0.04] px-3.5 py-3 text-xs leading-relaxed text-fg-muted">{task.aiSummary}</div>
          </div>
        )}

        {["completed", "approved"].includes(task.status) && (
          <div>
            <SectionLabel>
              Billing {task.status === "completed" ? <span className="ml-1 normal-case tracking-normal text-[#f0bd6d]">· pending approval</span> : null}
            </SectionLabel>
            <div className="grid grid-cols-3 divide-x divide-line overflow-hidden rounded-lg border border-line">
              {[
                { l: "Revenue",    v: task.customerChargeUSD ?? rates.customerChargeUSD, c: "text-fg" },
                { l: "FE payment", v: task.engineerPaymentUSD ?? rates.engineerPaymentUSD, c: "text-fg-muted" },
                { l: "Profit",     v: task.profit ?? rates.profit, c: "text-[#7bcfa2]" },
              ].map((b) => (
                <div key={b.l} className="px-4 py-3">
                  <p className="text-2xs text-fg-subtle">{b.l}</p>
                  <p className={cx("num mt-1 text-lg font-semibold", b.c)}>${b.v}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="space-y-2 border-t border-line bg-canvas/40 px-5 py-4">
        {task.status === "completed" && (
          <Button variant="success" onClick={handleApprove} disabled={approving} className="h-10 w-full">
            <Icons.Check size={15} />{approving ? "Approving…" : "Approve & generate invoice"}
          </Button>
        )}
        {task.status === "approved" && (
          <p className="flex items-center justify-center gap-2 py-1 text-[13px] font-medium text-[#7bcfa2]">
            <Icons.Check size={15} />Approved — {task.invoiceNumber}
          </p>
        )}
        {(canEdit || canReassign || canCancel) && (
          <div className="flex gap-2">
            {canEdit && <Button onClick={onEditClick} className="flex-1"><Icons.Edit size={14} />Edit task</Button>}
            {canReassign && <Button onClick={onReassignClick} className="flex-1 text-brand-soft"><Icons.Swap size={14} />Reassign</Button>}
            {canCancel && <Button variant="danger" onClick={onCancelClick} className="flex-1">Cancel task</Button>}
          </div>
        )}
      </div>
    </Drawer>
  );
}

// ── Email-automation pieces ───────────────────────────────────────────────────
export interface AssignPayload {
  engineerId: string; engineerName: string;
  maintenanceLevel: MaintenanceLevel; serviceLevel: ServiceLevel;
  distanceBand: DistanceBand; visitDuration: VisitDuration;
}

function Expandable({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.split("\n").length > 6 || text.length > 420;
  return (
    <div>
      <p className={cx("whitespace-pre-wrap leading-relaxed text-fg-muted", !open && long && "line-clamp-6")}>{text}</p>
      {long && (
        <button onClick={() => setOpen(!open)} className="mt-1 text-xs font-medium text-brand-soft hover:text-brand">
          {open ? "Show less" : "Show full dispatch notes"}
        </button>
      )}
    </div>
  );
}

function OrangeDetails({ task }: { task: Task }) {
  const rows = [
    { l: "Work order", v: task.workOrder && <span className="font-mono">{task.workOrder}</span> },
    { l: "End customer", v: task.endCustomer },
    { l: "Site", v: task.siteId },
    { l: "Product", v: task.product },
    { l: "Booked arrival", v: task.scheduledAt && fmtDate(task.scheduledAt) },
    { l: "Dispatched by", v: task.assignedBy },
    { l: "Site contact", v: task.siteContact },
  ].filter((r) => r.v);
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <p className="flex items-center gap-2 border-b border-line bg-white/[0.02] px-3.5 py-2 text-2xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
        <Icons.Mail size={12} className="text-brand" />Orange Business work order
      </p>
      <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-2 px-3.5 py-3 text-[13px]">
        {rows.map((r) => (
          <div key={r.l} className="contents">
            <dt className="text-fg-subtle">{r.l}</dt>
            <dd className="min-w-0 break-words text-fg">{r.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const EMAIL_DOT: Record<string, string> = { dispatch: "bg-info", photo: "bg-fg-subtle", cleared: "bg-ok" };

function EmailTrail({ task }: { task: Task }) {
  const t = task.onSiteTimes;
  const log = task.emailLog ?? [];
  const stamps = (t ? [
    ["Travel start", t.travelStart], ["Arrived on site", t.arriveOnSite], ["Work start", t.workStart],
    ["Work stop", t.workStop], ["Left site", t.leaveSite], ["Travel stop", t.travelStop],
  ] : []).filter(([, v]) => v) as [string, string][];
  return (
    <div>
      <SectionLabel>Email trail · {log.length} notification{log.length === 1 ? "" : "s"}</SectionLabel>
      <ol className="space-y-2.5">
        {log.map((e) => (
          <li key={e.messageId} className="flex items-start gap-3">
            <span className={cx("mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full", EMAIL_DOT[e.kind] ?? "bg-fg-subtle")} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-fg">{e.note}</p>
              <p className="truncate text-2xs text-fg-subtle" title={e.subject}>{e.subject}</p>
            </div>
            <span className="num shrink-0 text-2xs text-fg-faint">{fmtDate(e.at)}</span>
          </li>
        ))}
      </ol>
      {stamps.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
          {stamps.map(([l, v]) => (
            <div key={l} className="bg-panel px-3 py-2">
              <p className="text-2xs text-fg-subtle">{l}</p>
              <p className="num mt-0.5 text-xs text-fg">{new Date(v).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AssignPanel({ task, onAssign }: { task: Task; onAssign: (id: string, p: AssignPayload) => Promise<void> }) {
  const [engId, setEngId] = useState(engineers[0].id);
  const [ml, setMl] = useState<MaintenanceLevel>(task.maintenanceLevel);
  const [sl, setSl] = useState<ServiceLevel>(task.serviceLevel);
  const [db, setDb] = useState<DistanceBand>(task.distanceBand);
  const [vd, setVd] = useState<VisitDuration>(task.visitDuration);
  const [busy, setBusy] = useState(false);
  const price = calculateCommercial(ml, sl, db, vd);
  const submit = async () => {
    setBusy(true);
    const eng = engineers.find((e) => e.id === engId)!;
    await onAssign(task.id, { engineerId: eng.id, engineerName: eng.name, maintenanceLevel: ml, serviceLevel: sl, distanceBand: db, visitDuration: vd });
    setBusy(false);
  };
  return (
    <div className="rounded-lg border border-warn/30 bg-warn/[0.05] p-4">
      <p className="text-[13px] font-semibold text-fg">Assign this work order</p>
      <p className="mt-0.5 text-xs text-fg-subtle">
        Created from an Orange email. Pick the engineer and confirm the pricing inputs, which Orange does not send.
        {task.checkOutTime && " Orange already reported this visit as cleared, so it will go straight to approval."}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="col-span-2"><label className={labelCls} htmlFor="a-eng">Engineer</label>
          <Select id="a-eng" value={engId} onChange={(e) => setEngId(e.target.value)}>
            {engineers.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select></div>
        <div><label className={labelCls} htmlFor="a-ml">Maintenance</label>
          <Select id="a-ml" value={ml} onChange={(e) => setMl(e.target.value as MaintenanceLevel)}>
            {MAINTENANCE_LEVELS.map((m) => <option key={m}>{m}</option>)}
          </Select></div>
        <div><label className={labelCls} htmlFor="a-sl">SLA</label>
          <Select id="a-sl" value={sl} onChange={(e) => setSl(e.target.value as ServiceLevel)}>
            {SERVICE_LEVELS.map((m) => <option key={m}>{m}</option>)}
          </Select></div>
        <div><label className={labelCls} htmlFor="a-db">Distance</label>
          <Select id="a-db" value={db} onChange={(e) => setDb(e.target.value as DistanceBand)}>
            {DISTANCE_BANDS.map((m) => <option key={m}>{m}</option>)}
          </Select></div>
        <div><label className={labelCls} htmlFor="a-vd">Visit length{task.onSiteTimes ? " (from Orange)" : ""}</label>
          <Select id="a-vd" value={vd} onChange={(e) => setVd(e.target.value as VisitDuration)}>
            {VISIT_DURATIONS.map((m) => <option key={m}>{m}</option>)}
          </Select></div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-fg-subtle">Customer charge <span className="num font-semibold text-fg">${price.customerChargeUSD}</span> · FE pay <span className="num text-fg-muted">${price.engineerPaymentUSD}</span></p>
        <Button variant="primary" onClick={submit} disabled={busy}>{busy ? "Assigning…" : "Assign engineer"}</Button>
      </div>
    </div>
  );
}

// ── Create Task Drawer (4-step) ────────────────────────────────────────────────
const FORM_STEPS = ["Basics", "Location", "Engineer", "SLA & billing"];

export const EMPTY_FORM = {
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
    <ol className="mb-6 flex items-center">
      {FORM_STEPS.map((label, i) => (
        <li key={i} className="flex flex-1 items-center last:flex-none">
          <div className="flex shrink-0 items-center gap-2">
            <span className={cx(
              "grid h-6 w-6 place-items-center rounded-full text-2xs font-semibold transition-colors duration-200",
              i < current ? "bg-brand text-[#1a0d03]" :
              i === current ? "text-brand-soft ring-1 ring-inset ring-brand" : "text-fg-faint ring-1 ring-inset ring-line-strong",
            )} aria-current={i === current ? "step" : undefined}>
              {i < current ? <Icons.Check size={12} /> : i + 1}
            </span>
            <span className={cx("hidden whitespace-nowrap text-xs font-medium sm:block",
              i === current ? "text-fg" : i < current ? "text-fg-muted" : "text-fg-faint")}>{label}</span>
          </div>
          {i < FORM_STEPS.length - 1 && <span className={cx("mx-3 h-px flex-1", i < current ? "bg-brand/50" : "bg-line-strong")} />}
        </li>
      ))}
    </ol>
  );
}

export function CreateTaskDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [formStep, setFormStep]   = useState(0);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");

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

    onCreated();
    onClose();
  };

  return (
    <Drawer onClose={onClose} label="Create task" width="max-w-2xl">
      <div className="flex items-start justify-between border-b border-line px-6 py-4">
        <div>
          <h2 className="text-[16px] font-semibold tracking-tight text-fg">Create &amp; assign field task</h2>
          <p className="mt-0.5 text-xs text-fg-subtle">Step {formStep + 1} of {FORM_STEPS.length} · {FORM_STEPS[formStep]}</p>
        </div>
        <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-fg-subtle hover:bg-white/5 hover:text-fg"><Icons.X size={16} /></button>
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto px-6 py-6">
        <FormStepper current={formStep} />

        {formError && (
          <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-crit/25 bg-crit/[0.07] px-3 py-2.5 text-xs font-medium text-[#f08a84]">
            <Icons.Alert size={13} />{formError}
          </div>
        )}

        {formStep === 0 && (
          <div className="space-y-4">
            <div>
              <label className={labelCls} htmlFor="f-title">Task title <span className="text-crit">*</span></label>
              <input id="f-title" value={form.title} onChange={(e) => setField("title", e.target.value)}
                placeholder="e.g. Fiber Link Down — Karachi Hub" className={inputCls} autoFocus />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="f-type">Work type</label>
                <Select id="f-type" value={form.maintenanceType} onChange={(e) => setField("maintenanceType", e.target.value)}>
                  {maintenanceTypes.map((m) => <option key={m}>{m}</option>)}
                </Select>
              </div>
              <div>
                <p className={labelCls}>Customer</p>
                <div className="flex h-9 items-center gap-2 rounded-lg bg-white/[0.03] px-3 text-[13px] text-fg-muted ring-1 ring-inset ring-line">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand" />Orange Business
                </div>
              </div>
            </div>
          </div>
        )}

        {formStep === 1 && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="f-city">City / region</label>
                <Select id="f-city" value={form.city} onChange={(e) => setField("city", e.target.value)}>
                  {locations.map((c) => <option key={c}>{c}</option>)}
                </Select>
              </div>
              <div>
                <label className={labelCls} htmlFor="f-site">Site reference <span className="normal-case tracking-normal text-fg-faint">(optional)</span></label>
                <input id="f-site" value={form.siteRef} onChange={(e) => setField("siteRef", e.target.value)} placeholder="e.g. Site KHI-01" className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls} htmlFor="f-desc">Description <span className="normal-case tracking-normal text-fg-faint">(optional)</span></label>
              <textarea id="f-desc" value={form.description} onChange={(e) => setField("description", e.target.value)}
                rows={3} placeholder="Detailed task instructions for the engineer…" className={textareaCls} />
            </div>
            <p className="text-xs text-fg-subtle">Full address: <span className="text-fg-muted">{form.siteRef ? `${form.siteRef}, ` : ""}{form.city}</span></p>
          </div>
        )}

        {formStep === 2 && (
          <div>
            <p className="mb-3 text-xs text-fg-subtle">Select the engineer to assign this task to</p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label="Engineer">
              {engineers.map((eng) => {
                const sel = form.engineerId === eng.id;
                return (
                  <button key={eng.id} type="button" role="radio" aria-checked={sel} onClick={() => setField("engineerId", eng.id)}
                    className={cx("flex items-center gap-3 rounded-lg p-3 text-left ring-1 ring-inset transition-colors duration-150",
                      sel ? "bg-brand/[0.08] ring-brand/60" : "bg-white/[0.02] ring-line hover:ring-line-strong")}>
                    <Avatar name={eng.name} size={30} />
                    <span className="min-w-0">
                      <span className={cx("block truncate text-[13px] font-medium", sel ? "text-fg" : "text-fg-muted")}>{eng.name}</span>
                      <span className={cx("block text-2xs", sel ? "text-brand-soft" : "text-fg-faint")}>{sel ? "Selected" : eng.id}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {formStep === 3 && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div><label className={labelCls} htmlFor="f-ml">Maintenance</label>
                <Select id="f-ml" value={form.maintenanceLevel} onChange={(e) => setField("maintenanceLevel", e.target.value as MaintenanceLevel)}>
                  {MAINTENANCE_LEVELS.map((m) => <option key={m}>{m}</option>)}
                </Select></div>
              <div><label className={labelCls} htmlFor="f-sl">SLA</label>
                <Select id="f-sl" value={form.serviceLevel} onChange={(e) => setField("serviceLevel", e.target.value as ServiceLevel)}>
                  {SERVICE_LEVELS.map((s) => <option key={s}>{s}</option>)}
                </Select></div>
              <div><label className={labelCls} htmlFor="f-db">Distance</label>
                <Select id="f-db" value={form.distanceBand} onChange={(e) => setField("distanceBand", e.target.value as DistanceBand)}>
                  {DISTANCE_BANDS.map((d) => <option key={d}>{d}</option>)}
                </Select></div>
              <div><label className={labelCls} htmlFor="f-vd">Visit duration</label>
                <Select id="f-vd" value={form.visitDuration} onChange={(e) => setField("visitDuration", e.target.value as VisitDuration)}>
                  {VISIT_DURATIONS.map((d) => <option key={d}>{d}</option>)}
                </Select></div>
            </div>

            <div className="overflow-hidden rounded-lg border border-line">
              <p className="border-b border-line bg-white/[0.02] px-4 py-2 text-2xs font-medium uppercase tracking-[0.06em] text-fg-subtle">Live billing preview</p>
              <div className="grid grid-cols-3 divide-x divide-line">
                {[
                  { l: "Customer charge", v: preview.customerChargeUSD, c: "text-fg" },
                  { l: "FE payment",      v: preview.engineerPaymentUSD, c: "text-fg-muted" },
                  { l: "Profit",          v: preview.profit, c: "text-[#7bcfa2]" },
                ].map((b) => (
                  <div key={b.l} className="px-4 py-3.5">
                    <p className="text-2xs text-fg-subtle">{b.l}</p>
                    <p className={cx("num mt-1 text-[22px] font-semibold tracking-tight", b.c)}>${b.v}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-line bg-canvas/40 px-6 py-4">
        <Button onClick={formStep === 0 ? onClose : () => { setFormError(""); setFormStep((s) => s - 1); }}>
          {formStep === 0 ? "Cancel" : <><Icons.ChevronL size={14} />Back</>}
        </Button>
        {formStep < 3 ? (
          <Button variant="primary" onClick={handleNext}>Next: {FORM_STEPS[formStep + 1]}<Icons.ChevronR size={14} /></Button>
        ) : (
          <Button variant="primary" onClick={handleCreate}><Icons.Check size={14} />Create &amp; assign task</Button>
        )}
      </div>
    </Drawer>
  );
}
