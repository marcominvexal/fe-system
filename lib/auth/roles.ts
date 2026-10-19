/**
 * /lib/auth/roles.ts — who may do what (client-safe).
 *
 *   viewer  — read everything, change nothing
 *   finance — run the workflow and billing (sync, invoices, payouts, pricing review)
 *   admin   — everything, including pricing rules and user management
 */
export type Role = "admin" | "finance" | "viewer";

export const ROLES: { value: Role; label: string; description: string }[] = [
  { value: "admin",   label: "Admin",   description: "Everything, including pricing rules and users" },
  { value: "finance", label: "Finance", description: "Work orders, inbox, billing, payouts and price review" },
  { value: "viewer",  label: "Viewer",  description: "Read-only access for management" },
];

export interface SessionUser { id: string; email: string; name: string; role: Role }

/** API calls a role may make. Reads are open to every signed-in user. */
export function canCallApi(role: Role, method: string, path: string): boolean {
  // A GET to the sync or digest endpoints runs them, so treat it as a write
  const runs = path === "/api/mail/sync" || path === "/api/digest";
  if ((method === "GET" || method === "HEAD") && !runs) return true;
  if (role === "admin") return true;
  if (role === "viewer") return false;
  // finance
  if (path.startsWith("/api/users")) return false;
  if (path.startsWith("/api/settings/pricing")) return false;
  if (path.startsWith("/api/tasks") && method === "DELETE") return false;
  return true;
}

export const canEdit = (role?: Role) => role === "admin" || role === "finance";
export const isAdmin = (role?: Role) => role === "admin";
