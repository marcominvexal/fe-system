import { NextRequest, NextResponse } from "next/server";
import { checkLogin } from "@/lib/auth/users";
import { createSession, sessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

/** POST /api/auth/login — { email, password } → sets the session cookie. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  if (!body.email || !body.password) return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  const result = await checkLogin(body.email, body.password);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const res = NextResponse.json({ user: result.user });
  res.cookies.set(sessionCookie(createSession(result.user)));
  return res;
}
