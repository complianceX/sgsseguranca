import { redirect } from "next/navigation";

export default function NewChecklistTemplateRedirectPage() {
  redirect("/dashboard/checklist-models/new");
}
