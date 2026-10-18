"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Task } from "@/lib/store";
import { useStore } from "@/lib/storeContext";
import type { Finding, FindingType, Severity } from "@/lib/insights";
import { pricingConfidence, needsReview } from "@/lib/confidence";
import { parseStatement, reconcile, type ReconLine, type MatchStatus, type ParsedStatement } from "@/lib/reconcile";
import { fmtUSD } from "@/lib/analytics";
import { Icons } from "@/components/icons";
import { Badge, Button, Modal, PageHeader, Panel, Segmented, Stat, StatStrip, cx, inputCls, labelCls, textareaCls, type Tone } from "@/components/ui";
import { ConfidenceBadge, RepriceModal, confirmPricing } from "@/components/pricingReview";
import { downloadText } from "@/components/billing";

type Tab = "findings" | "review" | "reconcile";
interface InsightsData {
  findings: Finding[];
  dismissed: (Finding & { dismissed: { at: string; reason: string } })[];
  summary: { atRisk: number; overdue: number; high: number; total: number; byGroup: Record<string, number> };
}

const GROUP: Record<FindingType, string> = {
  cleared_not_billed: "Revenue leakage", billed_not_invoiced: "Revenue leakage", unlinked_thread: "Revenue leakage",
  closure_without_dispatch: "Revenue leakage", stale_open: "Revenue leakage",
  duplicate_work_order: "Anomaly", implausible_duration: "Anomaly", visit_band_mismatch: "Anomaly",
  price_mismatch: "Anomaly", late_arrival: "Anomaly", pricing_review: "Pricing review",
  invoice_overdue: "Collections", payout_overdue: "Collections",
};
const GROUP_ORDER = ["Revenue leakage", "Anomaly", "Pricing review", "Collections"];
const SEV: Record<Severity, { tone: Tone; stripe: string; label: string }> = {
  high:   { tone: "crit", stripe: "bg-crit", label: "High" },
  medium: { tone: "warn", stripe: "bg-warn", label: "Medium" },
  low:    { tone: "neutral", stripe: "bg-fg-faint", label: "Low" },
};

// ── Findings ─────────────────────────────────────────────────────────────────
function FindingRow({ f, onDismiss }: { f: Finding; onDismiss: (f: Finding) => void }) {
  const s = SEV[f.severity];
  return (
    <li className="relative flex flex-wrap items-start gap-x-4 gap-y-2 py-3 pl-4 pr-4 sm:pr-5">
      <span className={cx("absolute bottom-3 left-0 top-3 w-[3px] rounded-r", s.stripe)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] font-medium text-fg">{f.title}</p>
          <Badge tone={s.tone} dot={false}>{s.label}</Badge>
        </div>
        <p className="mt-0.5 text-xs text-fg-subtle">{f.detail}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {f.amount != null && f.amount > 0 && <span className="num w-20 text-right text-[13px] font-semibold text-fg">{fmtUSD(f.amount)}</span>}
        {f.href && <Link href={f.href} className="inline-flex h-7 items-center gap-1 rounded-lg bg-raised px-2.5 text-xs font-medium text-fg ring-1 ring-inset ring-line-strong hover:bg-hover">{f.action ?? "Open"}<Icons.ChevronR size={12} /></Link>}
        <button onClick={() => onDismiss(f)} className="h-7 rounded-lg px-2 text-xs text-fg-subtle hover:bg-white/5 hover:text-fg">Dismiss</button>
      </div>
    </li>
  );
}

// ── Reconciliation ───────────────────────────────────────────────────────────
const MATCH: Record<MatchStatus, { label: string; tone: Tone; help: string }> = {
  matched:        { label: "Matched", tone: "ok", help: "Same work order and amount" },
  amount_differs: { label: "Amount differs", tone: "warn", help: "Both have it, amounts differ" },
  missing_ours:   { label: "Not in our billing", tone: "crit", help: "Orange lists it, we have no billed visit" },
  missing_theirs: { label: "Not on statement", tone: "crit", help: "We billed it, Orange did not list it" },
};

function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return { from: new Date(`${ym}-01T00:00:00+05:00`).getTime(), to: new Date(Date.UTC(y, m, 1)).getTime() - 5 * 3_600_000 };
}

