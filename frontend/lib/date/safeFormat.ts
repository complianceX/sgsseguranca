import { format, type FormatOptions } from "date-fns";

export type DateLike = string | number | Date | null | undefined;

export function parseSafeDate(value: DateLike): Date | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export function safeFormatDate(
  value: DateLike,
  pattern: string,
  options?: FormatOptions,
  fallback = "-",
): string {
  const parsed = parseSafeDate(value);
  if (!parsed) {
    return fallback;
  }

  try {
    return format(parsed, pattern, options);
  } catch {
    return fallback;
  }
}
