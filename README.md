# FE System — Field Engineer Management & Billing

A Joblogic-style enterprise Field Service Management demo for **Orange Business Pakistan** telecom operations.

## Features

- **Admin Dashboard** — Create & assign field tasks, 4-step form, KPI cards, live task board with inline approval
- **FE Workspace** — Mobile-friendly engineer interface with step-by-step flow (Accept → Start → Finish)
- **AI Report Generation** — Gemini-powered work note improvement via server-side API route
- **Commercial Engine** — 24-cell pricing matrix (Maintenance Level × SLA × Distance Band)
- **Invoice Page** — Consolidated billing view for approved tasks
- **File-based DB** — `/data/db.json` as local persistent store (swap for Vercel KV / Postgres in production)

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| State | React Context + fetch API |
| Data | `/app/api/tasks` REST routes → `data/db.json` |
| AI | Google Gemini 1.5 Flash (server-side proxy) |

## Getting Started

```bash
npm install
cp .env.example .env.local   # add your Gemini API key
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

| Route | Purpose |
|---|---|
| `/admin` | Operations dashboard (create tasks, approve, view billing) |
| `/fe/workspace` | Field engineer mobile workspace |
| `/invoice` | Invoice & billing summary |

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Optional | Google Gemini API key. Falls back to mock report if not set. |

**Never use `NEXT_PUBLIC_GEMINI_API_KEY`** — the key is server-only and proxied through `/api/gemini`.

## Billing Rules

Tasks are priced on a 3-dimension matrix:

- **Maintenance Level**: Reactive Support / Planned Activity / Preventive Maintenance
- **SLA**: 24x7 4h / 24x7 NBD / 8x5 4h / 8x5 NBD
- **Distance Band**: <50km / 50–100km / >100km

Billing is calculated server-side at checkout (`PATCH /api/tasks { action: "finish" }`).

## Deployment (Vercel)

1. Push to GitHub
2. Import repo in Vercel
3. Add `GEMINI_API_KEY` in Vercel → Project → Settings → Environment Variables
4. Deploy

> **Note**: `fs.writeFileSync` on Vercel's serverless is read-only — data will reset on cold starts.  
> For persistent production use, replace `lib/db.ts` with Vercel KV or Supabase.

## Project Structure

```
app/
  admin/page.tsx          # Operations dashboard
  fe/workspace/page.tsx   # Field engineer workspace
  invoice/page.tsx        # Billing & invoice view
  api/
    gemini/route.ts       # Server-side Gemini proxy
    tasks/route.ts        # GET / POST / PATCH task API
  layout.tsx              # Root layout with sidebar
lib/
  store.ts                # Task type + reference data
  storeContext.tsx        # React context (fetches from /api/tasks)
  db.ts                   # File-based DB (server-only)
  commercialEngine.ts     # Pricing matrix engine
data/
  db.json                 # Seed data (gitignored)
```
