"use client";

import { useCallback, useEffect, useState } from "react";
import { ROLES, type Role } from "@/lib/auth/roles";
import { MIN_PASSWORD, passwordProblem } from "@/lib/auth/password-rules";
import { useUser } from "@/lib/userContext";
import { DataTable, type Column } from "@/components/DataTable";
import { Icons } from "@/components/icons";
import { Avatar, Badge, Button, Modal, PageHeader, Panel, Select, inputCls, labelCls, type Tone } from "@/components/ui";

interface User { id: string; email: string; name: string; role: Role; active: boolean; lastLoginAt: string | null; createdAt: string }

const ROLE_TONE: Record<Role, Tone> = { admin: "brand", finance: "info", viewer: "neutral" };
const roleLabel = (r: Role) => ROLES.find((x) => x.value === r)?.label ?? r;
const fmtAt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never";

async function send(url: string, method: string, body: object) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error ?? "Something went wrong.");
  return d;
}

function UserModal({ user, onClose, onSaved }: { user: User | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !user;
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "finance");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (isNew || password) {
      const p = passwordProblem(password);
      if (p) { setError(p); return; }
    }
    setBusy(true);
    try {
      if (isNew) await send("/api/users", "POST", { name, email, role, password });
      else await send(`/api/users/${user.id}`, "PATCH", { name, role, ...(password ? { password } : {}) });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} label={isNew ? "Add a person" : `Edit ${user.name}`}>
      <form onSubmit={save}>
        <h2 className="text-sm font-semibold text-fg">{isNew ? "Add a person" : `Edit ${user.name}`}</h2>
        <div className="mt-4 space-y-3.5">
          <div>
            <label className={labelCls} htmlFor="u-name">Name</label>
            <input id="u-name" required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="u-email">Email</label>
            <input id="u-email" type="email" required disabled={!isNew} value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="u-role">Role</label>
            <Select id="u-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label} — {r.description}</option>)}
            </Select>
          </div>
          <div>
            <label className={labelCls} htmlFor="u-pw">{isNew ? "Temporary password" : "New password (leave blank to keep)"}</label>
            <input id="u-pw" type="password" autoComplete="new-password" required={isNew} value={password}
              onChange={(e) => setPassword(e.target.value)} className={inputCls} />
            <p className="mt-1 text-2xs text-fg-faint">At least {MIN_PASSWORD} characters, with letters and numbers. Share it with them privately.</p>
          </div>
        </div>
        {error && <p role="alert" className="mt-4 rounded-md border border-crit/25 bg-crit/[0.07] px-3 py-2 text-xs text-[#f08a84]">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? "Saving…" : isNew ? "Add person" : "Save"}</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function UsersPage() {
  const { user: me, isAdmin } = useUser();
  const [users, setUsers] = useState<User[] | null>(null);
  const [editing, setEditing] = useState<User | null | "new">(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/users", { cache: "no-store" })
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json()).error))))
      .then(setUsers)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const toggleActive = async (u: User) => {
    setError(null);
    try { await send(`/api/users/${u.id}`, "PATCH", { active: !u.active }); load(); }
    catch (e) { setError((e as Error).message); }
  };

  if (me && !isAdmin) {
    return (
      <>
        <PageHeader title="Users" />
        <Panel><p className="py-6 text-center text-[13px] text-fg-subtle">Only admins can manage users.</p></Panel>
      </>
    );
  }

  const columns: Column<User>[] = [
    {
      key: "name", header: "Person", sort: (u) => u.name.toLowerCase(),
      render: (u) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={u.name} size={26} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-fg">{u.name}{u.id === me?.id && <span className="text-fg-subtle"> (you)</span>}</p>
            <p className="truncate text-2xs text-fg-subtle">{u.email}</p>
          </div>
        </div>
      ),
    },
    { key: "role", header: "Role", sort: (u) => u.role, render: (u) => <Badge tone={ROLE_TONE[u.role]}>{roleLabel(u.role)}</Badge> },
    {
      key: "status", header: "Status", sort: (u) => (u.active ? 0 : 1), className: "hidden sm:table-cell",
      render: (u) => <Badge tone={u.active ? "ok" : "muted"}>{u.active ? "Active" : "Switched off"}</Badge>,
    },
    { key: "last", header: "Last sign-in", sort: (u) => u.lastLoginAt ?? "", className: "hidden md:table-cell", render: (u) => <span className="num text-xs text-fg-muted">{fmtAt(u.lastLoginAt)}</span> },
    {
      key: "actions", header: "", align: "right",
      render: (u) => (
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditing(u); }}>Edit</Button>
          {u.id !== me?.id && (
            <Button size="sm" variant={u.active ? "danger" : "secondary"} onClick={(e) => { e.stopPropagation(); toggleActive(u); }}>
              {u.active ? "Switch off" : "Switch on"}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Who can sign in, and what each person may change"
        actions={<Button variant="primary" onClick={() => setEditing("new")}><Icons.Plus size={14} />Add person</Button>}
      />
      {error && <p role="alert" className="mb-4 rounded-lg border border-crit/25 bg-crit/[0.07] px-4 py-2.5 text-[13px] text-[#f08a84]">{error}</p>}
      <Panel title="People" subtitle={users ? `${users.length} account${users.length === 1 ? "" : "s"}` : undefined} bodyClass="p-0">
        {users === null
          ? <p className="py-8 text-center text-xs text-fg-subtle">Loading…</p>
          : <DataTable rows={users} columns={columns} rowKey={(u) => u.id} initialSort={{ key: "name", dir: "asc" }} />}
      </Panel>
      <Panel title="Roles" className="mt-5">
        <ul className="grid gap-3 sm:grid-cols-3">
          {ROLES.map((r) => (
            <li key={r.value} className="rounded-lg border border-line bg-canvas/50 px-4 py-3">
              <Badge tone={ROLE_TONE[r.value]}>{r.label}</Badge>
              <p className="mt-1.5 text-xs text-fg-subtle">{r.description}</p>
            </li>
          ))}
        </ul>
      </Panel>
      {editing && (
        <UserModal user={editing === "new" ? null : editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }} />
      )}
    </>
  );
}
