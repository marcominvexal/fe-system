"use client";

import { createContext, useContext, useState } from "react";
import type { RangeKey } from "@/lib/analytics";

/** UI-only state shared across admin pages (search + reporting period). */
interface ShellState {
  query: string;
  setQuery: (q: string) => void;
  range: RangeKey;
  setRange: (r: RangeKey) => void;
}

const Ctx = createContext<ShellState>({
  query: "", setQuery: () => {}, range: "30d", setRange: () => {},
});

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<RangeKey>("30d");
  return <Ctx.Provider value={{ query, setQuery, range, setRange }}>{children}</Ctx.Provider>;
}

export const useShell = () => useContext(Ctx);
