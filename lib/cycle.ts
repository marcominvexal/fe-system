/**
 * /lib/cycle.ts — billing cycles (client-safe).
 *
 * Orange is billed per cycle, not per calendar month: a cycle runs from the
 * contract's start day (the 25th) to the day before it in the next month.
 * A cycle is named after the month it ends in, e.g. "November 2026"
 * covers 25 October – 24 November 2026. Dates are Pakistan time.
 */
export interface Cycle {
  key:   string;   // YYYY-MM of the month the cycle ends in
  start: string;   // YYYY-MM-DD, first day
  end:   string;   // YYYY-MM-DD, last day (inclusive)
  name:  string;   // "November 2026"
  range: string;   // "25 Oct – 24 Nov 2026"
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m, d));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (iso: string, withYear: boolean) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ""}`;
};

/** Calendar date in Pakistan (UTC+5) for an instant. */
function pkDate(at: Date | string | number) {
  const d = new Date(new Date(at).getTime() + 5 * 3_600_000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
}

/** The cycle that ends in a given month (month is 0-based). */
export function cycleEnding(y: number, m: number, startDay = 25): Cycle {
  const start = ymd(y, m - 1, startDay);
  const end = ymd(y, m, startDay - 1);
  const endDate = new Date(`${end}T00:00:00Z`);
  return {
    key: `${endDate.getUTCFullYear()}-${pad(endDate.getUTCMonth() + 1)}`,
    start, end,
    name: endDate.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
    range: `${short(start, start.slice(0, 4) !== end.slice(0, 4))} – ${short(end, true)}`,
  };
}

/** The cycle a moment falls in. */
export function cycleFor(at: Date | string | number = Date.now(), startDay = 25): Cycle {
  const { y, m, d } = pkDate(at);
  return d >= startDay ? cycleEnding(y, m + 1, startDay) : cycleEnding(y, m, startDay);
}

export function cycleByKey(key: string, startDay = 25): Cycle {
  const [y, m] = key.split("-").map(Number);
  return cycleEnding(y, m - 1, startDay);
}

/** The current cycle and the ones before it, newest first. */
export function recentCycles(count = 12, startDay = 25, now: Date | string | number = Date.now()): Cycle[] {
  const cur = cycleFor(now, startDay);
  const [y, m] = cur.key.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => cycleEnding(y, m - 1 - i, startDay));
}

/** Whether an instant falls inside a cycle (Pakistan dates, inclusive). */
export function inCycle(at: string | undefined, c: Cycle): boolean {
  if (!at) return false;
  const { y, m, d } = pkDate(at);
  const day = ymd(y, m, d);
  return day >= c.start && day <= c.end;
}
