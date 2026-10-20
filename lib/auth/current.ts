/**
 * /lib/auth/current.ts — Server-side only. The signed-in person for this request.
 */
import { cookies } from "next/headers";
import { readSession, SESSION_COOKIE } from "./session";
import type { SessionUser } from "./roles";

/** The signed-in user, or null outside a request (scripts, scheduled sync) or when signed out. */
export async function currentUser(): Promise<SessionUser | null> {
  try {
    return readSession((await cookies()).get(SESSION_COOKIE)?.value);
  } catch {
    return null;
  }
}
