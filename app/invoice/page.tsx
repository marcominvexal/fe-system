import { redirect } from "next/navigation";

// Moved to /admin/invoices
export default function InvoiceRedirect() {
  redirect("/admin/invoices");
}
