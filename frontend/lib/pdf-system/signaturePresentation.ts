import type { Signature } from "@/services/signaturesService";
import { sanitize } from "./core/format";

const SIGNATURE_TYPE_LABEL: Record<string, string> = {
  digital: "Assinatura Digital",
  upload: "Imagem Enviada",
  facial: "Facial",
  hmac: "PIN Seguro (HMAC-SHA256)",
};

export function resolveSignatureTypeLabel(type?: string | null): string {
  const key = String(type || "")
    .trim()
    .toLowerCase();
  return SIGNATURE_TYPE_LABEL[key] ?? sanitize(type);
}

export function resolveSignatureSignerName(signature: Signature): string {
  return sanitize(signature.user?.nome || signature.type);
}

export function resolveSignatureSignerRole(signature: Signature): string {
  return sanitize(
    signature.user?.funcao || resolveSignatureTypeLabel(signature.type),
  );
}
