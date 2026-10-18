/**
 * Local demo seed — writes data/db.json with ~60 days of realistic task history.
 * Run with: npm run seed  (refuses to overwrite a non-empty db unless --force)
 * Pricing comes from the real commercial engine, so seeded numbers match the app.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildRuleKey, calculateCommercial,
  MAINTENANCE_LEVELS, SERVICE_LEVELS, DISTANCE_BANDS, VISIT_DURATIONS,
} from "../lib/commercialEngine.ts";

const DB = join(process.cwd(), "data", "db.json");
const force = process.argv.includes("--force");

if (existsSync(DB) && !force) {
  const current = JSON.parse(readFileSync(DB, "utf-8") || "[]");
  if (current.length > 0) {
    console.log(`data/db.json already has ${current.length} tasks — pass --force to overwrite.`);
    process.exit(0);
  }
}

// Deterministic PRNG so every seed looks the same
let s = 42;
const rnd = () => ((s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];

const engineers = [
  ["u2", "Ali Raza"], ["u3", "Hassan Ahmed"], ["u4", "Usman Khan"],
  ["u5", "Bilal Hussain"], ["u6", "Ayesha Malik"],
] as const;
const types = ["Fiber Link Down", "Router Configuration", "ODF Maintenance", "Site Power Issue",
  "Transmission Fault", "Latency Investigation", "Network Optimization", "Signal Degradation Issue"];
const cities = ["Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad", "Multan",
  "Hyderabad", "Sialkot", "Peshawar", "Quetta"];
const notes = [
  "Replaced faulty SFP module, link restored and stable for 30 minutes.",
  "Re-terminated fibre at ODF, optical power within threshold.",
  "Updated router config per change request, verified BGP sessions.",
  "Power supply unit swapped, UPS batteries tested OK.",
  "Cleaned connectors and re-patched; latency back to baseline.",
];

const now = Date.now();
const H = 3600_000;
const tasks: Record<string, unknown>[] = [];
const N = 72;

for (let i = 0; i < N; i++) {
  // Skew creation toward recent days so the trend grows
  const ageDays = Math.floor(Math.pow(rnd(), 1.4) * 58);
  const created = now - ageDays * 24 * H - Math.floor(rnd() * 10) * H;
  const [engineerId, engineerName] = pick(engineers);
  const maintenanceLevel = rnd() < 0.55 ? MAINTENANCE_LEVELS[1] : MAINTENANCE_LEVELS[0];
  const serviceLevel = pick(SERVICE_LEVELS);
  const distanceBand = rnd() < 0.6 ? DISTANCE_BANDS[0] : pick(DISTANCE_BANDS);
  const visitDuration = pick(VISIT_DURATIONS);
  const type = pick(types);
  const city = pick(cities);

  // Status depends on age: old tasks are mostly closed, fresh ones open
  const r = rnd();
  let status: string;
  if (ageDays > 4) status = r < 0.8 ? "approved" : r < 0.88 ? "completed" : r < 0.94 ? "cancelled" : "rejected";
  else if (ageDays > 1) status = r < 0.35 ? "approved" : r < 0.6 ? "completed" : r < 0.8 ? "in_progress" : "accepted";
  else status = r < 0.4 ? "assigned" : r < 0.65 ? "accepted" : r < 0.9 ? "in_progress" : "completed";

  const respH = serviceLevel.endsWith("4h") ? 0.5 + rnd() * (rnd() < 0.15 ? 7 : 3.4) : 2 + rnd() * 26;
  const workH = visitDuration === "2h" ? 1.5 + rnd() : visitDuration === "Half Day" ? 3 + rnd() * 1.5 : 6 + rnd() * 2;

  const t: Record<string, unknown> = {
    title: `${type} — ${city}`,
    description: "",
    customer: "Orange Business",
    location: `Site ${city.slice(0, 3).toUpperCase()}-${String(1 + Math.floor(rnd() * 40)).padStart(2, "0")}, ${city}`,
    engineerId, engineerName, status,
    maintenanceType: type, maintenanceLevel, serviceLevel, distanceBand, visitDuration,
    ruleKey: buildRuleKey(maintenanceLevel, serviceLevel, distanceBand, visitDuration),
    createdAt: new Date(created).toISOString(),
    approved: status === "approved",
  };

  const started = created + respH * H;
  if (status !== "assigned" && status !== "cancelled" && status !== "rejected") {
    t.acceptedAt = new Date(created + respH * 0.3 * H).toISOString();
  }
  if (["in_progress", "completed", "approved"].includes(status)) {
    t.checkInTime = new Date(Math.min(started, now - 0.5 * H)).toISOString();
  }
  if (["completed", "approved"].includes(status)) {
    const out = Math.min(started + workH * H, now - 0.2 * H);
    t.checkOutTime = new Date(out).toISOString();
    const mins = Math.max(1, Math.round((out - new Date(t.checkInTime as string).getTime()) / 60000));
    t.duration = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ""}`;
    t.comments = pick(notes);
  }
  if (status === "approved") {
    const c = calculateCommercial(maintenanceLevel, serviceLevel, distanceBand, visitDuration);
    const d = new Date(t.checkOutTime as string);
    t.customerChargeUSD = c.customerChargeUSD;
    t.engineerPaymentUSD = c.engineerPaymentUSD;
    t.profit = c.profit;
    t.invoiceNumber = `INV-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}-${1000 + i}`;
  }
  if (status === "rejected") {
    t.rejectedAt = new Date(created + 0.5 * H).toISOString();
    t.rejectionReason = "Engineer unavailable — on leave";
  }
  if (status === "cancelled") {
    t.cancelledAt = new Date(created + 2 * H).toISOString();
    t.cancelReason = "Duplicate ticket raised by NOC";
  }
  tasks.push(t);
}

tasks.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
tasks.forEach((t, i) => { t.id = `T-${String(i + 1).padStart(3, "0")}`; });

mkdirSync(join(process.cwd(), "data"), { recursive: true });
writeFileSync(DB, JSON.stringify(tasks, null, 2));
console.log(`Seeded ${tasks.length} tasks into data/db.json`);
