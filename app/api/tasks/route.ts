import { NextRequest, NextResponse } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import { buildRuleKey, calculateCommercial } from "@/lib/commercialEngine";
import { calcDuration, generateInvoiceNumber } from "@/lib/store";
import type { Task, TaskStatus } from "@/lib/store";

// ── GET /api/tasks ─────────────────────────────────────────────────────────────
export async function GET() {
  return NextResponse.json(readDb());
}

// ── POST /api/tasks — create new task ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json() as Omit<
    Task,
    "id" | "status" | "createdAt" | "ruleKey" | "approved"
  >;

  const tasks = readDb();
  const nums  = tasks
    .map((t) => parseInt(t.id.replace("T-", ""), 10))
    .filter((n) => !isNaN(n));
  const max  = nums.length > 0 ? Math.max(...nums) : 0;
  const id   = `T-${String(max + 1).padStart(3, "0")}`;

  const ruleKey = buildRuleKey(
    body.maintenanceLevel,
    body.serviceLevel,
    body.distanceBand,
    body.visitDuration
  );

  const task: Task = {
    ...body,
    id,
    ruleKey,
    status:    "assigned" as TaskStatus,
    approved:  false,
    createdAt: new Date().toISOString(),
  };

  tasks.push(task);
  writeDb(tasks);
  return NextResponse.json(task, { status: 201 });
}

// ── PATCH /api/tasks — update task ────────────────────────────────────────────
// Body always includes { id: string }. Actions:
//   { action: "accept" }
//   { action: "reject", rejectionReason: string }
//   { action: "start" }
//   { action: "finish", comments?: string, aiSummary?: string }
//   { action: "approve" }
//   { action: "cancel", cancelReason?: string }
//   { action: "reassign", engineerId: string, engineerName: string }
//   (any other partial Task fields = generic edit)

export async function PATCH(req: NextRequest) {
  const body = await req.json() as {
    id: string;
    action?: string;
    rejectionReason?: string;
    cancelReason?: string;
    comments?: string;
    aiSummary?: string;
  } & Partial<Task>;

  const { id, action, ...rest } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const tasks = readDb();
  const idx   = tasks.findIndex((t) => t.id === id);

  if (idx === -1) {
    return NextResponse.json({ error: `Task ${id} not found` }, { status: 404 });
  }

  const t = tasks[idx];

  switch (action) {
    case "accept": {
      if (t.status !== "assigned") {
        return NextResponse.json({ error: "Task must be assigned to accept" }, { status: 400 });
      }
      tasks[idx] = { ...t, status: "accepted", acceptedAt: new Date().toISOString() };
      break;
    }

    case "reject": {
      if (t.status !== "assigned") {
        return NextResponse.json({ error: "Task must be assigned to reject" }, { status: 400 });
      }
      tasks[idx] = {
        ...t,
        status:           "rejected",
        rejectedAt:       new Date().toISOString(),
        rejectionReason:  rest.rejectionReason || "No reason provided",
      };
      break;
    }

    case "start": {
      if (!["assigned", "accepted"].includes(t.status)) {
        return NextResponse.json({ error: "Task must be assigned or accepted to start" }, { status: 400 });
      }
      tasks[idx] = {
        ...t,
        status:      "in_progress",
        checkInTime: new Date().toISOString(),
        acceptedAt:  t.acceptedAt ?? new Date().toISOString(),
      };
      break;
    }

    case "finish": {
      if (t.status !== "in_progress") {
        return NextResponse.json({ error: "Task must be in progress to finish" }, { status: 400 });
      }
      const checkOutTime = new Date().toISOString();
      const duration     = calcDuration(t.checkInTime, checkOutTime);
      tasks[idx] = {
        ...t,
        status:       "completed",
        checkOutTime,
        duration,
        comments:     rest.comments  || t.comments,
        aiSummary:    rest.aiSummary || t.aiSummary,
      };
      break;
    }

    case "approve": {
      if (t.status !== "completed") {
        return NextResponse.json({ error: "Only completed tasks can be approved" }, { status: 400 });
      }
      const rates = calculateCommercial(
        t.maintenanceLevel,
        t.serviceLevel,
        t.distanceBand,
        t.visitDuration
      );
      tasks[idx] = {
        ...t,
        status:            "approved",
        approved:          true,
        invoiceNumber:     generateInvoiceNumber(),
        customerChargeUSD: rates.customerChargeUSD,
        engineerPaymentUSD: rates.engineerPaymentUSD,
        profit:            rates.profit,
      };
      break;
    }

    case "cancel": {
      if (["approved", "cancelled"].includes(t.status)) {
        return NextResponse.json({ error: "Cannot cancel an approved or already cancelled task" }, { status: 400 });
      }
      tasks[idx] = {
        ...t,
        status:      "cancelled",
        cancelledAt: new Date().toISOString(),
        cancelReason: rest.cancelReason || "Cancelled by admin",
      };
      break;
    }

    case "reassign": {
      if (!["rejected", "cancelled", "assigned"].includes(t.status)) {
        return NextResponse.json({ error: "Can only reassign rejected, cancelled, or assigned tasks" }, { status: 400 });
      }
      tasks[idx] = {
        ...t,
        status:       "assigned",
        engineerId:   rest.engineerId   ?? t.engineerId,
        engineerName: rest.engineerName ?? t.engineerName,
        rejectedAt:       undefined,
        rejectionReason:  undefined,
        cancelledAt:      undefined,
        cancelReason:     undefined,
        acceptedAt:       undefined,
      };
      break;
    }

    default: {
      // Generic partial edit (title, description, location, etc.)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { action: _a, ...fields } = body;
      tasks[idx] = { ...t, ...fields };
      break;
    }
  }

  writeDb(tasks);
  return NextResponse.json(tasks[idx]);
}

// ── DELETE /api/tasks?id=T-001 ────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id query param is required" }, { status: 400 });
  }

  const tasks   = readDb();
  const updated = tasks.filter((t) => t.id !== id);

  if (updated.length === tasks.length) {
    return NextResponse.json({ error: `Task ${id} not found` }, { status: 404 });
  }

  writeDb(updated);
  return NextResponse.json({ deleted: id });
}
