import { ChecklistModelsView } from "../components/ChecklistModelsView";
import { getChecklistModuleArea } from "@/lib/checklist-modules";

export default function NormativeChecklistModelsPage() {
  return <ChecklistModelsView area={getChecklistModuleArea("normativos")} />;
}
