/**
 * /lib/db/client.ts — Server-side only. One Postgres interface for the app.
 *
 *   DATABASE_URL set   → Neon (serverless Postgres over HTTP)
 *   DATABASE_URL unset → PGlite, an embedded Postgres stored in data/pglite
 *                        (in memory on read-only hosts such as Vercel without DATABASE_URL)
 *
 * Both run the same SQL, so moving to Neon is a configuration change only.
 */
import { join } from "path";
import { SCHEMA } from "./schema";

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  kind: "neon" | "pglite";
}

type G = typeof globalThis & { __feDb?: Promise<Db> };
const g = globalThis as G;

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(url);
    return {
      kind: "neon",
      query: async <T,>(text: string, params: unknown[] = []) => (await sql.query(text, params)) as T[],
    };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  // Persist to disk locally; Vercel's filesystem is read-only, so stay in memory there
  const pg = process.env.VERCEL ? new PGlite() : new PGlite(join(process.cwd(), "data", "pglite"));
  await pg.waitReady;
  return {
    kind: "pglite",
    query: async <T,>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows,
  };
}

async function init(): Promise<Db> {
  const db = await connect();
  for (const stmt of SCHEMA) await db.query(stmt);
  // One-time import of the old JSON files (data/db.json, mail-log.json, mail-state.json)
  const { migrateFromJson } = await import("./migrate");
  await migrateFromJson(db);
  return db;
}

/** Shared connection, created once per server process (survives dev hot reloads). */
export function getDb(): Promise<Db> {
  if (!g.__feDb) {
    g.__feDb = init().catch((e) => { g.__feDb = undefined; throw e; });
  }
  return g.__feDb;
}
