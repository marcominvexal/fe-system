/**
 * /lib/db/schema.ts — tables, created idempotently on start-up.
 *
 * Work orders keep their full record in `data` (JSONB) so the app's Task
 * shape can evolve, with the fields that are filtered or reported on also
 * held as real columns.
 */
export const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS work_orders (
     id           TEXT PRIMARY KEY,
     work_order   TEXT,
     status       TEXT NOT NULL,
     source       TEXT,
     customer     TEXT,
     end_customer TEXT,
     charge_usd   NUMERIC,
     fe_pay_usd   NUMERIC,
     profit_usd   NUMERIC,
     invoice_no   TEXT,
     created_at   TIMESTAMPTZ NOT NULL,
     cleared_at   TIMESTAMPTZ,
     updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
     data         JSONB NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS work_orders_wo_idx     ON work_orders (work_order)`,
  `CREATE INDEX IF NOT EXISTS work_orders_status_idx ON work_orders (status)`,

  `CREATE TABLE IF NOT EXISTS audit_log (
     id          BIGSERIAL PRIMARY KEY,
     at          TIMESTAMPTZ NOT NULL DEFAULT now(),
     entity      TEXT NOT NULL,
     entity_id   TEXT NOT NULL,
     actor       TEXT NOT NULL,
     action      TEXT NOT NULL,
     changes     JSONB,
     reason      TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_log (entity, entity_id, at DESC)`,

  `CREATE TABLE IF NOT EXISTS mail_log (
     message_id   TEXT PRIMARY KEY,
     date         TIMESTAMPTZ NOT NULL,
     outcome      TEXT NOT NULL,
     work_order   TEXT,
     task_id      TEXT,
     data         JSONB NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS mail_log_date_idx ON mail_log (date DESC)`,

  `CREATE TABLE IF NOT EXISTS sync_runs (
     id    BIGSERIAL PRIMARY KEY,
     at    TIMESTAMPTZ NOT NULL,
     data  JSONB NOT NULL
   )`,

  `CREATE TABLE IF NOT EXISTS invoices (
     id           TEXT PRIMARY KEY,
     number       TEXT UNIQUE NOT NULL,
     kind         TEXT NOT NULL,            -- invoice | credit
     status       TEXT NOT NULL,            -- draft | sent | paid | void
     customer     TEXT NOT NULL,
     period_start DATE NOT NULL,
     period_end   DATE NOT NULL,
     total_usd    NUMERIC NOT NULL,
     created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
     data         JSONB NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS invoices_period_idx ON invoices (period_start DESC)`,

  `CREATE TABLE IF NOT EXISTS payouts (
     id           TEXT PRIMARY KEY,
     number       TEXT UNIQUE NOT NULL,
     partner      TEXT NOT NULL,
     status       TEXT NOT NULL,            -- pending | paid
     period_start DATE NOT NULL,
     period_end   DATE NOT NULL,
     total_usd    NUMERIC NOT NULL,
     created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
     data         JSONB NOT NULL
   )`,

  `CREATE TABLE IF NOT EXISTS app_state (
     key    TEXT PRIMARY KEY,
     value  JSONB NOT NULL
   )`,

  // Signed-in people, and which person made each audited change
  `CREATE TABLE IF NOT EXISTS users (
     id             TEXT PRIMARY KEY,
     email          TEXT UNIQUE NOT NULL,
     name           TEXT NOT NULL,
     role           TEXT NOT NULL,            -- admin | finance | viewer
     password_hash  TEXT NOT NULL,
     active         BOOLEAN NOT NULL DEFAULT true,
     failed_logins  INT NOT NULL DEFAULT 0,
     locked_until   TIMESTAMPTZ,
     last_login_at  TIMESTAMPTZ,
     created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_email TEXT`,
  `ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_name TEXT`,
];
