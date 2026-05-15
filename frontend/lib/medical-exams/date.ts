import { differenceInCalendarDays, parseISO, startOfDay } from 'date-fns';

export const MEDICAL_EXAM_EXPIRY_SOON_DAYS = 30;

export type MedicalExamTone = 'neutral' | 'danger' | 'warning' | 'success';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function getMedicalExamDateKey(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const dateKey = value.split('T')[0];
  return ISO_DATE_RE.test(dateKey) ? dateKey : null;
}

export function toMedicalExamInputDateValue(
  value: string | null | undefined,
  fallback = '',
): string {
  return getMedicalExamDateKey(value) ?? fallback;
}

export function formatMedicalExamDateOnly(
  value: string | null | undefined,
  fallback = '—',
): string {
  const dateKey = getMedicalExamDateKey(value);
  if (!dateKey) {
    return fallback;
  }

  const [year, month, day] = dateKey.split('-');
  return `${day}/${month}/${year}`;
}

export function getMedicalExamExpiryTone(
  value: string | null | undefined,
): { label: string; tone: MedicalExamTone } {
  const dateKey = getMedicalExamDateKey(value);
  if (!dateKey) {
    return {
      label: 'Sem vencimento',
      tone: 'neutral',
    };
  }

  const expiry = parseISO(`${dateKey}T00:00:00`);
  const diff = differenceInCalendarDays(expiry, startOfDay(new Date()));

  if (diff < 0) {
    return {
      label: 'Vencido',
      tone: 'danger',
    };
  }

  if (diff <= MEDICAL_EXAM_EXPIRY_SOON_DAYS) {
    return {
      label: 'Vence em breve',
      tone: 'warning',
    };
  }

  return {
    label: 'Em dia',
    tone: 'success',
  };
}
