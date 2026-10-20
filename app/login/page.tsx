"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MadeBy, OrangeMark, PoweredBy } from "@/components/brand";
import { Button, cx, inputCls, labelCls } from "@/components/ui";
import { MIN_PASSWORD } from "@/lib/auth/password-rules";

type Mode = "loading" | "signin" | "setup";

// Only send people back to pages inside this app
const safeNext = (n: string | null) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/admin");

function LoginForm() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<Mode>("loading");
  const [needsCode, setNeedsCode] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "", code: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { user: unknown; setupNeeded?: boolean; setupNeedsCode?: boolean }) => {
        if (d.user) { window.location.href = next; return; }
        setNeedsCode(!!d.setupNeedsCode);
        setMode(d.setupNeeded ? "setup" : "signin");
      })
      .catch(() => setMode("signin"));
  }, [next]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === "setup" && form.password !== form.confirm) { setError("The two passwords don't match."); return; }
    setBusy(true);
    try {
      const res = await fetch(mode === "setup" ? "/api/auth/setup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "setup"
          ? { name: form.name, email: form.email, password: form.password, code: form.code || undefined }
          : { email: form.email, password: form.password }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? "Sign-in failed."); return; }
      window.location.href = next;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-shell grid min-h-full place-items-center bg-canvas px-4 py-10 text-fg">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex items-center gap-2.5">
          <OrangeMark size={36} className="rounded-[3px]" />
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight">FE Management System</p>
            <p className="text-2xs text-fg-subtle">Orange Business</p>
          </div>
        </div>

        <form onSubmit={submit} className="rounded-xl border border-line bg-panel p-6 shadow-2xl">
          {mode === "loading" ? (
            <p className="py-8 text-center text-xs text-fg-subtle">Loading…</p>
          ) : (
            <>
              <h1 className="text-base font-semibold">{mode === "setup" ? "Create the first admin" : "Sign in"}</h1>
              <p className="mt-1 text-xs text-fg-subtle">
                {mode === "setup"
                  ? "No one has an account yet. This person can add everyone else from the Users page."
                  : "Use the email and password your admin gave you."}
              </p>

              <div className="mt-5 space-y-3.5">
                {mode === "setup" && (
                  <div>
                    <label htmlFor="name" className={labelCls}>Your name</label>
                    <input id="name" autoComplete="name" required value={form.name} onChange={set("name")} className={inputCls} />
                  </div>
                )}
                <div>
                  <label htmlFor="email" className={labelCls}>Email</label>
                  <input id="email" type="email" autoComplete="username" required autoFocus value={form.email} onChange={set("email")} className={inputCls} />
                </div>
                <div>
                  <label htmlFor="password" className={labelCls}>Password</label>
                  <input id="password" type="password" required value={form.password} onChange={set("password")}
                    autoComplete={mode === "setup" ? "new-password" : "current-password"} className={inputCls} />
                  {mode === "setup" && <p className="mt-1 text-2xs text-fg-faint">At least {MIN_PASSWORD} characters, with letters and numbers.</p>}
                </div>
                {mode === "setup" && (
                  <div>
                    <label htmlFor="confirm" className={labelCls}>Password again</label>
                    <input id="confirm" type="password" autoComplete="new-password" required value={form.confirm} onChange={set("confirm")} className={inputCls} />
                  </div>
                )}
                {mode === "setup" && needsCode && (
                  <div>
                    <label htmlFor="code" className={labelCls}>Setup code</label>
                    <input id="code" autoComplete="off" required value={form.code} onChange={set("code")} className={inputCls} />
                  </div>
                )}
              </div>

              {error && (
                <p role="alert" className="mt-4 rounded-md border border-crit/25 bg-crit/[0.07] px-3 py-2 text-xs text-[#f08a84]">{error}</p>
              )}

              <Button type="submit" variant="primary" disabled={busy} className={cx("mt-5 w-full justify-center")}>
                {busy ? "Please wait…" : mode === "setup" ? "Create admin and sign in" : "Sign in"}
              </Button>
            </>
          )}
        </form>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <PoweredBy />
          <MadeBy />
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
