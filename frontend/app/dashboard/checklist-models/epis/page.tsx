import { ChecklistModelsView } from "../components/ChecklistModelsView";
import { getChecklistModuleArea } from "@/lib/checklist-modules";

export default function EpiChecklistModelsPage() {
  return <ChecklistModelsView area={getChecklistModuleArea("epis")} />;
}
