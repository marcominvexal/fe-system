"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/storeContext";
import { useUser } from "@/lib/userContext";
import {
  validatePricing, type DistanceBand, type PricingConfig, type RateCategory, type VisitDuration,
} from "@/lib/pricing";
import { Icons } from "@/components/icons";
import { Button, PageHeader, Panel, Select, cx, inputCls, labelCls, textareaCls } from "@/components/ui";

const DISTANCES: DistanceBand[] = ["<50km", "50-100km", ">100km"];
const CATEGORIES: { key: RateCategory; label: string; hint: string }[] = [
  { key: "planned", label: "Planned", hint: "8x5 NBD" },
  { key: "reactive_8x5", label: "Reactive", hint: "8x5 4h" },
  { key: "reactive_24x7", label: "Reactive", hint: "24x7 4h" },
];
const DURATIONS: VisitDuration[] = ["2h", "Half Day", "Full Day"];

// Service names and response times from the signed commercial sheet
const SERVICE: Record<DistanceBand, Partial<Record<RateCategory, string>>> = {
  "<50km":    { planned: "8x5xNBD · response 24–48 h", reactive_8x5: "8x5x4 · response 4 h", reactive_24x7: "24x7x4 · response 4 h" },
  "50-100km": { planned: "8x5xNCD · response 12 h", reactive_8x5: "Not in the sheet · same as 24x7", reactive_24x7: "24x7xNCD · response 12–24 h" },
  ">100km":   { planned: "8x5xNCD · response 24 h", reactive_8x5: "Not in the sheet · same as 24x7", reactive_24x7: "24x7xNCD · response 24–48 h" },
};
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface HistoryItem { id: number; at: string; actor: string; changes: Record<string, [unknown, unknown]>; reason: string | null }

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const fmtAt = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function NumberField({ id, label, value, onChange, suffix, step = 1, min = 0 }: {
  id: string; label: string; value: number; onChange: (n: number) => void; suffix?: string; step?: number; min?: number;
}) {
  return (
    <div>
      <label className={labelCls} htmlFor={id}>{label}</label>
      <div className="relative">
        <input id={id} type="number" step={step} min={min} value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))}
          className={cx(inputCls, "num", suffix && "pr-14")} />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-subtle">{suffix}</span>}
      </div>
    </div>
  );
}

