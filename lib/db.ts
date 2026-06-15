/**
 * /lib/db.ts — Server-side only. Never import this in client components.
 * Reads and writes /data/db.json as the single source of truth.
 *
 * NOTE: fs.writeFileSync works on Node.js servers (local dev, Railway, VPS).
 * On Vercel serverless the filesystem is read-only — swap for Vercel KV or Supabase.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { Task } from "./store";

const DATA_DIR = join(process.cwd(), "data");
const DB_PATH  = join(DATA_DIR, "db.json");

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function readDb(): Task[] {
  try {
    ensureDataDir();
    const raw = readFileSync(DB_PATH, "utf-8");
    return JSON.parse(raw) as Task[];
  } catch {
    return [];
  }
}

export function writeDb(tasks: Task[]): void {
  try {
    ensureDataDir();
    writeFileSync(DB_PATH, JSON.stringify(tasks, null, 2), "utf-8");
  } catch {
    console.error("[db] Failed to write db.json — read-only filesystem?");
  }
}
