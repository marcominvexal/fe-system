import { NextRequest, NextResponse } from "next/server";
import { dismissFinding, getInsights, restoreFinding } from "@/lib/insightsServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/insights — open findings, dismissed ones, and a money-at-risk summary. */
export async function GET() {
  return NextResponse.json(await getInsights());
}

/** POST { action: "dismiss", key, title, reason } | { action: "restore", key } */
export async function POST(req: NextRequest) {
  const { action, key, title, reason } = await req.json() as { action: string; key?: string; title?: string; reason?: string };
  if (!key) return NextResponse.json({ error: "key is required" }, { status: 400 });
  if (action === "dismiss") {
    if (!reason?.trim()) return NextResponse.json({ error: "Say why this can be ignored." }, { status: 400 });
    await dismissFinding({ key, title: title ?? key }, reason.trim());
  } else if (action === "restore") {
    await restoreFinding(key);
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
