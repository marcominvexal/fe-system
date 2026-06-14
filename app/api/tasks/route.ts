import { NextRequest, NextResponse } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import { buildRuleKey, calculateCommercial } from "@/lib/commercialEngine";
import type { Task, TaskStatus } from "@/lib/store";

// ── GET /api/tasks — return all tasks ────────────────────────────────────────
export async function GET() {
  const tasks = readDb();
  return NextResponse.json(tasks);
}

// ── POST /api/tasks — create a new task ──────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json() as Omit<Task, "id" | "status" | "createdAt" | "ruleKey">;

  const tasks  = readDb();
  const nums   = tasks.map((t) => parseInt(t.id.replace("T-", ""), 10)).filter((n) => !isNaN(n));
  const max    = nums.length > 0 ? Math.max(...nums) : 0;
  const id     = `T-${String(max + 1).padStart(3, "0")}`;
  const ruleKey = buildRuleKey(body.maintenanceLevel, body.serviceLevel, body.distanceBand);

  const task: Task = {
    ...body,
    id,
    ruleKey,
    status:    "assigned" as TaskStatus,
    createdAt: new Date().toISOString(),
  };

  tasks.push(task);
  writeDb(tasks);

  return NextResponse.json(task, { status: 201 });
}

// ── PATCH /api/tasks — update a task by id ───────────────────────────────────
//
// Body must include { id: string } plus one of:
//   { action: "approve" }
//   { action: "start" }
//   { action: "finish", comments?: string, aiReport?: string }
//   (or arbitrary partial Task fields for generic updates)
//
export async function PATCH(req: NextRequest) {
  const body = await req.json() as { id: string; action?: string; comments?: string; aiReport?: string } & Partial<Task>;
  const { id, action, ...rest } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const tasks = readDb();
  const idx   = tasks.findIndex((t) => t.id === id);

  if (idx === -1) {
    return NextResponse.json({ error: `Task ${id} not found` }, { status: 404 });
  }

  if (action === "approve") {
    if (tasks[idx].status !== "completed") {
      return NextResponse.json({ error: "Only completed tasks can be approved" }, { status: 400 });
    }
    tasks[idx] = { ...tasks[idx], status: "approved" };

  } else if (action === "start") {
    tasks[idx] = {
      ...tasks[idx],
      status:      "in_progress",
      checkInTime: new Date().toISOString(),
    };

  } else if (action === "finish") {
    const t     = tasks[idx];
    const rates = calculateCommercial(t.maintenanceLevel, t.serviceLevel, t.distanceBand);
    tasks[idx]  = {
      ...t,
      status:         "completed",
      checkOutTime:   new Date().toISOString(),
      comments:       rest.comments || undefined,
      aiReport:       rest.aiReport || undefined,
      customerCharge: rates.customerCharge,
      feCost:         rates.feCost,
      profit:         rates.profit,
    };

  } else {
    // Generic partial update (future-proof)
    tasks[idx] = { ...tasks[idx], ...rest };
  }

  writeDb(tasks);
  return NextResponse.json(tasks[idx]);
}
