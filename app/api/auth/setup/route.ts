import { NextRequest, NextResponse } from "next/server";
import { countUsers, createUser, normEmail, validEmail } from "@/lib/auth/users";
import { passwordProblem } from "@/lib/auth/password";
import { createSession, sessionCookie } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * POST /api/auth/setup — creates the first admin, once, while there are no users.
 * Allowed on a local machine; a hosted deployment also needs SETUP_CODE.
 */
export async function POST(req: NextRequest) {
  if ((await countUsers()) > 0) return NextResponse.json({ error: "Setup is already done. Sign in instead." }, { status: 409 });
  const body = (await req.json().catch(() => ({}))) as { email?: string; name?: string; password?: string; code?: string };
  const code = process.env.SETUP_CODE;
  if (process.env.VERCEL && (!code || body.code !== code)) {
    return NextResponse.json({ error: "Create the first admin from a local copy of the app, or set SETUP_CODE." }, { status: 403 });
  }
  const email = normEmail(body.email ?? "");
  const name = (body.name ?? "").trim();
  if (!validEmail(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  const problem = passwordProblem(body.password ?? "");
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const user = await createUser({ email, name, role: "admin", password: body.password! });
  await writeAudit({ entity: "user", entityId: user.id, actor: "system", action: "created", reason: `First admin: ${email}` });
  const session = { id: user.id, email: user.email, name: user.name, role: user.role };
  const res = NextResponse.json({ user: session });
  res.cookies.set(sessionCookie(createSession(session)));
  return res;
}
