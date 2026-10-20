/**
 * /proxy.ts — the sign-in gate in front of every page and API route.
 *
 *   signed out  → pages redirect to /login, API calls get 401
 *   signed in   → reads are open; writes follow the role rules in lib/auth/roles
 *   scheduler   → GET /api/mail/sync with `Authorization: Bearer $CRON_SECRET`
 *
 * Writes also re-check the user in the database, so switching someone off or
 * changing their role takes effect at once rather than when the cookie expires.
 */
import { NextResponse, type NextRequest } from "next/server";
import { readSession, SESSION_COOKIE } from "@/lib/auth/session";
import { canCallApi } from "@/lib/auth/roles";
import { activeRole } from "@/lib/auth/users";

const PUBLIC = ["/login", "/api/auth/login", "/api/auth/logout", "/api/auth/me", "/api/auth/setup"];
const CRON_PATHS = ["/api/mail/sync", "/api/digest"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (PUBLIC.includes(pathname)) return NextResponse.next();

  const cron = process.env.CRON_SECRET;
  if (cron && req.method === "GET" && CRON_PATHS.includes(pathname)
      && req.headers.get("authorization") === `Bearer ${cron}`) {
    return NextResponse.next();
  }

  const user = readSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    if (isApi) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (isApi) {
    if (!canCallApi(user.role, req.method, pathname)) {
      return NextResponse.json({ error: "Your role can't make this change." }, { status: 403 });
    }
    const write = !(req.method === "GET" || req.method === "HEAD") || CRON_PATHS.includes(pathname);
    if (write) {
      const role = await activeRole(user.id);
      if (!role) {
        const res = NextResponse.json({ error: "Your account is no longer active. Sign in again." }, { status: 401 });
        res.cookies.delete(SESSION_COOKIE);
        return res;
      }
      if (!canCallApi(role, req.method, pathname)) {
        return NextResponse.json({ error: "Your role can't make this change." }, { status: 403 });
      }
    }
  }
  return NextResponse.next();
}

export const config = {
  // Everything except build assets and files served from /public
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