function Reconcile({ tasks }: { tasks: Task[] }) {
  const defMonth = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })();
  const [month, setMonth] = useState(defMonth);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedStatement | null>(null);
  const [filter, setFilter] = useState<MatchStatus | "all">("all");

  const ours = useMemo(() => {
    const { from, to } = monthRange(month);
    return tasks.filter((t) => {
      if (t.status !== "approved") return false;
      const c = t.emailLog?.find((e) => e.kind === "cleared")?.at ?? t.checkOutTime;
      const ms = c ? new Date(c).getTime() : NaN;
      return ms >= from && ms < to;
    });
  }, [tasks, month]);
  const lines: ReconLine[] = useMemo(() => (parsed?.rows.length ? reconcile(parsed.rows, ours) : []), [parsed, ours]);
  const count = (s: MatchStatus) => lines.filter((l) => l.status === s).length;
  const theirsTotal = lines.reduce((s, l) => s + (l.theirs ?? 0), 0);
  const oursTotal = lines.reduce((s, l) => s + (l.ours ?? 0), 0);
  const shown = filter === "all" ? lines : lines.filter((l) => l.status === filter);

  const onFile = async (file?: File) => {
    if (!file) return;
    setFileName(file.name);
    setParsed(parseStatement(await file.text()));
  };

  const exportCsv = () => {
    const rows = [["Work order", "Result", "Orange amount", "Our amount", "Difference", "Our invoice"],
      ...lines.map((l) => [l.workOrder, MATCH[l.status].label, l.theirs ?? "", l.ours ?? "", l.difference ?? "", l.invoiceNumber ?? ""])];
    downloadText(`reconciliation-${month}.csv`, "﻿" + rows.map((r) => r.map((c) => /[",]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c).join(",")).join("\r\n"));
  };

  return (
    <div className="space-y-4">
      <Panel title="Compare with Orange's statement" subtitle="Upload the monthly statement Orange sends (CSV). Each line is matched to our billed visits by work order number.">
        <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
          <div>
            <label className={labelCls} htmlFor="rc-month">Statement month</label>
            <input id="rc-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls} />
          </div>
          <div>
            <p className={labelCls}>Statement file</p>
            <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-canvas px-3 text-[13px] ring-1 ring-inset ring-line-strong hover:ring-brand/60"
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }}>
              <Icons.Upload size={14} className="text-fg-subtle" />
              <span className={cx("truncate", fileName ? "text-fg" : "text-fg-faint")}>{fileName || "Choose or drop a .csv file"}</span>
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          </div>
        </div>
        <p className="mt-2 text-2xs text-fg-subtle">{ours.length} billed visit{ours.length === 1 ? "" : "s"} on our side for this month. Excel files: save as CSV first.</p>
        {parsed?.error && <p role="alert" className="mt-3 text-xs text-[#f08a84]">{parsed.error}</p>}
        {parsed?.columns && (
          <p className="mt-3 text-xs text-fg-subtle">
            Read {parsed.rows.length} line{parsed.rows.length === 1 ? "" : "s"} using columns “{parsed.columns.workOrder}” and “{parsed.columns.amount}”{parsed.skipped ? `; skipped ${parsed.skipped} row(s) without a work order or amount (e.g. totals)` : ""}.
          </p>
        )}
      </Panel>

      {lines.length > 0 && (
        <>
          <StatStrip>
            <Stat label="Matched" value={count("matched")} foot={`of ${lines.length} work orders`} />
            <Stat label="Amount differs" value={count("amount_differs")} foot={fmtUSD(lines.filter((l) => l.status === "amount_differs").reduce((s, l) => s + Math.abs(l.difference ?? 0), 0)) + " difference"} />
            <Stat label="Missing" value={count("missing_ours") + count("missing_theirs")} foot={`${count("missing_ours")} not billed · ${count("missing_theirs")} not on statement`} />
            <Stat label="Net difference" value={fmtUSD(theirsTotal - oursTotal)} foot={`Orange ${fmtUSD(theirsTotal)} · ours ${fmtUSD(oursTotal)}`} accent={Math.abs(theirsTotal - oursTotal) >= 0.5} />
          </StatStrip>
          <section className="overflow-hidden rounded-xl border border-line bg-panel">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-3.5 sm:px-5">
              <div className="scroll-thin -mx-1 max-w-full overflow-x-auto px-1">
                <Segmented label="Result filter" value={filter} onChange={setFilter}
                  options={(["all", "amount_differs", "missing_ours", "missing_theirs", "matched"] as const).map((v) => ({
                    value: v, label: <span className="flex items-center gap-1.5 whitespace-nowrap">{v === "all" ? "All" : MATCH[v].label}<span className="num text-fg-faint">{v === "all" ? lines.length : count(v)}</span></span>,
                  }))} />
              </div>
              <Button size="sm" onClick={exportCsv}><Icons.Invoice size={13} />Export results</Button>
            </div>
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 text-[13px]">
                <thead>
                  <tr className="text-2xs uppercase tracking-[0.06em] text-fg-subtle">
                    {["Work order", "Result", "Orange", "Ours", "Difference"].map((h, i) => (
                      <th key={h} className={cx("border-y border-line bg-raised px-3 py-2 font-medium first:pl-5 last:pr-5", i >= 2 ? "text-right" : "text-left")}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((l) => (
                    <tr key={l.workOrder + l.status} className="hover:bg-white/[0.025]">
                      <td className="border-b border-line/70 px-3 py-2.5 pl-5">
                        {l.taskId ? <Link href={`/admin/jobs/${l.taskId}`} className="font-mono font-semibold text-fg hover:text-brand-soft">{l.workOrder}</Link> : <span className="font-mono font-semibold text-fg">{l.workOrder}</span>}
                        {l.invoiceNumber && <p className="text-2xs text-fg-subtle">On {l.invoiceNumber}</p>}
                      </td>
                      <td className="border-b border-line/70 px-3 py-2.5"><Badge tone={MATCH[l.status].tone}>{MATCH[l.status].label}</Badge></td>
                      <td className="num border-b border-line/70 px-3 py-2.5 text-right text-fg">{l.theirs != null ? fmtUSD(l.theirs) : "—"}</td>
                      <td className="num border-b border-line/70 px-3 py-2.5 text-right text-fg">{l.ours != null ? fmtUSD(l.ours) : "—"}</td>
                      <td className={cx("num border-b border-line/70 px-3 py-2.5 pr-5 text-right font-medium", (l.difference ?? 0) > 0 ? "text-[#7bcfa2]" : (l.difference ?? 0) < 0 ? "text-[#f08a84]" : "text-fg-subtle")}>
                        {l.difference != null && l.difference !== 0 ? `${l.difference > 0 ? "+" : "−"}${fmtUSD(Math.abs(l.difference))}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function InsightsPage() {
  const { tasks, refresh } = useStore();
  const [tab, setTab] = useState<Tab>("findings");
  const [data, setData] = useState<InsightsData | null>(null);
  const [dismissTarget, setDismissTarget] = useState<Finding | null>(null);
  const [reason, setReason] = useState("");
  const [showDismissed, setShowDismissed] = useState(false);
  const [reprice, setReprice] = useState<Task | null>(null);

  const load = useCallback(() => {
    fetch("/api/insights", { cache: "no-store" }).then((r) => r.json()).then(setData).catch(() => {});
  }, []);
  // Recompute whenever work orders change (e.g. after a price is confirmed)
  useEffect(() => { load(); }, [load, tasks]);

  const review = useMemo(() => tasks.filter(needsReview).sort((a, b) => pricingConfidence(a).score - pricingConfidence(b).score), [tasks]);
  const reviewedOk = tasks.filter((t) => ["approved", "completed"].includes(t.status) && !t.invoiceId && !needsReview(t)).length;

  const dismiss = async () => {
    if (!dismissTarget || !reason.trim()) return;
    await fetch("/api/insights", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss", key: dismissTarget.key, title: dismissTarget.title, reason }) });
    setDismissTarget(null); setReason(""); load();
  };
  const restore = async (key: string) => {
    await fetch("/api/insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore", key }) });
    load();
  };

  const findings = data?.findings ?? [];
  const groups = GROUP_ORDER.map((g) => ({ g, items: findings.filter((f) => GROUP[f.type] === g) })).filter((x) => x.items.length);

  return (
    <div>
      <PageHeader title="Insights" subtitle="Money at risk, unusual work orders, prices to check, and Orange's statement compared with your billing" />

      <StatStrip>
        <Stat label="Revenue at risk" value={fmtUSD(data?.summary.atRisk ?? 0)} foot="Leakage, anomalies and unsure prices" accent={(data?.summary.atRisk ?? 0) > 0} />
        <Stat label="Overdue from Orange" value={fmtUSD(data?.summary.overdue ?? 0)} foot="Sent invoices past due" />
        <Stat label="High priority" value={data?.summary.high ?? 0} foot={`${data?.summary.total ?? 0} open finding(s)`} />
        <Stat label="Prices to review" value={review.length} foot={`${reviewedOk} billed visit(s) confident`} />
      </StatStrip>

      <div className="mb-4">
        <Segmented<Tab> label="Insights view" value={tab} onChange={setTab}
          options={[
            { value: "findings", label: <span className="flex items-center gap-1.5">Findings<span className="num text-fg-faint">{findings.length}</span></span> },
            { value: "review", label: <span className="flex items-center gap-1.5">Pricing review<span className="num text-fg-faint">{review.length}</span></span> },
            { value: "reconcile", label: "Reconcile statement" },
          ]} />
      </div>

      {tab === "findings" && (
        <div className="space-y-4">
          {data === null && <p className="py-10 text-center text-xs text-fg-subtle">Checking work orders, emails and invoices…</p>}
          {data && !findings.length && (
            <div className="rounded-xl border border-line bg-panel px-6 py-12 text-center">
              <Icons.Check size={22} className="mx-auto text-[#7bcfa2]" />
              <p className="mt-2 text-[14px] font-medium text-fg">Nothing needs attention</p>
              <p className="mt-1 text-xs text-fg-subtle">Every cleared visit is billed, prices are confident, and nothing is overdue.</p>
            </div>
          )}
          {groups.map(({ g, items }) => (
            <section key={g} className="overflow-hidden rounded-xl border border-line bg-panel">
              <header className="flex items-center justify-between border-b border-line px-4 py-2.5 sm:px-5">
                <h2 className="text-[13px] font-semibold text-fg">{g}</h2>
                <span className="num text-2xs text-fg-subtle">{items.length} · {fmtUSD(items.reduce((s, f) => s + (f.amount ?? 0), 0))}</span>
              </header>
              <ul className="divide-y divide-line/60">{items.map((f) => <FindingRow key={f.key} f={f} onDismiss={(x) => { setDismissTarget(x); setReason(""); }} />)}</ul>
            </section>
          ))}
          {data && data.dismissed.length > 0 && (
            <div>
              <button onClick={() => setShowDismissed((v) => !v)} className="text-xs text-fg-subtle hover:text-fg">
                {showDismissed ? "Hide" : "Show"} {data.dismissed.length} dismissed finding{data.dismissed.length === 1 ? "" : "s"}
              </button>
              {showDismissed && (
                <ul className="mt-2 divide-y divide-line/60 rounded-xl border border-line bg-panel">
                  {data.dismissed.map((f) => (
                    <li key={f.key} className="flex items-start justify-between gap-3 px-5 py-2.5 text-[13px]">
                      <div className="min-w-0"><p className="text-fg-muted">{f.title}</p><p className="text-2xs text-fg-subtle">Dismissed: {f.dismissed.reason}</p></div>
                      <Button size="sm" onClick={() => restore(f.key)}>Restore</Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "review" && (
        <div className="space-y-3">
          <p className="text-xs text-fg-subtle">Billed or cleared visits whose price the system is less than 70% sure about. Confirm the price if it is right, or adjust it before it goes on an invoice.</p>
          {!review.length && (
            <div className="rounded-xl border border-line bg-panel px-6 py-12 text-center">
              <Icons.Check size={22} className="mx-auto text-[#7bcfa2]" />
              <p className="mt-2 text-[14px] font-medium text-fg">No prices to review</p>
              <p className="mt-1 text-xs text-fg-subtle">Every billed visit not yet invoiced was priced with high confidence.</p>
            </div>
          )}
          {review.map((t) => {
            const c = pricingConfidence(t);
            return (
              <article key={t.id} className="rounded-xl border border-line bg-panel p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/jobs/${t.id}`} className="font-mono text-[14px] font-semibold text-fg hover:text-brand-soft">{t.workOrder ?? t.id}</Link>
                      <ConfidenceBadge c={c} />
                    </p>
                    <p className="mt-0.5 text-xs text-fg-muted">{t.title}</p>
                    <p className="mt-0.5 text-2xs text-fg-subtle">{t.maintenanceLevel} · {t.serviceLevel} · {t.distanceBand} · {t.visitDuration}{t.duration ? ` · ${t.duration} on site` : ""}</p>
                  </div>
                  <p className="num text-[18px] font-semibold text-fg">{fmtUSD(t.customerChargeUSD ?? 0)}</p>
                </div>
                <ul className="mt-3 space-y-1">
                  {c.reasons.map((r) => (
                    <li key={r.text} className="flex gap-2 text-xs text-fg-muted"><span className="num w-8 shrink-0 text-right text-2xs text-[#f08a84]">−{r.points}</span>{r.text}</li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="success" onClick={async () => { if (await confirmPricing(t.id, "Confirmed in pricing review")) refresh(); }}>
                    <Icons.Check size={13} />Price is right
                  </Button>
                  <Button size="sm" onClick={() => setReprice(t)}>Adjust pricing</Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {tab === "reconcile" && <Reconcile tasks={tasks} />}

      {dismissTarget && (
        <Modal onClose={() => setDismissTarget(null)} label="Dismiss finding">
          <h3 className="text-[15px] font-semibold text-fg">Dismiss finding</h3>
          <p className="mt-1 text-[13px] text-fg-muted">{dismissTarget.title}</p>
          <label className={cx(labelCls, "mt-4")} htmlFor="dis-why">Why can it be ignored?</label>
          <textarea id="dis-why" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={textareaCls} autoFocus
            placeholder="e.g. Orange agreed the late arrival was caused by site access" />
          <div className="mt-4 flex gap-2">
            <Button onClick={() => setDismissTarget(null)} className="flex-1">Cancel</Button>
            <Button variant="primary" onClick={dismiss} disabled={!reason.trim()} className="flex-1">Dismiss</Button>
          </div>
        </Modal>
      )}
      {reprice && <RepriceModal task={reprice} onClose={() => setReprice(null)} onDone={() => { setReprice(null); refresh(); }} />}
    </div>
  );
}
