/**
 * /lib/db.ts — Server-side only. Never import this in client components.
 *
 * Reads and writes /data/db.json as the single source of truth.
 *
 * NOTE: fs.writeFileSync works on Node.js servers (local dev, Railway, VPS).
 * On Vercel's serverless functions the filesystem is read-only — writes will
 * silently fail and data will reset on cold starts. For persistent Vercel
 * deployment, swap readDb/writeDb for Vercel KV, Postgres, or Supabase.
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { Task } from "./store";

const DB_PATH = join(process.cwd(), "data", "db.json");

/** Read all tasks from db.json. */
export function readDb(): Task[] {
  try {
    const raw = readFileSync(DB_PATH, "utf-8");
    return JSON.parse(raw) as Task[];
  } catch {
    console.error("[db] Failed to read db.json — returning empty array.");
    return [];
  }
}

/** Atomically overwrite db.json with the updated task list. */
export function writeDb(tasks: Task[]): void {
  try {
    writeFileSync(DB_PATH, JSON.stringify(tasks, null, 2), "utf-8");
  } catch {
    console.error("[db] Failed to write db.json (read-only fs? — Vercel limitation).");
  }
}
