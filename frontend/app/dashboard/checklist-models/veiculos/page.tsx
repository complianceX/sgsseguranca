import { ChecklistModelsView } from "../components/ChecklistModelsView";
import { getChecklistModuleArea } from "@/lib/checklist-modules";

export default function VehicleChecklistModelsPage() {
  return <ChecklistModelsView area={getChecklistModuleArea("veiculos")} />;
}
