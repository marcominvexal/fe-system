"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { StoreProvider, useStore } from "@/lib/storeContext";
import { ShellProvider, useShell } from "@/components/shell";
import { Icons } from "@/components/icons";
import { Avatar, cx } from "@/components/ui";
import { attention } from "@/lib/analytics";

const NAV = [
  { label: "Overview",      href: "/admin",             icon: Icons.Grid },
  { label: "Work orders",   href: "/admin/jobs",        icon: Icons.Wrench },
  { label: "Inbox",         href: "/admin/inbox",       icon: Icons.Inbox },
  { label: "Billing",       href: "/admin/invoices",    icon: Icons.Invoice },
  { label: "Pricing rules", href: "/admin/commercials", icon: Icons.Scale },
];

const isActive = (pathname: string, href: string) =>
  href === "/admin" ? pathname === href : pathname.startsWith(href);

// ── Sidebar ────────────────────────────────────────────────────────────────────
function Sidebar({ collapsed, onToggle, mobileOpen, onClose }: {
  collapsed: boolean; onToggle: () => void; mobileOpen: boolean; onClose: () => void;
}) {
  const pathname = usePathname();
  const { tasks } = useStore();
  const openCount = tasks.filter((t) => !["approved", "cancelled", "rejected"].includes(t.status)).length;

  return (
    <>
      {mobileOpen && <div className="anim-fade fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={onClose} />}
      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-line bg-[#0b0b0c] transition-[width,transform] duration-200 ease-out",
          collapsed ? "lg:w-[60px]" : "lg:w-[232px]",
          "w-[248px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
        aria-label="Primary"
      >
        {/* Brand */}
        <div className={cx("flex h-14 items-center gap-2.5 border-b border-line", collapsed ? "lg:justify-center lg:px-0 px-4" : "px-4")}>
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-b from-brand-soft to-brand-strong text-[#1a0d03] shadow-[inset_0_1px_0_rgb(255_255_255/0.3)]">
            <Icons.Bolt size={15} />
          </span>
          <div className={cx("min-w-0 leading-tight", collapsed && "lg:hidden")}>
            <p className="truncate text-[13px] font-semibold tracking-tight text-fg">INVEXAL FieldOps</p>
            <p className="truncate text-2xs text-fg-subtle">Orange work order billing</p>
          </div>
        </div>

        <nav className="scroll-thin flex-1 overflow-y-auto px-2.5 py-3">
          <p className={cx("px-2 pb-2 text-2xs font-medium uppercase tracking-[0.08em] text-fg-faint", collapsed && "lg:hidden")}>Operations</p>
          <ul className="space-y-0.5">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link href={item.href} onClick={onClose} title={collapsed ? item.label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "group relative flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium transition-colors duration-150",
                      collapsed && "lg:justify-center lg:px-0",
                      active ? "bg-white/[0.06] text-fg" : "text-fg-subtle hover:bg-white/[0.035] hover:text-fg",
                    )}>
                    {active && <span className="absolute -left-2.5 top-1.5 bottom-1.5 w-[3px] rounded-r bg-brand" />}
                    <Icon size={16} className={active ? "text-brand" : "text-fg-faint group-hover:text-fg-muted"} />
                    <span className={cx(collapsed && "lg:hidden")}>{item.label}</span>
                    {item.href === "/admin/jobs" && openCount > 0 && (
                      <span className={cx("num ml-auto rounded bg-warn/15 px-1.5 text-2xs font-semibold text-[#f0bd6d]", collapsed && "lg:hidden")}
                        title={`${openCount} open work orders`}>{openCount}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

        </nav>

        <div className="hidden border-t border-line p-2.5 lg:block">
          <button onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cx("flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-xs text-fg-subtle transition-colors hover:bg-white/[0.035] hover:text-fg", collapsed && "justify-center px-0")}>
            <Icons.Panel size={16} />
            {!collapsed && "Collapse"}
          </button>
        </div>
      </aside>
    </>
  );
}

// ── Popover ────────────────────────────────────────────────────────────────────
function Popover({ trigger, children }: {
  trigger: (open: boolean, toggle: () => void) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger(open, () => setOpen((o) => !o))}
      {open && children(() => setOpen(false))}
    </div>
  );
}

// ── Top bar ────────────────────────────────────────────────────────────────────
function TopBar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { query, setQuery, setJobView } = useShell();
  const { tasks } = useStore();
  const a = attention(tasks);
  const alerts = a.awaitingClosure.length + a.awaiting.length + a.breached.length + a.pricingCheck.length;
  const searchRef = useRef<HTMLInputElement>(null);

  const page = NAV.find((n) => isActive(pathname, n.href))?.label ?? "Overview";

  // "/" focuses search, like most ops consoles
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) {
        e.preventDefault(); searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur-md sm:px-6">
      <button onClick={onMenu} aria-label="Open navigation" className="-ml-1 grid h-8 w-8 place-items-center rounded-md text-fg-muted hover:bg-white/5 lg:hidden">
        <Icons.Menu size={18} />
      </button>

      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-[13px] md:flex">
        <span className="text-fg-subtle">Operations</span>
        <Icons.ChevronR size={12} className="text-fg-faint" />
        <span className="truncate font-medium text-fg">{page}</span>
      </nav>

      <form className="relative ml-auto w-full max-w-[320px] md:ml-6"
        onSubmit={(e) => { e.preventDefault(); setJobView("all"); if (pathname !== "/admin/jobs") router.push("/admin/jobs"); }}>
        <Icons.Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-faint" />
        <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search tasks"
          placeholder="Search work orders, customers, sites…"
          className="h-8 w-full rounded-lg bg-white/[0.04] pl-8 pr-8 text-[13px] text-fg placeholder:text-fg-faint ring-1 ring-inset ring-line transition focus:bg-white/[0.06] focus:outline-none focus:ring-brand/60" />
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-line-strong px-1.5 text-2xs text-fg-faint sm:block">/</kbd>
      </form>

      <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
        <Popover trigger={(open, toggle) => (
          <button onClick={toggle} aria-label={`Alerts (${alerts})`} aria-expanded={open}
            className="relative grid h-8 w-8 place-items-center rounded-lg text-fg-muted ring-1 ring-inset ring-line transition-colors hover:bg-white/5 hover:text-fg">
            <Icons.Bell size={16} />
            {alerts > 0 && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-brand ring-2 ring-canvas" />}
          </button>
        )}>
          {(close) => (
            <div className="anim-pop absolute right-0 mt-2 w-72 overflow-hidden rounded-xl border border-line-strong bg-raised shadow-2xl">
              <p className="border-b border-line px-4 py-2.5 text-xs font-semibold text-fg">Needs attention</p>
              {[
                { n: a.breached.length,        label: "engineers late to site", tone: "bg-crit" },
                { n: a.awaitingClosure.length, label: "visits awaiting Orange closure", tone: "bg-brand" },
                { n: a.awaiting.length,        label: "cleared visits not billed", tone: "bg-warn" },
                { n: a.pricingCheck.length,    label: "work orders with pricing to check", tone: "bg-warn" },
              ].map((r) => (
                <Link key={r.label} href="/admin#attention" onClick={() => close()}
                  className="flex items-center gap-3 px-4 py-2.5 text-[13px] text-fg-muted transition-colors hover:bg-white/[0.04] hover:text-fg">
                  <span className={cx("h-1.5 w-1.5 rounded-full", r.n ? r.tone : "bg-fg-faint")} />
                  <span className="num w-6 font-semibold text-fg">{r.n}</span>{r.label}
                </Link>
              ))}
            </div>
          )}
        </Popover>

        <Popover trigger={(open, toggle) => (
          <button onClick={toggle} aria-label="Account menu" aria-expanded={open}
            className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-1.5 transition-colors hover:bg-white/5">
            <Avatar name="Admin User" size={26} />
            <Icons.ChevronD size={14} className="hidden text-fg-faint sm:block" />
          </button>
        )}>
          {(close) => (
            <div className="anim-pop absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-line-strong bg-raised shadow-2xl">
              <div className="border-b border-line px-4 py-3">
                <p className="text-[13px] font-medium text-fg">Admin User</p>
                <p className="text-2xs text-fg-subtle">admin@invexal.com · Operations admin</p>
              </div>
              <div className="py-1">
                <Link href="/admin/commercials" onClick={() => close()} className="flex items-center gap-2.5 px-4 py-2 text-[13px] text-fg-muted hover:bg-white/[0.04] hover:text-fg"><Icons.Scale size={14} />Pricing rules</Link>
                <Link href="/admin/inbox" onClick={() => close()} className="flex items-center gap-2.5 px-4 py-2 text-[13px] text-fg-muted hover:bg-white/[0.04] hover:text-fg"><Icons.Inbox size={14} />Email inbox</Link>
              </div>
            </div>
          )}
        </Popover>
      </div>
    </header>
  );
}

// Sidebar preference, remembered per browser (falls back to memory if storage is blocked)
const sidebarPref = (() => {
  const subs = new Set<() => void>();
  let mem = false;
  return {
    subscribe: (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; },
    get: () => { try { return localStorage.getItem("fe.sidebar") === "1"; } catch { return mem; } },
    set: (v: boolean) => { mem = v; try { localStorage.setItem("fe.sidebar", v ? "1" : "0"); } catch {} subs.forEach((f) => f()); },
  };
})();

function Shell({ children }: { children: React.ReactNode }) {
  const collapsed = useSyncExternalStore(sidebarPref.subscribe, sidebarPref.get, () => false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggle = () => sidebarPref.set(!collapsed);

  return (
    <div className="admin-shell min-h-full bg-canvas text-fg">
      <Sidebar collapsed={collapsed} onToggle={toggle} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className={cx("flex min-h-screen min-w-0 flex-col transition-[padding] duration-200 ease-out", collapsed ? "lg:pl-[60px]" : "lg:pl-[232px]")}>
        <TopBar onMenu={() => setMobileOpen(true)} />
        <main className="mx-auto w-full min-w-0 max-w-[1600px] flex-1 px-4 py-5 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <ShellProvider>
        <Shell>{children}</Shell>
      </ShellProvider>
    </StoreProvider>
  );
}
