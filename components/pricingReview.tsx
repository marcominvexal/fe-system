"use client";

import { useState } from "react";
import type { Task } from "@/lib/store";
import {
  MAINTENANCE_LEVELS, SERVICE_LEVELS, DISTANCE_BANDS, VISIT_DURATIONS,
  type MaintenanceLevel, type ServiceLevel, type DistanceBand, type VisitDuration,
} from "@/lib/store";
import { calculateCommercial } from "@/lib/commercialEngine";
import { pricingConfidence, type Confidence } from "@/lib/confidence";
import { fmtUSD } from "@/lib/analytics";
import { Icons } from "./icons";
import { Button, Modal, Select, cx, labelCls, textareaCls } from "./ui";

export function ConfidenceBadge({ c, size = "md" }: { c: Confidence; size?: "sm" | "md" }) {
  const tone = c.level === "high" ? "text-[#7bcfa2] ring-ok/30 bg-ok/10" : c.level === "medium" ? "text-[#f0bd6d] ring-warn/30 bg-warn/10" : "text-[#f08a84] ring-crit/30 bg-crit/10";
  return (
    <span className={cx("num inline-flex items-center gap-1 rounded-md font-semibold ring-1 ring-inset", tone, size === "sm" ? "px-1.5 text-2xs" : "px-2 py-0.5 text-xs")}
      title={c.reasons.map((r) => r.text).join("\n") || "Every pricing input came from a reliable source"}>
      <Icons.Sparkle size={size === "sm" ? 10 : 12} />{c.score}%
    </span>
  );
}

/** Why the system is (or isn't) sure about this price. */
export function ConfidenceReasons({ task }: { task: Task }) {
  const c = pricingConfidence(task);
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-2xs font-medium uppercase tracking-[0.08em] text-fg-subtle">Price confidence</p>
        <ConfidenceBadge c={c} />
      </div>
      {c.reasons.length ? (
        <ul className="mt-2 space-y-1">
          {c.reasons.map((r) => (
            <li key={r.text} className="flex items-start gap-2 text-xs text-fg-muted">
              {r.points > 0 ? <span className="num mt-px w-8 shrink-0 text-right text-2xs text-[#f08a84]">−{r.points}</span> : <Icons.Check size={12} className="mt-0.5 w-8 shrink-0 text-[#7bcfa2]" />}
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
      ) : <p className="mt-1.5 text-xs text-fg-subtle">Every pricing input came from Orange&apos;s emails and matched a rule.</p>}
    </div>
  );
}

/** Correct the pricing inputs of a cleared/billed visit (before it is invoiced). */
export function RepriceModal({ task, onClose, onDone }: { task: Task; onClose: () => void; onDone: () => void }) {
  const [ml, setMl] = useState<MaintenanceLevel>(task.maintenanceLevel);
  const [sl, setSl] = useState<ServiceLevel>(task.serviceLevel);
  const [db, setDb] = useState<DistanceBand>(task.distanceBand);
  const [vd, setVd] = useState<VisitDuration>(task.visitDuration);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const price = calculateCommercial(ml, sl, db, vd);
  const before = task.customerChargeUSD ?? calculateCommercial(task.maintenanceLevel, task.serviceLevel, task.distanceBand, task.visitDuration).customerChargeUSD;
  const diff = price.customerChargeUSD - before;

  const submit = async () => {
    setBusy(true); setError("");
    const r = await fetch("/api/tasks", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: task.id, action: "reprice", maintenanceLevel: ml, serviceLevel: sl, distanceBand: db, visitDuration: vd, note }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setError(d.error ?? "Could not save."); return; }
    onDone();
  };

  return (
    <Modal onClose={onClose} label="Adjust pricing" width="max-w-lg">
      <h3 className="text-[15px] font-semibold text-fg">Adjust pricing · <span className="font-mono">{task.workOrder ?? task.id}</span></h3>
      <p className="mt-1 text-[13px] text-fg-muted">Correct what the system inferred. The new price is locked in and the change is recorded with your reason.</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div><label className={labelCls} htmlFor="rp-ml">Work type</label>
          <Select id="rp-ml" value={ml} onChange={(e) => setMl(e.target.value as MaintenanceLevel)}>{MAINTENANCE_LEVELS.map((m) => <option key={m}>{m}</option>)}</Select></div>
        <div><label className={labelCls} htmlFor="rp-sl">SLA</label>
          <Select id="rp-sl" value={sl} onChange={(e) => setSl(e.target.value as ServiceLevel)}>{SERVICE_LEVELS.map((m) => <option key={m}>{m}</option>)}</Select></div>
        <div><label className={labelCls} htmlFor="rp-db">Distance</label>
          <Select id="rp-db" value={db} onChange={(e) => setDb(e.target.value as DistanceBand)}>{DISTANCE_BANDS.map((m) => <option key={m}>{m}</option>)}</Select></div>
        <div><label className={labelCls} htmlFor="rp-vd">Visit length{task.duration ? ` (${task.duration} on site)` : ""}</label>
          <Select id="rp-vd" value={vd} onChange={(e) => setVd(e.target.value as VisitDuration)}>{VISIT_DURATIONS.map((m) => <option key={m}>{m}</option>)}</Select></div>
      </div>
      <div className="mt-3 flex items-baseline justify-between rounded-lg border border-line bg-canvas/50 px-3.5 py-2.5 text-[13px]">
        <span className="text-fg-subtle">New charge</span>
        <span className="num">
          <span className="font-semibold text-fg">{fmtUSD(price.customerChargeUSD)}</span>
          {diff !== 0 && <span className={cx("ml-2 text-xs", diff > 0 ? "text-[#7bcfa2]" : "text-[#f08a84]")}>{diff > 0 ? "+" : "−"}{fmtUSD(Math.abs(diff))}</span>}
          <span className="ml-3 text-xs text-fg-subtle">FE pay {fmtUSD(price.engineerPaymentUSD)}</span>
        </span>
      </div>
      <label className={cx(labelCls, "mt-3")} htmlFor="rp-note">Reason</label>
      <textarea id="rp-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={textareaCls}
        placeholder="e.g. Site is in Hyderabad, over 100 km from base" />
      {error && <p role="alert" className="mt-2 text-xs text-[#f08a84]">{error}</p>}
      <div className="mt-4 flex gap-2">
        <Button onClick={onClose} className="flex-1">Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={busy || !note.trim()} className="flex-1">{busy ? "Saving…" : "Save price"}</Button>
      </div>
    </Modal>
  );
}

export async function confirmPricing(taskId: string, note?: string) {
  const r = await fetch("/api/tasks", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: taskId, action: "confirm_pricing", note }),
  });
  return r.ok;
}
