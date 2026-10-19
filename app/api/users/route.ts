import { NextRequest, NextResponse } from "next/server";
import { createUser, listUsers, normEmail, validEmail } from "@/lib/auth/users";
import { passwordProblem } from "@/lib/auth/password";
import { ROLES, type Role } from "@/lib/auth/roles";
import { currentUser } from "@/lib/auth/current";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isRole = (r: unknown): r is Role => ROLES.some((x) => x.value === r);

/** GET /api/users — everyone who can sign in (admins only). */
export async function GET() {
  const me = await currentUser();
  if (me?.role !== "admin") return NextResponse.json({ error: "Admins only." }, { status: 403 });
  return NextResponse.json(await listUsers());
}

/** POST /api/users — { email, name, role, password } adds a person (the proxy limits this to admins). */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; name?: string; role?: string; password?: string };
  const email = normEmail(body.email ?? "");
  const name = (body.name ?? "").trim();
  if (!validEmail(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Enter a name." }, { status: 400 });
  if (!isRole(body.role)) return NextResponse.json({ error: "Pick a role." }, { status: 400 });
  const problem = passwordProblem(body.password ?? "");
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  if ((await listUsers()).some((u) => u.email === email)) {
    return NextResponse.json({ error: "Someone with that email already exists." }, { status: 409 });
  }
  const user = await createUser({ email, name, role: body.role, password: body.password! });
  await writeAudit({ entity: "user", entityId: user.id, actor: "admin", action: "created", reason: `${email} as ${body.role}` });
  return NextResponse.json(user, { status: 201 });
}
