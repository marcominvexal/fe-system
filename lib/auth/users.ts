/**
 * /lib/auth/users.ts — Server-side only. People who can sign in.
 *
 * Five wrong passwords lock an account for 15 minutes. Password hashes never
 * leave this module.
 */
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db/client";
import { hashPassword, verifyPassword } from "./password";
import type { Role, SessionUser } from "./roles";

export interface User extends SessionUser {
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

type Row = {
  id: string; email: string; name: string; role: Role; password_hash: string; active: boolean;
  failed_logins: number; locked_until: string | Date | null; last_login_at: string | Date | null; created_at: string | Date;
};

const iso = (v: string | Date | null) => (v ? new Date(v).toISOString() : null);
const toUser = (r: Row): User => ({
  id: r.id, email: r.email, name: r.name, role: r.role, active: r.active,
  lastLoginAt: iso(r.last_login_at), createdAt: iso(r.created_at)!,
});
export const normEmail = (e: string) => String(e ?? "").trim().toLowerCase();
export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export async function countUsers(): Promise<number> {
  const db = await getDb();
  const [r] = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM users");
  return Number(r?.n ?? 0);
}

export async function listUsers(): Promise<User[]> {
  const db = await getDb();
  return (await db.query<Row>("SELECT * FROM users ORDER BY created_at")).map(toUser);
}

export async function getUser(id: string): Promise<User | null> {
  const db = await getDb();
  const [r] = await db.query<Row>("SELECT * FROM users WHERE id = $1", [id]);
  return r ? toUser(r) : null;
}

export async function countActiveAdmins(): Promise<number> {
  const db = await getDb();
  const [r] = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND active");
  return Number(r?.n ?? 0);
}

export async function createUser(input: { email: string; name: string; role: Role; password: string }): Promise<User> {
  const db = await getDb();
  const [r] = await db.query<Row>(
    `INSERT INTO users (id, email, name, role, password_hash) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [randomUUID(), normEmail(input.email), input.name.trim(), input.role, await hashPassword(input.password)],
  );
  return toUser(r);
}

export async function updateUser(id: string, patch: { name?: string; role?: Role; active?: boolean; password?: string }): Promise<User | null> {
  const db = await getDb();
  const sets: string[] = [];
  const params: unknown[] = [];
  const set = (col: string, v: unknown) => { params.push(v); sets.push(`${col} = $${params.length}`); };
  if (patch.name !== undefined) set("name", patch.name.trim());
  if (patch.role !== undefined) set("role", patch.role);
  if (patch.active !== undefined) set("active", patch.active);
  if (patch.password !== undefined) {
    set("password_hash", await hashPassword(patch.password));
    sets.push("failed_logins = 0", "locked_until = NULL");
  }
  if (!sets.length) return getUser(id);
  params.push(id);
  const [r] = await db.query<Row>(`UPDATE users SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`, params);
  return r ? toUser(r) : null;
}

// Verifying against a dummy hash keeps unknown emails as slow as wrong passwords
const DUMMY = "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==";

export type LoginResult =
  | { ok: true; user: SessionUser }
  | { ok: false; error: string; status: number };

export async function checkLogin(email: string, password: string): Promise<LoginResult> {
  const db = await getDb();
  const [r] = await db.query<Row>("SELECT * FROM users WHERE email = $1", [normEmail(email)]);
  const bad = { ok: false as const, error: "Wrong email or password.", status: 401 };
  if (!r) { await verifyPassword(String(password), DUMMY); return bad; }
  if (r.locked_until && new Date(r.locked_until).getTime() > Date.now()) {
    return { ok: false, error: `Too many attempts. Try again in ${LOCK_MINUTES} minutes.`, status: 429 };
  }
  if (!(await verifyPassword(String(password), r.password_hash))) {
    const failures = r.failed_logins + 1;
    const lock = failures >= MAX_FAILURES;
    await db.query(
      `UPDATE users SET failed_logins = $2, locked_until = ${lock ? `now() + interval '${LOCK_MINUTES} minutes'` : "NULL"} WHERE id = $1`,
      [r.id, lock ? 0 : failures],
    );
    return lock ? { ok: false, error: `Too many attempts. Try again in ${LOCK_MINUTES} minutes.`, status: 429 } : bad;
  }
  if (!r.active) return { ok: false, error: "This account has been switched off. Ask an admin.", status: 403 };
  await db.query("UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = $1", [r.id]);
  return { ok: true, user: { id: r.id, email: r.email, name: r.name, role: r.role } };
}

/** Current role of an active user, or null if they were removed or switched off. */
export async function activeRole(id: string): Promise<Role | null> {
  const db = await getDb();
  const [r] = await db.query<{ role: Role }>("SELECT role FROM users WHERE id = $1 AND active", [id]);
  return r?.role ?? null;
}
