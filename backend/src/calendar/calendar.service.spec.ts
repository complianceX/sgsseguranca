import { UnauthorizedException } from '@nestjs/common';
import { CalendarService } from './calendar.service';

describe('CalendarService', () => {
  const createRepo = () => ({
    find: jest.fn().mockResolvedValue([]),
  });

  const createService = (tenantId?: string) => {
    const trainingsRepo = createRepo();
    const medicalExamsRepo = createRepo();
    const ddsRepo = createRepo();
    const rdosRepo = createRepo();
    const catsRepo = createRepo();
    const serviceOrdersRepo = createRepo();

    const service = new CalendarService(
      trainingsRepo as never,
      medicalExamsRepo as never,
      ddsRepo as never,
      rdosRepo as never,
      catsRepo as never,
      serviceOrdersRepo as never,
      { getTenantId: jest.fn().mockReturnValue(tenantId) } as never,
    );

    return {
      service,
      trainingsRepo,
      medicalExamsRepo,
      ddsRepo,
      rdosRepo,
      catsRepo,
      serviceOrdersRepo,
    };
  };

  it('falha fechado sem tenant no contexto', async () => {
    const { service } = createService(undefined);

    await expect(service.getEvents(2026, 4, ['can_view_calendar'])).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('nao consulta modulos sem permissao especifica, mesmo com acesso ao calendario', async () => {
    const {
      service,
      trainingsRepo,
      medicalExamsRepo,
      ddsRepo,
      rdosRepo,
      catsRepo,
      serviceOrdersRepo,
    } = createService('company-1');

    await expect(service.getEvents(2026, 4, ['can_view_calendar'])).resolves.toEqual(
      [],
    );

    expect(trainingsRepo.find).not.toHaveBeenCalled();
    expect(medicalExamsRepo.find).not.toHaveBeenCalled();
    expect(ddsRepo.find).not.toHaveBeenCalled();
    expect(rdosRepo.find).not.toHaveBeenCalled();
    expect(catsRepo.find).not.toHaveBeenCalled();
    expect(serviceOrdersRepo.find).not.toHaveBeenCalled();
  });

  it('retorna apenas eventos dos modulos permitidos', async () => {
    const {
      service,
      trainingsRepo,
      medicalExamsRepo,
      ddsRepo,
      rdosRepo,
      catsRepo,
      serviceOrdersRepo,
    } = createService('company-1');

    trainingsRepo.find
      .mockResolvedValueOnce([
        {
          id: 'training-1',
          nome: 'NR-35',
          data_conclusao: new Date('2026-04-10T00:00:00.000Z'),
          data_vencimento: new Date('2026-05-10T00:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([]);
    ddsRepo.find.mockResolvedValueOnce([
      {
        id: 'dds-1',
        tema: 'Trabalho em altura',
        data: new Date('2026-04-11T00:00:00.000Z'),
      },
    ]);

    await expect(
      service.getEvents(2026, 4, [
        'can_view_calendar',
        'can_view_trainings',
        'can_view_dds',
      ]),
    ).resolves.toEqual([
      {
        id: 'training-conc-training-1',
        type: 'training',
        title: 'NR-35',
        date: '2026-04-10',
        subtype: 'conclusao',
      },
      {
        id: 'dds-dds-1',
        type: 'dds',
        title: 'DDS: Trabalho em altura',
        date: '2026-04-11',
      },
    ]);

    expect(trainingsRepo.find).toHaveBeenCalledTimes(2);
    expect(ddsRepo.find).toHaveBeenCalledTimes(1);
    expect(medicalExamsRepo.find).not.toHaveBeenCalled();
    expect(rdosRepo.find).not.toHaveBeenCalled();
    expect(catsRepo.find).not.toHaveBeenCalled();
    expect(serviceOrdersRepo.find).not.toHaveBeenCalled();
  });
});
