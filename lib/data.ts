export type VisitStatus = "pending" | "checked_in" | "checked_out" | "approved";

export interface Visit {
  id: string;
  engineerId: string;
  engineerName: string;
  customerId: string;
  customerName: string;
  status: VisitStatus;
  checkInTime?: string;
  checkOutTime?: string;
  comments?: string;
  customerCharge?: number;
  feCost?: number;
  profit?: number;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  role: "admin" | "engineer";
  email: string;
}

export const RATE_CARD = {
  customerCharge: 180,
  feCost: 45,
  profit: 135,
};

export const users: User[] = [
  { id: "u1", name: "Admin User", role: "admin", email: "admin@invexal.com" },
  { id: "u2", name: "James Mitchell", role: "engineer", email: "james@invexal.com" },
  { id: "u3", name: "Sara Khan", role: "engineer", email: "sara@invexal.com" },
  { id: "u4", name: "Tom Bradley", role: "engineer", email: "tom@invexal.com" },
];

export const customers = [
  { id: "c1", name: "Acme Corp" },
  { id: "c2", name: "BlueSky Ltd" },
  { id: "c3", name: "NovaTech Solutions" },
  { id: "c4", name: "Greenfield Industries" },
];

// In-memory visits array — mutated at runtime
export const visits: Visit[] = [
  {
    id: "v1",
    engineerId: "u2",
    engineerName: "James Mitchell",
    customerId: "c1",
    customerName: "Acme Corp",
    status: "approved",
    checkInTime: "2026-06-13T09:00:00Z",
    checkOutTime: "2026-06-13T11:30:00Z",
    comments: "Annual maintenance completed.",
    customerCharge: 180,
    feCost: 45,
    profit: 135,
    createdAt: "2026-06-13T08:45:00Z",
  },
  {
    id: "v2",
    engineerId: "u3",
    engineerName: "Sara Khan",
    customerId: "c2",
    customerName: "BlueSky Ltd",
    status: "checked_out",
    checkInTime: "2026-06-14T08:00:00Z",
    checkOutTime: "2026-06-14T10:15:00Z",
    comments: "Boiler inspection done.",
    createdAt: "2026-06-14T07:50:00Z",
  },
  {
    id: "v3",
    engineerId: "u4",
    engineerName: "Tom Bradley",
    customerId: "c3",
    customerName: "NovaTech Solutions",
    status: "checked_in",
    checkInTime: "2026-06-14T10:00:00Z",
    createdAt: "2026-06-14T09:55:00Z",
  },
  {
    id: "v4",
    engineerId: "u2",
    engineerName: "James Mitchell",
    customerId: "c4",
    customerName: "Greenfield Industries",
    status: "approved",
    checkInTime: "2026-06-12T13:00:00Z",
    checkOutTime: "2026-06-12T15:00:00Z",
    comments: "Electrical panel replaced.",
    customerCharge: 180,
    feCost: 45,
    profit: 135,
    createdAt: "2026-06-12T12:45:00Z",
  },
];
