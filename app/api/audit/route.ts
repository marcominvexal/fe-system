import { NextRequest, NextResponse } from "next/server";
import { auditFor } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/audit?id=T-001 — change history of one work order, newest first. */
export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id query param is required" }, { status: 400 });
  return NextResponse.json(await auditFor(id));
}
