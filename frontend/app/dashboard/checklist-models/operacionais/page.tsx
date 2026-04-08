import { ChecklistModelsView } from "../components/ChecklistModelsView";
import { getChecklistModuleArea } from "@/lib/checklist-modules";

export default function OperationalChecklistModelsPage() {
  return <ChecklistModelsView area={getChecklistModuleArea("operacionais")} />;
}
