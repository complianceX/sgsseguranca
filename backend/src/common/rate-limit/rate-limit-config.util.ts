export const parseRateLimit = (
  value: string | undefined,
  fallback: number,
): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const resolveHourlyRateLimit = (
  hourlyValue: string | undefined,
  perMinuteValue: number,
): number => {
  const parsed = Number(hourlyValue);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return perMinuteValue * 60;
};
