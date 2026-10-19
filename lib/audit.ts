/**
 * /lib/audit.ts — Server-side only. One way to write the audit trail, so every
 * entry also names the signed-in person behind it (when there is one).
 */
import { getDb } from "./db/client";
import { currentUser } from "./auth/current";

export async function writeAudit(e: {
  entity: string; entityId: string; actor: string; action: string; changes?: object | null; reason?: string | null;
}) {
  const db = await getDb();
  const user = e.actor === "admin" ? await currentUser() : null;
  await db.query(
    `INSERT INTO audit_log (entity, entity_id, actor, action, changes, reason, user_email, user_name)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`,
    [e.entity, e.entityId, e.actor, e.action, e.changes ? JSON.stringify(e.changes) : null, e.reason ?? null, user?.email ?? null, user?.name ?? null],
  );
}
