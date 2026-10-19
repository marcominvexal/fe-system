"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { canEdit, isAdmin, type SessionUser } from "@/lib/auth/roles";

interface UserState {
  user: SessionUser | null;
  /** May change work orders, billing and the inbox */
  canEdit: boolean;
  /** May change pricing rules and manage users */
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<UserState>({ user: null, canEdit: false, isAdmin: false, signOut: async () => {} });

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { user: SessionUser | null }) => {
        if (!live) return;
        if (d.user) setUser(d.user);
        else window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  };

  return (
    <Ctx.Provider value={{ user, canEdit: canEdit(user?.role), isAdmin: isAdmin(user?.role), signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export const useUser = () => useContext(Ctx);
