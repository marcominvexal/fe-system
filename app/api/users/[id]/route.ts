import { NextRequest, NextResponse } from "next/server";
import { countActiveAdmins, getUser, updateUser } from "@/lib/auth/users";
import { passwordProblem } from "@/lib/auth/password";
import { ROLES, type Role } from "@/lib/auth/roles";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

/** PATCH /api/users/:id — { name?, role?, active?, password? } (the proxy limits this to admins). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const before = await getUser(id);
  if (!before) return NextResponse.json({ error: "No such user." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { name?: string; role?: Role; active?: boolean; password?: string };

  if (body.role !== undefined && !ROLES.some((r) => r.value === body.role)) {
    return NextResponse.json({ error: "Pick a role." }, { status: 400 });
  }
  if (body.name !== undefined && !body.name.trim()) return NextResponse.json({ error: "Enter a name." }, { status: 400 });
  if (body.password !== undefined) {
    const problem = passwordProblem(body.password);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }
  // Never leave the system without an active admin
  const losesAdmin = before.role === "admin" && before.active && (body.active === false || (body.role !== undefined && body.role !== "admin"));
  if (losesAdmin && (await countActiveAdmins()) <= 1) {
    return NextResponse.json({ error: "Keep at least one active admin." }, { status: 400 });
  }

  const user = await updateUser(id, { name: body.name, role: body.role, active: body.active, password: body.password });
  const changes: Record<string, [unknown, unknown]> = {};
  if (body.name !== undefined && body.name.trim() !== before.name) changes.name = [before.name, body.name.trim()];
  if (body.role !== undefined && body.role !== before.role) changes.role = [before.role, body.role];
  if (body.active !== undefined && body.active !== before.active) changes.active = [before.active, body.active];
  if (body.password !== undefined) changes.password = ["", "reset"];
  if (Object.keys(changes).length) {
    await writeAudit({ entity: "user", entityId: id, actor: "admin", action: "updated", changes, reason: before.email });
  }
  return NextResponse.json(user);
}
