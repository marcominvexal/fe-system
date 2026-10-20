/**
 * /lib/email/lock.ts — Server-side only. Lets one inbox sync run at a time, so
 * a scheduled sync and someone pressing "Sync inbox" can't process the same
 * email twice. The lock expires on its own if a sync dies part-way.
 */
import { getDb } from "@/lib/db/client";

const LOCK_MINUTES = 6; // a little longer than the longest allowed sync (5 min)

export async function acquireSyncLock(): Promise<boolean> {
  const db = await getDb();
  const rows = await db.query(
    `INSERT INTO app_state (key, value) VALUES ('sync_lock', to_jsonb(now() + interval '${LOCK_MINUTES} minutes'))
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
       WHERE (app_state.value #>> '{}')::timestamptz < now()
     RETURNING key`,
  );
  return rows.length > 0;
}

export async function releaseSyncLock() {
  const db = await getDb();
  await db.query(`DELETE FROM app_state WHERE key = 'sync_lock'`);
}
