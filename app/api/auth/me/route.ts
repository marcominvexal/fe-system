import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/current";
import { countUsers } from "@/lib/auth/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/auth/me — the signed-in user, and whether the first admin still needs creating. */
export async function GET() {
  const user = await currentUser();
  if (user) return NextResponse.json({ user });
  return NextResponse.json({ user: null, setupNeeded: (await countUsers()) === 0, setupNeedsCode: !!process.env.VERCEL });
}
