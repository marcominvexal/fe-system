"use client";

import { useEffect, useState } from "react";
import type { AuditEntry } from "@/lib/repo";
import { Icons } from "./icons";
import { cx } from "./ui";

const ACTOR: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  email:  { label: "Orange email", icon: <Icons.Mail size={12} />,    cls: "bg-info/12 text-[#8dbaf5]" },
  ai:     { label: "AI",           icon: <Icons.Sparkle size={12} />, cls: "bg-brand/12 text-brand-soft" },
  admin:  { label: "Admin",        icon: <Icons.Users size={12} />,   cls: "bg-white/[0.06] text-fg-muted" },
  system: { label: "System",       icon: <Icons.Bolt size={12} />,    cls: "bg-white/[0.06] text-fg-subtle" },
};

// Plain names for the fields people care about
const FIELD: Record<string, string> = {
  status: "Status", customerChargeUSD: "Charge", engineerPaymentUSD: "FE pay", profit: "Profit",
  invoiceNumber: "Invoice", visitDuration: "Visit length", maintenanceLevel: "Maintenance", serviceLevel: "SLA",
  distanceBand: "Distance", checkInTime: "Arrived", checkOutTime: "Left site", scheduledAt: "Booked arrival",
  emailLog: "Emails", title: "Title", location: "Site", engineerName: "Engineer", cancelReason: "Cancel reason",
  pricingBasis: "Pricing reasons", onSiteTimes: "On-site times", comments: "Closure notes", approved: "Approved",
};
const HIDDEN = new Set(["ruleKey", "acceptedAt", "duration", "updatedAt", "id", "createdAt", "openedAt", "asp", "source", "workOrder", "customer", "engineerId", "maintenanceType", "endCustomer", "siteId", "product", "assignedBy", "siteContact", "description"]);

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    return new Date(v).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

export function JobHistory({ taskId, version }: { taskId: string; version: string }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/audit?id=${encodeURIComponent(taskId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: AuditEntry[]) => { if (live) setEntries(d); })
      .catch(() => { if (live) setEntries([]); });
    return () => { live = false; };
  }, [taskId, version]);

  if (entries === null) return <p className="py-4 text-xs text-fg-subtle">Loading history…</p>;
  if (!entries.length) return <p className="py-4 text-xs text-fg-subtle">No recorded changes yet.</p>;

  return (
    <ol className="space-y-3">
      {entries.map((e) => {
        const a = ACTOR[e.actor] ?? ACTOR.system;
        const changes = Object.entries(e.changes ?? {}).filter(([k]) => !HIDDEN.has(k));
        return (
          <li key={e.id} className="flex gap-3">
            <span className={cx("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full", a.cls)} title={a.label}>{a.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[13px] text-fg">
                  <span className="font-medium">{a.label}</span>
                  <span className="text-fg-subtle"> {e.action === "created" ? "created the work order" : e.action === "imported" ? "imported the work order" : e.action === "deleted" ? "deleted the work order" : "updated"}</span>
                </p>
                <span className="num shrink-0 text-2xs text-fg-faint">{fmt(e.at)}</span>
              </div>
              {e.reason && <p className="mt-0.5 truncate text-2xs text-fg-subtle" title={e.reason}>{e.reason}</p>}
              {changes.length > 0 && e.action !== "created" && (
                <ul className="mt-1.5 space-y-0.5 rounded-md bg-canvas/60 px-2.5 py-1.5">
                  {changes.map(([k, [before, after]]) => (
                    <li key={k} className="flex flex-wrap items-baseline gap-x-1.5 text-2xs">
                      <span className="text-fg-subtle">{FIELD[k] ?? k}</span>
                      <span className="num text-fg-faint line-through decoration-fg-faint/60">{fmt(before)}</span>
                      <Icons.ChevronR size={10} className="self-center text-fg-faint" />
                      <span className="num font-medium text-fg">{fmt(after)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
