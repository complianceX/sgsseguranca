import { PhotographicReportWorkspace } from "../components/PhotographicReportWorkspace";

export default async function PhotographicReportEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <PhotographicReportWorkspace mode="edit" reportId={id} />;
}
