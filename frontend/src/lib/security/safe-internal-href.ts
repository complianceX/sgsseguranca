const DEFAULT_ALLOWED_PREFIXES = ["/dashboard"];
const DANGEROUS_CHARS = /[\u0000-\u001f\u007f\\]/;

export function safeInternalHref(
  href: string | null | undefined,
  allowedPrefixes = DEFAULT_ALLOWED_PREFIXES,
): string | null {
  const value = String(href || "").trim();
  if (!value || DANGEROUS_CHARS.test(value)) return null;
  try {
    if (DANGEROUS_CHARS.test(decodeURIComponent(value))) return null;
  } catch {
    return null;
  }
  if (value.startsWith("//")) return null;

  let parsed: URL;
  try {
    parsed = new URL(value, "https://app.sgs.local");
  } catch {
    return null;
  }

  if (parsed.origin !== "https://app.sgs.local") {
    return null;
  }

  const pathname = parsed.pathname;
  const allowed = allowedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!allowed) return null;

  return `${pathname}${parsed.search}${parsed.hash}`;
}
