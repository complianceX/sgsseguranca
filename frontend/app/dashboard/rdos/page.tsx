import { permanentRedirect } from "next/navigation";

export default function LegacyRdoPage() {
  permanentRedirect("/dashboard/relatorios/rdos");
}
