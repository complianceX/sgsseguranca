import { redirect } from "next/navigation";

export default async function EditChecklistTemplateRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/checklist-models/edit/${id}`);
}
