import { PhotographicReportWorkspace } from "../components/PhotographicReportWorkspace";

export default function PhotographicReportEditorPage({
  params,
}: {
  params: { id: string };
}) {
  return <PhotographicReportWorkspace mode="edit" reportId={params.id} />;
}
