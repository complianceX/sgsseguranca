import { ChecklistModelsView } from "./components/ChecklistModelsView";
import { getChecklistModuleArea } from "@/lib/checklist-modules";

export default function ChecklistModelsPage() {
  return (
    <ChecklistModelsView
      area={getChecklistModuleArea("central")}
      showBootstrapAction
    />
  );
}
