"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import type { Task } from "@/lib/store";
import { fmtDate, knownEngineer } from "@/lib/store";
import { useUser } from "@/lib/userContext";
import { getPricing } from "@/lib/pricing";
import { useStore } from "@/lib/storeContext";
import { Icons } from "@/components/icons";
import { Badge, Button, Panel, cx, inputCls, labelCls, type Tone } from "@/components/ui";
import { StageTracker, JobTimeline } from "@/components/workflow";
import { JobHistory } from "@/components/history";
import { ConfidenceReasons, RepriceModal, confirmPricing } from "@/components/pricingReview";
import { CancelModal, Expandable, PricingBasis } from "@/components/tasks";
import { headline } from "@/lib/workflow";
import { fmtUSD, taskValue } from "@/lib/analytics";

const HEADLINE_TONE: Record<string, Tone> = { ok: "ok", warn: "warn", crit: "crit", brand: "brand", muted: "muted" };

function Row({ label, children }: { label: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 py-2 text-[13px]">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="min-w-0 break-words text-fg">{children}</dd>
    </div>
  );
}


/** Who did the visit, and any overnight stay to bill. Editable when the emails didn't say. */
function EngineerPanel({ task, onSaved }: { task: Task; onSaved: () => void }) {
  const { canEdit } = useUser();
  const name = knownEngineer(task);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name ?? "");
  const [nights, setNights] = useState(String(task.hotelNights ?? 0));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const rate = getPricing().contract?.hotelPerNightUSD ?? 125;

  const send = async (body: object) => {
    setBusy(true); setError("");
    const r = await fetch("/api/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: task.id, ...body }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(d.error ?? "Could not save."); return false; }
    onSaved();
    return true;
  };

  return (
    <Panel title="Engineer">
      {editing ? (
        <form onSubmit={async (e) => { e.preventDefault(); if (await send({ action: "set_engineer", engineerName: value })) setEditing(false); }} className="flex gap-2">
          <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="Full name, e.g. Waqar Islam" aria-label="Engineer name" className={inputCls} />
          <Button type="submit" variant="primary" disabled={busy || !value.trim()}>Save</Button>
          <Button type="button" variant="ghost" onClick={() => { setEditing(false); setValue(name ?? ""); }}>Cancel</Button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            {name
              ? <p className="text-[18px] font-bold text-fg">{name}</p>
              : <p className="text-[15px] font-bold text-warn-fg">Name not received yet</p>}
            <p className="mt-0.5 text-xs text-fg-subtle">
              {task.engineerNameSource === "manual" ? "Entered by hand" : name ? "Read from Orange's emails" : "Orange's emails haven't named the engineer. Add it so it shows on reports and invoices."}
              {task.asp ? ` · Partner ${task.asp.replace(/^ASP_[A-Z]{2}\s*/, "")}` : ""}
            </p>
          </div>
          {canEdit && <Button size="sm" onClick={() => setEditing(true)}><Icons.Edit size={13} />{name ? "Change" : "Add name"}</Button>}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
        <div>
          <label htmlFor="hotel-nights" className={labelCls}>Hotel nights</label>
          <input id="hotel-nights" type="number" min={0} max={60} step={1} value={nights} onChange={(e) => setNights(e.target.value)}
            disabled={!canEdit || !!task.invoiceId} className={cx(inputCls, "w-24 num")} />
        </div>
        {canEdit && !task.invoiceId && String(task.hotelNights ?? 0) !== nights && (
          <Button onClick={() => send({ action: "set_hotel_nights", hotelNights: Number(nights) })} disabled={busy}>Save</Button>
        )}
        <p className="pb-2 text-xs text-fg-subtle">
          {(task.hotelNights ?? 0) > 0 ? <>Adds <b className="text-fg">{fmtUSD((task.hotelNights ?? 0) * rate)}</b> to the bill ({fmtUSD(rate)} a night)</> : <>If the engineer stayed overnight: {fmtUSD(rate)} a night</>}
          {task.invoiceId ? " · already invoiced" : ""}
        </p>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-crit-fg">{error}</p>}
    </Panel>
  );
}

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const { tasks, refresh } = useStore();
  const [cancelling, setCancelling] = useState(false);
  const [approving, setApproving] = useState(false);
  const [repricing, setRepricing] = useState(false);
  const task = tasks.find((t) => t.id === id);

  if (!task) {
    return (
      <div className="py-24 text-center">
        <p className="text-[15px] font-medium text-fg">{tasks.length ? "Work order not found" : "Loading work order…"}</p>
        {tasks.length > 0 && <Link href="/admin/jobs" className="mt-2 inline-block text-[13px] text-brand-soft hover:text-brand">Back to work orders</Link>}
      </div>
    );
  }

  const h = headline(task);
  const billed = task.status === "approved";
  const value = task.customerChargeUSD ?? taskValue(task);

  const patch = (body: object) => fetch("/api/tasks", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: task.id, ...body }),
  }).then(() => refresh());

  const approve = async () => { setApproving(true); await patch({ action: "approve" }); setApproving(false); };
  const cancel = async (_: string, reason: string) => { await patch({ action: "cancel", cancelReason: reason }); };
  const canCancel = !["approved", "cancelled", "completed"].includes(task.status);
  const canReprice = ["approved", "completed"].includes(task.status) && !task.invoiceId;

  return (
    <div>
      <Link href="/admin/jobs" className="mb-3 inline-flex items-center gap-1 text-xs text-fg-subtle hover:text-fg">
        <Icons.ChevronL size={13} />Work orders
      </Link>

      {/* ── Header ── */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-mono text-[22px] font-semibold tracking-tight text-fg">{task.workOrder ?? task.id}</h1>
            <Badge tone={HEADLINE_TONE[h.tone]}>{h.text}</Badge>
            {task.source === "email" && <span className="inline-flex items-center gap-1 text-2xs text-fg-subtle"><Icons.Mail size={11} />Tracked from email</span>}
          </div>
          <p className="mt-1 text-[14px] text-fg-muted">{task.title}</p>
          <p className="mt-0.5 text-xs text-fg-subtle">{[task.endCustomer, task.siteId, task.id].filter(Boolean).join(" · ")}</p>
          <p className="mt-1.5 text-[13px] text-fg">Engineer: {knownEngineer(task)
            ? <b>{knownEngineer(task)}</b>
            : <span className="font-bold text-warn-fg">name not received yet</span>}</p>
        </div>
        <div className="text-right">
          <p className="text-2xs font-medium uppercase tracking-[0.07em] text-fg-subtle">{billed ? "Billed" : "Estimated"}</p>
          <p className={cx("num text-[26px] font-semibold leading-tight tracking-tight", billed ? "text-fg" : "text-fg-muted")}>{fmtUSD(value)}</p>
          {task.invoiceId && <Link href={`/admin/invoices/${task.invoiceId}`} className="font-mono text-2xs text-brand-soft hover:text-brand">On invoice {task.invoiceNumber}</Link>}
        </div>
      </div>

      {/* ── Progress ── */}
      <section aria-label="Progress" className="mb-4 rounded-xl border border-line bg-panel px-3 py-5 sm:px-6">
        <StageTracker task={task} />
      </section>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="min-w-0 space-y-4 lg:col-span-7">
          <Panel title="What happened" subtitle="Orange's emails and the engineer's on-site times, in order">
            <JobTimeline task={task} />
          </Panel>
          <Panel title="Change history" subtitle="Every change to this work order, who or what made it, and why">
            <JobHistory taskId={task.id} version={JSON.stringify([task.status, task.emailLog?.length, task.customerChargeUSD, task.cancelledAt, task.engineerName, task.hotelNights])} />
          </Panel>
        </div>

        <div className="min-w-0 space-y-4 lg:col-span-5">
          <EngineerPanel key={`${task.engineerName}-${task.hotelNights}`} task={task} onSaved={refresh} />
          <Panel title="Billing" subtitle={billed ? "Locked when Orange cleared the visit" : "Calculated from the pricing rules; final on closure"}>
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line">
              {[
                { l: "Charge", v: task.customerChargeUSD ?? value, c: "text-fg" },
                { l: "FE pay", v: task.engineerPaymentUSD, c: "text-fg-muted" },
                { l: "Profit", v: task.profit, c: "text-ok-fg" },
              ].map((b) => (
                <div key={b.l} className="bg-panel px-3 py-2.5">
                  <p className="text-2xs text-fg-subtle">{b.l}</p>
                  <p className={cx("num mt-0.5 text-[17px] font-semibold", b.v == null ? "text-fg-faint" : b.c)}>{b.v == null ? "—" : fmtUSD(b.v)}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-fg-subtle">{task.maintenanceLevel} · {task.serviceLevel} · {task.distanceBand} · {task.visitDuration}</p>
            {task.pricingBasis?.length ? <div className="mt-4"><PricingBasis lines={task.pricingBasis} /></div> : null}
            {["approved", "completed"].includes(task.status) && <div className="mt-4 border-t border-line pt-4"><ConfidenceReasons task={task} /></div>}
            {canReprice && (
              <div className="mt-4 flex gap-2">
                {!task.pricingReviewed && (
                  <Button className="flex-1" onClick={async () => { if (await confirmPricing(task.id, "Confirmed on the job page")) refresh(); }}>
                    <Icons.Check size={14} />Price is right
                  </Button>
                )}
                <Button className="flex-1" onClick={() => setRepricing(true)}><Icons.Edit size={14} />Adjust pricing</Button>
              </div>
            )}
            {(task.status === "completed" || canCancel) && (
              <div className="mt-4 flex gap-2 border-t border-line pt-4">
                {task.status === "completed" && (
                  <Button variant="success" className="flex-1" onClick={approve} disabled={approving}>
                    <Icons.Check size={14} />{approving ? "Billing…" : "Approve & bill"}
                  </Button>
                )}
                {canCancel && <Button variant="danger" className="flex-1" onClick={() => setCancelling(true)}>Cancel work order</Button>}
              </div>
            )}
          </Panel>

          <Panel title="Site & contacts">
            <dl className="-my-2 divide-y divide-line/60">
              <Row label="End customer">{task.endCustomer}</Row>
              <Row label="Site">{task.location}</Row>
              <Row label="Equipment">{task.product}</Row>
              <Row label="Booked arrival">{task.scheduledAt && fmtDate(task.scheduledAt)}</Row>
              <Row label="Site contact">{task.siteContact}</Row>
              <Row label="Dispatched by">{task.assignedBy}</Row>
              <Row label="Partner">{task.asp}</Row>
            </dl>
          </Panel>

          {task.comments && (
            <Panel title="Closure notes" subtitle="From Orange's cleared notification">
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-fg-muted">{task.comments}</p>
            </Panel>
          )}

          {task.description && (
            <Panel title="Dispatch instructions">
              <div className="text-[13px]"><Expandable text={task.description} /></div>
            </Panel>
          )}
        </div>
      </div>

      {repricing && <RepriceModal task={task} onClose={() => setRepricing(false)} onDone={() => { setRepricing(false); refresh(); }} />}
      {cancelling && <CancelModal task={task as Task} onCancel={cancel} onClose={() => setCancelling(false)} />}
    </div>
  );
}

