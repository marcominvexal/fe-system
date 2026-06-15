import {
  MaintenanceLevel,
  ServiceLevel,
  DistanceBand,
  VisitDuration,
  buildRuleKey,
} from "./commercialEngine";

export type { MaintenanceLevel, ServiceLevel, DistanceBand, VisitDuration };
export {
  MAINTENANCE_LEVELS,
  SERVICE_LEVELS,
  DISTANCE_BANDS,
  VISIT_DURATIONS,
  shortLabel,
  buildRuleKey,
  calculateCommercial,
} from "./commercialEngine";

// ─── Task status lifecycle ────────────────────────────────────────────────────
export type TaskStatus =
  | "assigned"    // created by admin, waiting for FE to accept
  | "accepted"    // FE accepted, not yet on site
  | "rejected"    // FE rejected with reason
  | "in_progress" // FE checked in (Time In)
  | "completed"   // FE checked out (Time Out), awaiting admin approval
  | "approved"    // admin approved, invoice generated
  | "cancelled";  // admin cancelled

// ─── Task ─────────────────────────────────────────────────────────────────────
export interface Task {
  id:                  string;
  title:               string;
  description:         string;
  customer:            string;
  location:            string;
  engineerId:          string;
  engineerName:        string;
  status:              TaskStatus;
  maintenanceType:     string;
  maintenanceLevel:    MaintenanceLevel;
  serviceLevel:        ServiceLevel;
  distanceBand:        DistanceBand;
  visitDuration:       VisitDuration;
  ruleKey:             string;
  createdAt:           string;
  acceptedAt?:         string;
  rejectedAt?:         string;
  rejectionReason?:    string;
  checkInTime?:        string;
  checkOutTime?:       string;
  duration?:           string;
  comments?:           string;
  aiSummary?:          string;
  customerChargeUSD?:  number;
  engineerPaymentUSD?: number;
  profit?:             number;
  approved:            boolean;
  invoiceNumber?:      string;
  cancelledAt?:        string;
  cancelReason?:       string;
}

// ─── Reference data (client-safe) ─────────────────────────────────────────────

export const engineers = [
  { id: "u2", name: "Ali Raza" },
  { id: "u3", name: "Hassan Ahmed" },
  { id: "u4", name: "Usman Khan" },
  { id: "u5", name: "Bilal Hussain" },
  { id: "u6", name: "Ayesha Malik" },
];

export const customers = [
  { id: "c1", name: "Orange Business" },
];

export const maintenanceTypes = [
  "Fiber Link Down",
  "Router Configuration",
  "ODF Maintenance",
  "Site Power Issue",
  "Transmission Fault",
  "Latency Investigation",
  "Network Optimization",
  "Signal Degradation Issue",
];

export const locations = [
  "Karachi",
  "Lahore",
  "Islamabad",
  "Rawalpindi",
  "Faisalabad",
  "Multan",
  "Hyderabad",
  "Sialkot",
  "Gujranwala",
  "Peshawar",
  "Quetta",
  "Bahawalpur",
];

// ─── Utility ──────────────────────────────────────────────────────────────────

export function calcDuration(checkIn?: string, checkOut?: string): string {
  if (!checkIn || !checkOut) return "—";
  const mins = Math.round(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 60000
  );
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function generateInvoiceNumber(): string {
  const now = new Date();
  const yy  = now.getFullYear().toString().slice(2);
  const mm  = String(now.getMonth() + 1).padStart(2, "0");
  const seq = Math.floor(Math.random() * 9000) + 1000;
  return `INV-${yy}${mm}-${seq}`;
}

// Silence unused import warning
void buildRuleKey;
