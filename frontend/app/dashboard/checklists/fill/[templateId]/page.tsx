import { redirect } from 'next/navigation';

export default async function FillChecklistRedirect({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  redirect(`/dashboard/checklists/new?templateId=${templateId}`);
}
