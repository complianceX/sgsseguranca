import api from '@/lib/api';
import {
  calendarService,
  EVENT_TYPE_LABEL,
  EVENT_TYPE_COLOR,
  EVENT_TYPE_HREF,
} from '@/services/calendarService';
import type { CalendarEventsResponse } from '@/services/calendarService';

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

describe('calendarService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getEvents', () => {
    it('chama o endpoint correto com ano e mês como parâmetros', async () => {
      const mockResponse: { data: CalendarEventsResponse } = {
        data: { data: [], year: 2026, month: 4 },
      };
      (api.get as jest.Mock).mockResolvedValue(mockResponse);

      await calendarService.getEvents(2026, 4);

      expect(api.get).toHaveBeenCalledWith('/calendar/events', {
        params: { year: 2026, month: 4 },
      });
    });

    it('retorna CalendarEventsResponse tipada com data, year e month', async () => {
      const events = [
        { id: 'ev-1', type: 'training' as const, title: 'NR-35', date: '2026-04-10', status: 'scheduled' },
        { id: 'ev-2', type: 'medical_exam' as const, title: 'Exame Periódico', date: '2026-04-15' },
      ];
      (api.get as jest.Mock).mockResolvedValue({
        data: { data: events, year: 2026, month: 4 },
      });

      const result = await calendarService.getEvents(2026, 4);

      expect(result.year).toBe(2026);
      expect(result.month).toBe(4);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].type).toBe('training');
      expect(result.data[1].type).toBe('medical_exam');
    });

    it('retorna lista vazia quando não há eventos no mês', async () => {
      (api.get as jest.Mock).mockResolvedValue({
        data: { data: [], year: 2026, month: 2 },
      });

      const result = await calendarService.getEvents(2026, 2);

      expect(result.data).toHaveLength(0);
    });

    it('passa corretamente mês e ano para consulta em dezembro', async () => {
      (api.get as jest.Mock).mockResolvedValue({
        data: { data: [], year: 2026, month: 12 },
      });

      await calendarService.getEvents(2026, 12);

      expect(api.get).toHaveBeenCalledWith('/calendar/events', {
        params: { year: 2026, month: 12 },
      });
    });

    it('propaga erro quando o backend falha ao buscar eventos', async () => {
      const serverError = { response: { status: 500 } };
      (api.get as jest.Mock).mockRejectedValue(serverError);

      await expect(calendarService.getEvents(2026, 4)).rejects.toBe(serverError);
    });

    it('propaga erro 403 quando usuário não tem acesso ao calendário', async () => {
      const forbiddenError = { response: { status: 403 } };
      (api.get as jest.Mock).mockRejectedValue(forbiddenError);

      await expect(calendarService.getEvents(2026, 4)).rejects.toBe(forbiddenError);
    });
  });

  describe('EVENT_TYPE_LABEL', () => {
    it('contém rótulos para todos os tipos de evento suportados', () => {
      expect(EVENT_TYPE_LABEL.training).toBe('Treinamento');
      expect(EVENT_TYPE_LABEL.medical_exam).toBe('Exame Médico');
      expect(EVENT_TYPE_LABEL.dds).toBe('DDS');
      expect(EVENT_TYPE_LABEL.rdo).toBe('RDO');
      expect(EVENT_TYPE_LABEL.cat).toBe('CAT/Acidente');
      expect(EVENT_TYPE_LABEL.service_order).toBe('Ordem de Serviço');
    });

    it('define rótulos para todos os 6 tipos de CalendarEventType', () => {
      const keys = Object.keys(EVENT_TYPE_LABEL);
      expect(keys).toHaveLength(6);
    });
  });

  describe('EVENT_TYPE_COLOR', () => {
    it('define propriedades bg, text e dot para cada tipo de evento', () => {
      const types = ['training', 'medical_exam', 'dds', 'rdo', 'cat', 'service_order'] as const;
      for (const type of types) {
        expect(EVENT_TYPE_COLOR[type]).toHaveProperty('bg');
        expect(EVENT_TYPE_COLOR[type]).toHaveProperty('text');
        expect(EVENT_TYPE_COLOR[type]).toHaveProperty('dot');
      }
    });
  });

  describe('EVENT_TYPE_HREF', () => {
    it('define rotas de navegação corretas para cada tipo de evento', () => {
      expect(EVENT_TYPE_HREF.training).toBe('/dashboard/trainings');
      expect(EVENT_TYPE_HREF.medical_exam).toBe('/dashboard/medical-exams');
      expect(EVENT_TYPE_HREF.dds).toBe('/dashboard/dds');
      expect(EVENT_TYPE_HREF.rdo).toBe('/dashboard/rdos');
      expect(EVENT_TYPE_HREF.cat).toBe('/dashboard/cats');
      expect(EVENT_TYPE_HREF.service_order).toBe('/dashboard/service-orders');
    });
  });
});
