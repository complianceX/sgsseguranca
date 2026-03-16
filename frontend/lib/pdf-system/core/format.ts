function parseDocumentDate(value: string): Date | null {
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function sanitize(value?: string | number | boolean | null): string {
  if (value === undefined || value === null || value === "") return "-";

  const subscriptDigits: Record<string, string> = {
    "₀": "0",
    "₁": "1",
    "₂": "2",
    "₃": "3",
    "₄": "4",
    "₅": "5",
    "₆": "6",
    "₇": "7",
    "₈": "8",
    "₉": "9",
  };

  const normalized = String(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (char) => subscriptDigits[char] || char)
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/•/g, "-");

  const collapsed = normalized
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .trim();

  return collapsed || "-";
}

export function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = parseDocumentDate(value);
  if (!date) return String(value);
  return date.toLocaleDateString("pt-BR");
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const date = parseDocumentDate(value);
  if (!date) return String(value);
  return date.toLocaleString("pt-BR");
}

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
}

export function buildDocumentCode(
  prefix: string,
  reference?: string | number | null,
  dateValue?: string | Date | null,
): string {
  const candidateDate = dateValue ? new Date(dateValue) : new Date();
  const year = Number.isNaN(candidateDate.getTime())
    ? new Date().getFullYear()
    : candidateDate.getFullYear();
  const ref = sanitize(reference).replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase();
  return `${prefix}-${year}-${ref || `${Date.now()}`.slice(-6)}`;
}

export function buildValidationUrl(code: string): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  const origin = typeof window !== "undefined" ? window.location.origin : envUrl || "https://gst-sst.app";
  return `${origin.replace(/\/$/, "")}/validar/${code}`;
}

export function buildPdfFilename(prefix: string, title: string, date?: string | null): string {
  const safeTitle = slugify(title || prefix).slice(0, 44) || prefix;
  const safeDate = formatDate(date).replace(/\//g, "-");
  return `${prefix}_${safeTitle}_${safeDate}.pdf`;
}
