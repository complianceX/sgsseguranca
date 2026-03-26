import api from '@/lib/api';

export type CalendarEventType =
  | 'training'
  | 'medical_exam'
  | 'dds'
  | 'rdo'
  | 'cat'
  | 'service_order';

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  title: string;
  date: string; // YYYY-MM-DD
  status?: string;
  subtype?: string;
}

export interface CalendarEventsResponse {
  data: CalendarEvent[];
  year: number;
  month: number;
}

export const EVENT_TYPE_LABEL: Record<CalendarEventType, string> = {
  training: 'Treinamento',
  medical_exam: 'Exame Médico',
  dds: 'DDS',
  rdo: 'RDO',
  cat: 'CAT/Acidente',
  service_order: 'Ordem de Serviço',
};

export const EVENT_TYPE_COLOR: Record<CalendarEventType, { bg: string; text: string; dot: string }> = {
  training: { bg: 'bg-[var(--ds-color-surface-muted)]', text: 'text-[var(--ds-color-text-primary)]', dot: 'bg-[var(--ds-color-text-secondary)]' },
  medical_exam: { bg: 'bg-[var(--ds-color-surface-muted)]', text: 'text-[var(--ds-color-text-secondary)]', dot: 'bg-[var(--ds-color-text-muted)]' },
  dds: { bg: 'bg-[var(--ds-color-primary-subtle)]', text: 'text-[var(--ds-color-action-primary)]', dot: 'bg-[var(--ds-color-action-primary)]' },
  rdo: { bg: 'bg-[var(--ds-color-surface-muted)]', text: 'text-[var(--ds-color-text-secondary)]', dot: 'bg-[var(--ds-color-text-muted)]' },
  cat: { bg: 'bg-[var(--ds-color-danger-subtle)]', text: 'text-[var(--ds-color-danger)]', dot: 'bg-[var(--ds-color-danger)]' },
  service_order: { bg: 'bg-[var(--ds-color-warning-subtle)]', text: 'text-[var(--ds-color-warning)]', dot: 'bg-[var(--ds-color-warning)]' },
};

export const EVENT_TYPE_HREF: Record<CalendarEventType, string> = {
  training: '/dashboard/trainings',
  medical_exam: '/dashboard/medical-exams',
  dds: '/dashboard/dds',
  rdo: '/dashboard/rdos',
  cat: '/dashboard/cats',
  service_order: '/dashboard/service-orders',
};

export const calendarService = {
  async getEvents(year: number, month: number): Promise<CalendarEventsResponse> {
    const { data } = await api.get<CalendarEventsResponse>('/calendar/events', {
      params: { year, month },
    });
    return data;
  },
};
