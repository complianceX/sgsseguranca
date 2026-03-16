export function sanitize(value?: string | number | boolean | null): string {
  if (value === undefined || value === null || value === "") return "-";
  return String(value);
}

export function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("pt-BR");
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
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
