# FE Management System · Orange Business

Tracks and bills Orange Business field engineer work orders from email. The system reads Orange's work order emails from a shared Gmail inbox, opens and updates each job on its own, prices the visit from the rate card, and turns closed visits into monthly invoices and engineer payouts. Nobody assigns jobs by hand.

Invoiced by **Exponentia Global**. Made by **Invexal**.

**Live:** https://fe-system-demo.vercel.app

## How it works

| Orange email | Job stage | What happens |
|---|---|---|
| Dispatch | Assigned | Job created with site, customer, booked time and SLA; priced from the rate card |
| Photo | On site | Arrival and departure times recorded |
| Cleared / closed / resolved | Billed | Visit length set from the times; price locked, ready to invoice |
| Cancelled | Cancelled | Never billed |
| Other status (e.g. "Dispatch Rescheduled") | unchanged | Logged on the job's timeline |

- Fixed-format Orange emails are trusted only from `MAIL_ALLOWED_SENDERS` (or forwarded with the original quoted). Anything else is read by Google Gemini; AI-read jobs are flagged for checking and AI never bills.
- Every email is processed once (tracked by Message-ID). At most 30 emails per sync go to the AI; the rest wait for the next sync.
- Billed is not invoiced: a monthly invoice run (`INV-YYYYMM-NN`) picks up billed visits and creates engineer payouts (`PO-…`). Credit notes are `CN-…`.

## Pages

| Route | Purpose |
|---|---|
| `/login` | Sign in; creates the first admin when there are no users |
| `/admin` | Overview: what needs attention, revenue, pipeline |
| `/admin/jobs`, `/admin/jobs/[id]` | Work orders; job page with stage tracker, email timeline, change history, pricing |
| `/admin/inbox` | Processed emails, sync history, automation status, `.msg`/`.eml` upload |
| `/admin/invoices`, `/admin/invoices/[id]` | Invoice runs, credit notes, payouts, CSV |
| `/print/invoice/[id]` | Printable invoice pack |
| `/admin/insights` | Findings (leakage, anomalies, collections), price review, statement reconciliation |
| `/admin/commercials` | Rate card, pricing rules, invoice settings |
| `/admin/users` | People, roles, password resets (admins only) |

`/fe` and `/invoice` are left over from the original demo and are not part of the workflow.

## Roles

| | Admin | Finance | Viewer |
|---|---|---|---|
| View everything | ✓ | ✓ | ✓ |
| Sync inbox, upload emails, price review, invoicing, payouts | ✓ | ✓ | |
| Delete jobs, pricing rules, invoice settings, users | ✓ | | |

Sessions are HMAC-signed HttpOnly cookies (12 hours). Five wrong passwords lock an account for 15 minutes. `proxy.ts` gates every page and API call; writes re-check the user in the database, so switching someone off takes effect at once.

## Automation

| Job | Schedule | Runs on |
|---|---|---|
| Inbox sync, `GET /api/mail/sync` | Every 15 minutes | GitHub Actions (`.github/workflows/inbox-sync.yml`). Vercel's Hobby plan only allows daily jobs. |
| Daily digest, `GET /api/digest` | 03:00 UTC (08:00 Pakistan) | Vercel Cron (`vercel.json`) |
| Failure alert email to admins | When a scheduled sync fails, at most every 6 hours | Inside the sync |

Both scheduled calls send `Authorization: Bearer $CRON_SECRET`. The secret must be set in Vercel and as the GitHub Actions secret `CRON_SECRET`. A database lock stops two syncs running at once. The Inbox page shows the status of all three.

## Running locally

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev                  # http://localhost:3000
```

Without `DATABASE_URL` the app uses an embedded Postgres in `data/pglite`. Tables are created on first start.

Before deploying: `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## Settings

| Variable | Needed | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres (Neon) connection string |
| `AUTH_SECRET` | Yes | Signs sessions; 32+ random characters |
| `MAIL_USER` / `GMAIL_USER` | Yes | Mailbox to read and send from |
| `MAIL_APP_PASSWORD` / `GMAIL_APP_PASSWORD` | Yes | Gmail app password (IMAP on) |
| `GEMINI_API_KEY` | For AI | Reads free-form emails |
| `CRON_SECRET` | For schedules | Lets the scheduler call sync and digest |
| `SETUP_CODE` | Optional | Allows creating the first admin on a hosted deployment |
| `DIGEST_TO`, `ALERT_TO` | Optional | Override who gets the digest and alerts |
| `APP_URL` | Optional | Address used in email links |
| `MAIL_ALLOWED_SENDERS`, `MAIL_FOLDER`, `MAIL_LOOKBACK_DAYS`, `MAIL_MAX_AI_PER_RUN`, `GEMINI_MODEL` | Optional | Email reading defaults |

Never commit `.env.local`.

## Deployment

Vercel project `fe-system-demo`, Neon database `fe-system-db` (connected through the Vercel integration). Deploy with `vercel deploy --prod` or by pushing to `main` if the project is linked to Git.

## Project structure

```
proxy.ts                 Sign-in gate for pages and API
app/admin/               The admin app (pages listed above)
app/login/               Sign-in and first-admin setup
app/api/                 tasks, mail (sync/import/log), billing, insights, settings, auth, users, digest, audit
lib/db/                  Postgres client (Neon or PGlite), schema, migration from the old JSON files
lib/email/               IMAP fetch, template parser, AI reading, ingest rules, sync lock
lib/auth/                Passwords, sessions, roles, users
lib/notify/              Mailer, daily digest, failure alerts
lib/billing.ts           Invoice runs, credit notes, payouts
lib/pricing.ts           Rate card and pricing rules
lib/insights.ts          Findings; lib/confidence.ts price confidence; lib/reconcile.ts statements
lib/repo.ts, lib/audit.ts Work orders and the audit trail
public/brand/            Logos (replace a file to change a logo)
```
