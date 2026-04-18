export function isDdsValidationCode(
  code: string,
  moduleParam?: string | null,
): boolean {
  const normalizedCode = code.trim().toUpperCase();
  const normalizedModule = String(moduleParam || "")
    .trim()
    .toLowerCase();

  return normalizedModule === "dds" || normalizedCode.startsWith("DDS-");
}

export function buildDdsValidationApiPath(
  code: string,
  token?: string | null,
): string {
  const params = new URLSearchParams({
    code: code.trim(),
  });
  if (token?.trim()) {
    params.set("token", token.trim());
  }
  return `/public/dds/validate?${params.toString()}`;
}

export function buildGenericVerifyRedirect(
  code: string,
  token?: string | null,
): string {
  const params = new URLSearchParams({
    code: code.trim(),
  });
  if (token?.trim()) {
    params.set("token", token.trim());
  }
  return `/verify?${params.toString()}`;
}

export function formatValidationSecurityReason(reason: string): string {
  switch (reason) {
    case "bot_user_agent":
      return "Origem automatizada identificada";
    case "missing_user_agent":
      return "User-Agent ausente";
    case "invalid_token":
      return "Token inválido ou expirado";
    case "code_mismatch":
      return "Token não corresponde ao código";
    case "legacy_without_token":
      return "Consulta executada sem token";
    default:
      return reason;
  }
}
