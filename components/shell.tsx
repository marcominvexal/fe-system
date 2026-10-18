"use client";

import { createContext, useContext, useState } from "react";
import type { RangeKey } from "@/lib/analytics";

export type JobView = "all" | "open" | "closure" | "late" | "cleared" | "pricing" | "billed" | "cancelled";

/** UI-only state shared across admin pages (search, reporting period, work-order view). */
interface ShellState {
  query: string;
  setQuery: (q: string) => void;
  range: RangeKey;
  setRange: (r: RangeKey) => void;
  jobView: JobView;
  setJobView: (v: JobView) => void;
}

const Ctx = createContext<ShellState>({
  query: "", setQuery: () => {}, range: "30d", setRange: () => {}, jobView: "all", setJobView: () => {},
});

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<RangeKey>("30d");
  const [jobView, setJobView] = useState<JobView>("all");
  return <Ctx.Provider value={{ query, setQuery, range, setRange, jobView, setJobView }}>{children}</Ctx.Provider>;
}

export const useShell = () => useContext(Ctx);
