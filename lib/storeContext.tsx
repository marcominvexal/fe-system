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

  const refresh = useCallback(() => {
    fetch("/api/tasks")
      .then((r) => r.json())
      .then((data: Task[]) => setSnapshot(data))
      .catch((err) => console.error("[StoreContext] fetch /api/tasks failed:", err));
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