export default function PricingRulesPage() {
  const { refresh } = useStore();
  const { user, isAdmin } = useUser();
  const [saved, setSaved] = useState<PricingConfig | null>(null);
  const [cfg, setCfg] = useState<PricingConfig | null>(null);
  const [defaults, setDefaults] = useState<PricingConfig | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [newCity, setNewCity] = useState("");

  const load = useCallback(() => {
    fetch("/api/settings/pricing", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      setSaved(d.config); setCfg(clone(d.config)); setDefaults(d.defaults); setHistory(d.history ?? []);
    });
  }, []);
  useEffect(() => { load(); }, [load]);

  const dirty = useMemo(() => !!cfg && !!saved && JSON.stringify(cfg) !== JSON.stringify(saved), [cfg, saved]);
  const errors = useMemo(() => (cfg ? validatePricing(cfg) : []), [cfg]);

  if (!cfg || !saved || !defaults) return <p className="py-24 text-center text-[13px] text-fg-subtle">Loading pricing rules…</p>;

  const set = (fn: (c: PricingConfig) => void) => setCfg((c) => { const n = clone(c!); fn(n); return n; });
  const fePay = (charge: number) => Math.round(charge * (Number.isFinite(cfg.fePayPct) ? cfg.fePayPct : 0));

  const save = async () => {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/settings/pricing", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: cfg, reason: reason.trim() || undefined }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: d.error ?? "Could not save." }); return; }
    setMsg({ ok: true, text: `Saved ${d.changed} change${d.changed === 1 ? "" : "s"}. New and open work orders use the new rules; billed work keeps its price.` });
    setReason("");
    load(); refresh();
  };

  const cities = Object.entries(cfg.rules.cityDistance).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="pb-24">
      <PageHeader title="Contract & rates"
        subtitle="The monthly contract with Orange, the rate card for visits beyond it, and the rules that price work orders automatically. Billed visits keep their price." />

      {user && !isAdmin && (
        <p className="mb-4 rounded-lg border border-line bg-panel px-4 py-2.5 text-[13px] text-fg-subtle">Read-only: only an admin can change pricing rules and invoice settings.</p>
      )}

      {msg && (
        <div role="status" className={cx("mb-4 rounded-lg border px-4 py-2.5 text-[13px]", msg.ok ? "border-ok/25 bg-ok/[0.07] text-ok-fg" : "border-crit/25 bg-crit/[0.07] text-crit-fg")}>{msg.text}</div>
      )}

      <fieldset disabled={!isAdmin} className="min-w-0">

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="min-w-0 space-y-4 xl:col-span-8">
          {/* Monthly contract */}
          <Panel title="Monthly contract" subtitle="A fixed monthly charge covers a set number of visits each billing cycle. Visits beyond that are billed at the rate card below.">
            <label className="mb-4 flex cursor-pointer items-start gap-3 border border-line p-3">
              <input type="checkbox" checked={cfg.contract.enabled} onChange={(e) => set((c) => { c.contract.enabled = e.target.checked; })}
                className="mt-0.5 h-4 w-4 accent-[#ff7900]" />
              <span>
                <span className="block text-[13px] font-bold text-fg">Bill with the monthly charge</span>
                <span className="block text-xs text-fg-subtle">When off, every visit is billed at the rate card and there is no monthly charge.</span>
              </span>
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
              <NumberField id="k-mrc" label="Monthly charge (MRC)" suffix="USD" value={cfg.contract.mrcUSD}
                onChange={(n) => set((c) => { c.contract.mrcUSD = n; })} />
              <NumberField id="k-in" label="In-city visits included" suffix="visits" value={cfg.contract.includedInCity}
                onChange={(n) => set((c) => { c.contract.includedInCity = n; })} />
              <NumberField id="k-inter" label="Intercity visits included" suffix="visits" value={cfg.contract.includedInterCity}
                onChange={(n) => set((c) => { c.contract.includedInterCity = n; })} />
              <NumberField id="k-hotel" label="Hotel, per night" suffix="USD" value={cfg.contract.hotelPerNightUSD}
                onChange={(n) => set((c) => { c.contract.hotelPerNightUSD = n; })} />
              <NumberField id="k-fx" label="Exchange rate" suffix="PKR/USD" step={0.01} value={cfg.contract.usdToPkr}
                onChange={(n) => set((c) => { c.contract.usdToPkr = n; })} />
              <NumberField id="k-day" label="Billing cycle starts on day" suffix="of month" min={1} value={cfg.contract.cycleStartDay}
                onChange={(n) => set((c) => { c.contract.cycleStartDay = n; })} />
            </div>
            <p className="mt-4 bg-brand-tint px-3 py-2.5 text-[13px] text-fg">
              Each cycle (the {cfg.contract.cycleStartDay}th to the {cfg.contract.cycleStartDay - 1}th) Orange pays <b>${(cfg.contract.mrcUSD || 0).toLocaleString("en-US")}</b>
              {" "}(PKR {Math.round((cfg.contract.mrcUSD || 0) * (cfg.contract.usdToPkr || 0)).toLocaleString("en-US")}) for up to {(cfg.contract.includedInCity || 0) + (cfg.contract.includedInterCity || 0)} visits:
              {" "}{cfg.contract.includedInCity} within 50 km and {cfg.contract.includedInterCity} beyond. Extra visits use the rate card; overnight stays add ${cfg.contract.hotelPerNightUSD} a night.
            </p>
          </Panel>

          {/* Rate card */}
          <Panel title="Rate card" subtitle={`Charge per visit in USD, used for visits beyond the monthly commitment. Engineer pay is ${Math.round((cfg.fePayPct || 0) * 100)}% of each rate.`}>
            <div className="space-y-5">
              {DISTANCES.map((band) => (
                <div key={band}>
                  <p className="mb-2 flex items-center gap-2 text-[13px] font-medium text-fg"><Icons.MapPin size={13} className="text-brand" />Distance <span className="font-mono text-brand-soft">{band}</span></p>
                  <div className="scroll-thin overflow-x-auto">
                    <table className="w-full min-w-[460px] text-[13px]">
                      <thead>
                        <tr className="text-2xs uppercase tracking-[0.06em] text-fg-subtle">
                          <th className="w-40 pb-1.5 text-left font-medium">Work type</th>
                          {DURATIONS.map((v) => <th key={v} className="pb-1.5 text-left font-medium">{v}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {CATEGORIES.map((c) => (
                          <tr key={c.key}>
                            <td className="py-1 pr-3 text-fg-muted">{c.label} <span className="text-2xs text-fg-subtle">{c.hint}</span>
                              {SERVICE[band][c.key] && <span className="block text-2xs text-fg-faint">{SERVICE[band][c.key]}</span>}</td>
                            {DURATIONS.map((v) => {
                              const val = cfg.table[band][c.key][v];
                              const changed = val !== saved.table[band][c.key][v];
                              return (
                                <td key={v} className="py-1 pr-2">
                                  <div className="relative">
                                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-fg-faint">$</span>
                                    <input type="number" min={0} step={1} aria-label={`${band} ${c.label} ${c.hint} ${v}`}
                                      value={Number.isFinite(val) ? val : ""}
                                      onChange={(e) => set((n) => { n.table[band][c.key][v] = e.target.value === "" ? NaN : Number(e.target.value); })}
                                      className={cx(inputCls, "num h-8 pl-6", changed && "ring-brand/60")} />
                                  </div>
                                  <p className="num mt-0.5 text-2xs text-fg-faint">FE ${fePay(val)}</p>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          {/* Automatic pricing rules */}
          <Panel title="Automatic pricing" subtitle="How work type, SLA tier and visit length are read from Orange's emails">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField id="r-planned" label="Planned if booked at least" suffix="hours" value={cfg.rules.plannedLeadHours}
                onChange={(n) => set((c) => { c.rules.plannedLeadHours = n; })} />
              <NumberField id="r-urgent" label="4-hour SLA if booked within" suffix="hours" value={cfg.rules.urgentLeadHours}
                onChange={(n) => set((c) => { c.rules.urgentLeadHours = n; })} />
              <NumberField id="r-2h" label="Bill as 2h up to" suffix="min" value={cfg.rules.visitBands.twoHourMaxMin}
                onChange={(n) => set((c) => { c.rules.visitBands.twoHourMaxMin = n; })} />
              <NumberField id="r-half" label="Bill as half day up to" suffix="min" value={cfg.rules.visitBands.halfDayMaxMin}
                onChange={(n) => set((c) => { c.rules.visitBands.halfDayMaxMin = n; })} />
              <div className="sm:col-span-2">
                <p className={labelCls}>Business hours (Pakistan time) — urgent dispatches outside them are 24x7</p>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Business days">
                    {DAYS.map((label, i) => {
                      const on = cfg.rules.businessDays.includes(i);
                      return (
                        <button key={label} type="button" aria-pressed={on}
                          onClick={() => set((c) => { c.rules.businessDays = on ? c.rules.businessDays.filter((d) => d !== i) : [...c.rules.businessDays, i].sort(); })}
                          className={cx("h-8 rounded-md px-2.5 text-xs font-medium ring-1 ring-inset transition-colors",
                            on ? "bg-brand/12 text-brand-soft ring-brand/40" : "text-fg-subtle ring-line-strong hover:text-fg")}>{label}</button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-fg-subtle">
                    <input type="number" min={0} max={24} aria-label="Business hours start" value={cfg.rules.businessHours.start}
                      onChange={(e) => set((c) => { c.rules.businessHours.start = Number(e.target.value); })} className={cx(inputCls, "num h-8 w-16")} />
                    to
                    <input type="number" min={0} max={24} aria-label="Business hours end" value={cfg.rules.businessHours.end}
                      onChange={(e) => set((c) => { c.rules.businessHours.end = Number(e.target.value); })} className={cx(inputCls, "num h-8 w-16")} />
                    hours
                  </div>
                </div>
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 sm:col-span-2">
                <input type="checkbox" checked={cfg.rules.autoBillOnCleared} onChange={(e) => set((c) => { c.rules.autoBillOnCleared = e.target.checked; })}
                  className="mt-0.5 h-4 w-4 accent-[#ff7900]" />
                <span>
                  <span className="block text-[13px] font-medium text-fg">Bill automatically when Orange clears a visit</span>
                  <span className="block text-xs text-fg-subtle">When off, cleared visits wait as “Cleared, not billed” for someone to approve.</span>
                </span>
              </label>
            </div>
          </Panel>

          {/* Cities */}
          <Panel title="Distance by site city" subtitle={`Cities not listed use the default band and are flagged for checking`}>
            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="r-default">Default band</label>
                <Select id="r-default" value={cfg.rules.defaultDistance} onChange={(e) => set((c) => { c.rules.defaultDistance = e.target.value as DistanceBand; })}>
                  {DISTANCES.map((d) => <option key={d}>{d}</option>)}
                </Select>
              </div>
            </div>
            <ul className="divide-y divide-line/60 rounded-lg border border-line">
              {cities.map(([city, band]) => (
                <li key={city} className="flex items-center gap-3 px-3 py-1.5">
                  <span className="flex-1 text-[13px] capitalize text-fg">{city}</span>
                  <Select aria-label={`Distance for ${city}`} value={band} className="w-36 [&_select]:h-8"
                    onChange={(e) => set((c) => { c.rules.cityDistance[city] = e.target.value as DistanceBand; })}>
                    {DISTANCES.map((d) => <option key={d}>{d}</option>)}
                  </Select>
                  <button type="button" aria-label={`Remove ${city}`} onClick={() => set((c) => { delete c.rules.cityDistance[city]; })}
                    className="grid h-8 w-8 place-items-center rounded-md text-fg-faint hover:bg-black/[0.04] hover:text-crit-fg"><Icons.X size={14} /></button>
                </li>
              ))}
              {!cities.length && <li className="px-3 py-3 text-xs text-fg-subtle">No cities yet — every site uses the default band.</li>}
            </ul>
            <form className="mt-3 flex gap-2" onSubmit={(e) => {
              e.preventDefault();
              const key = newCity.trim().toLowerCase();
              if (!key) return;
              set((c) => { c.rules.cityDistance[key] = c.rules.cityDistance[key] ?? c.rules.defaultDistance; });
              setNewCity("");
            }}>
              <input value={newCity} onChange={(e) => setNewCity(e.target.value)} placeholder="Add a city, e.g. Hyderabad" aria-label="New city" className={cx(inputCls, "h-8")} />
              <Button type="submit" size="sm" className="h-8 shrink-0"><Icons.Plus size={13} />Add city</Button>
            </form>
          </Panel>
        </div>

        <div className="min-w-0 space-y-4 xl:col-span-4">
          <Panel id="invoice-settings" className="scroll-mt-20" title="Invoice settings" subtitle="Who invoices Orange, and what prints on every invoice">
            <div className="space-y-3">
              <div>
                <label className={labelCls} htmlFor="i-name">Invoicing company</label>
                <input id="i-name" value={cfg.issuer.name} onChange={(e) => set((c) => { c.issuer.name = e.target.value; })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="i-addr">Address</label>
                <textarea id="i-addr" rows={2} value={cfg.issuer.address} onChange={(e) => set((c) => { c.issuer.address = e.target.value; })} className={textareaCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="i-tax">Tax registration (NTN)</label>
                <input id="i-tax" value={cfg.issuer.taxId} onChange={(e) => set((c) => { c.issuer.taxId = e.target.value; })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="i-bank">Payment details</label>
                <textarea id="i-bank" rows={3} value={cfg.issuer.bankDetails} onChange={(e) => set((c) => { c.issuer.bankDetails = e.target.value; })} className={textareaCls} placeholder="Bank, account title, IBAN…" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <NumberField id="i-terms" label="Payment terms" suffix="days" value={cfg.paymentTermsDays} onChange={(n) => set((c) => { c.paymentTermsDays = n; })} />
                <NumberField id="i-fe" label="Engineer pay" suffix="%" step={1} value={Math.round(cfg.fePayPct * 1000) / 10}
                  onChange={(n) => set((c) => { c.fePayPct = n / 100; })} />
              </div>
            </div>
          </Panel>

          <Panel title="Change history" subtitle="Who changed the rules, and what">
            {history.length ? (
              <ol className="space-y-3">
                {history.map((h) => (
                  <li key={h.id} className="text-[13px]">
                    <p className="flex justify-between gap-3"><span className="text-fg">{h.actor === "admin" ? "Admin" : h.actor}</span><span className="num text-2xs text-fg-faint">{fmtAt(h.at)}</span></p>
                    {h.reason && <p className="text-2xs text-fg-subtle">{h.reason}</p>}
                    <ul className="mt-1 space-y-0.5">
                      {Object.entries(h.changes ?? {}).slice(0, 8).map(([k, [a, b]]) => (
                        <li key={k} className="text-2xs text-fg-muted">
                          <span className="text-fg-subtle">{k}</span>: <span className="line-through decoration-fg-faint/60">{a === null ? "—" : String(a)}</span> → <span className="text-fg">{b === null ? "removed" : String(b)}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            ) : <p className="text-xs text-fg-subtle">No changes yet — the default rate card is in use.</p>}
          </Panel>
        </div>
      </div>

      </fieldset>

      {/* Save bar */}
      {dirty && (
        <div className="anim-pop fixed inset-x-0 bottom-0 z-30 border-t border-line-strong bg-raised/95 px-4 py-3 backdrop-blur-md lg:left-[var(--sidebar,0px)]" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 sm:px-2">
            <p className="text-[13px] text-fg">Unsaved changes</p>
            {errors.length > 0 && <p className="text-xs text-crit-fg">{errors[0]}{errors.length > 1 ? ` (+${errors.length - 1} more)` : ""}</p>}
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for the change (optional)" aria-label="Reason for the change"
              className={cx(inputCls, "h-8 max-w-xs flex-1")} />
            <div className="ml-auto flex gap-2">
              <Button size="sm" onClick={() => { setCfg(clone(saved)); setMsg(null); }}>Discard</Button>
              <Button size="sm" variant="primary" onClick={save} disabled={busy || errors.length > 0}>{busy ? "Saving…" : "Save rules"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
