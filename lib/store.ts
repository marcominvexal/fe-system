import {
  buildRuleKey,
  MaintenanceLevel,
  ServiceLevel,
  DistanceBand,
} from "./commercialEngine";

export type { MaintenanceLevel, ServiceLevel, DistanceBand };
export { MAINTENANCE_LEVELS, SERVICE_LEVELS, DISTANCE_BANDS, shortLabel, buildRuleKey } from "./commercialEngine";

export type TaskStatus =
  | "pending"
  | "assigned"
  | "in_progress"
  | "completed"
  | "approved";

export interface Task {
  id:               string;
  title:            string;
  customer:         string;
  location:         string;
  maintenanceType:  string;
  maintenanceLevel: MaintenanceLevel;
  serviceLevel:     ServiceLevel;
  distanceBand:     DistanceBand;
  ruleKey:          string;
  engineerId:       string;
  engineerName:     string;
  status:           TaskStatus;
  checkInTime?:     string;
  checkOutTime?:    string;
  comments?:        string;
  aiReport?:        string;
  customerCharge?:  number;
  feCost?:          number;
  profit?:          number;
  createdAt:        string;
}

// ─── Reference data (client-safe) ─────────────────────────────────────────────

export const engineers = [
  { id: "u2", name: "Ali Raza" },
  { id: "u3", name: "Hassan Ahmed" },
  { id: "u4", name: "Usman Khan" },
  { id: "u5", name: "Bilal Hussain" },
  { id: "u6", name: "Ayesha Malik" },
];

export const customerList = ["Orange Business"];

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

// ─── Utility (client-safe) ────────────────────────────────────────────────────

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

// Silence unused import warning — buildRuleKey is re-exported above.
void buildRuleKey;
