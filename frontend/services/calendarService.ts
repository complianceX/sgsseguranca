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
  training: { bg: 'bg-blue-100', text: 'text-blue-800', dot: 'bg-blue-500' },
  medical_exam: { bg: 'bg-purple-100', text: 'text-purple-800', dot: 'bg-purple-500' },
  dds: { bg: 'bg-green-100', text: 'text-green-800', dot: 'bg-green-500' },
  rdo: { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-400' },
  cat: { bg: 'bg-red-100', text: 'text-red-800', dot: 'bg-red-500' },
  service_order: { bg: 'bg-orange-100', text: 'text-orange-800', dot: 'bg-orange-500' },
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
