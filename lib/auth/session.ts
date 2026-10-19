/**
 * /lib/auth/session.ts — Server-side only. Signed session tokens.
 *
 * The cookie holds the user's id, name, email and role, plus an expiry,
 * signed with HMAC-SHA256 using AUTH_SECRET. It is HttpOnly, so page
 * scripts cannot read it.
 */
import { createHmac, timingSafeEqual } from "crypto";
import type { Role, SessionUser } from "./roles";

export const SESSION_COOKIE = "fe_session";
export const SESSION_HOURS = 12;

function secret(): string | null {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 32) return s;
  // Local development without a secret still works; production must set one
  return process.env.NODE_ENV === "production" ? null : "dev-only-secret-change-me-dev-only-secret";
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
const sign = (data: string, key: string) => createHmac("sha256", key).update(data).digest("base64url");

export function createSession(user: SessionUser): string {
  const key = secret();
  if (!key) throw new Error("AUTH_SECRET is not set (at least 32 characters).");
  const payload = b64(JSON.stringify({ ...user, exp: Date.now() + SESSION_HOURS * 3_600_000 }));
  return `${payload}.${sign(payload, key)}`;
}

export function readSession(token?: string | null): SessionUser | null {
  const key = secret();
  if (!token || !key) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload, key));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as SessionUser & { exp: number };
    if (!data.exp || data.exp < Date.now()) return null;
    if (!["admin", "finance", "viewer"].includes(data.role)) return null;
    return { id: data.id, email: data.email, name: data.name, role: data.role as Role };
  } catch {
    return null;
  }
}

export function sessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  };
}
