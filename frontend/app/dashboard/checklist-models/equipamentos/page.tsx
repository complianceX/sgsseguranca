import { ChecklistModelsView } from "../components/ChecklistModelsView";
import { getChecklistModuleArea } from "@/lib/checklist-modules";

export default function EquipmentChecklistModelsPage() {
  return <ChecklistModelsView area={getChecklistModuleArea("equipamentos")} />;
}
