import type { Signature } from "@/services/signaturesService";
import { sanitize } from "./core/format";

/**
 * Rótulo de prova impresso no documento governado.
 *
 * Só `hmac` é verificado no servidor (PIN do signatário via HMAC-SHA256).
 * Os demais são CAPTURA DE EVIDÊNCIA — o rótulo não pode sugerir verificação
 * criptográfica que não ocorreu. Os tipos legados (`digital`, `facial`,
 * `simple`) eram apresentados como "Assinatura Digital"/"Facial" sem
 * qualquer verificação; agora são rotulados pelo que de fato são.
 */
const SIGNATURE_TYPE_LABEL: Record<string, string> = {
  hmac: "Assinatura eletrônica verificada por PIN (HMAC-SHA256)",
  drawn: "Assinatura manuscrita capturada",
  upload: "Imagem de assinatura enviada",
  acknowledgement: "Aceite eletrônico registrado",
  // Legado (dados anteriores à allowlist de tipos) — rótulo honesto.
  digital: "Assinatura eletrônica registrada",
  facial: "Registro facial capturado",
  simple: "Aceite eletrônico registrado",
  cpf_pin: "Assinatura eletrônica registrada",
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
