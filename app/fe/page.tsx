import { redirect } from "next/navigation";

// /fe redirects to the actual field engineer workspace
export default function FERedirect() {
  redirect("/fe/workspace");
}
