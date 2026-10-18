"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";
import type { Task } from "./store";
import { setPricing, type PricingConfig } from "./pricing";

interface StoreContextType {
  tasks: Task[];
  refresh: () => void;
}

const StoreContext = createContext<StoreContextType>({
  tasks: [],
  refresh: () => {},
});

export function StoreProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Task[]>([]);

  // Tasks and the active pricing config arrive together, so estimates on
  // screen always use the same rates the server bills with.
  const refresh = useCallback(() => {
    Promise.all([
      fetch("/api/tasks").then((r) => r.json()) as Promise<Task[]>,
      fetch("/api/settings/pricing").then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<{ config?: PricingConfig } | null>,
    ])
      .then(([data, pricing]) => {
        if (pricing?.config) setPricing(pricing.config);
        setSnapshot(data);
      })
      .catch((err) => console.error("[StoreContext] fetch failed:", err));
  }, []);

  // Fetch on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <StoreContext.Provider value={{ tasks: snapshot, refresh }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  return useContext(StoreContext);
}
