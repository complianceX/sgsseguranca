import { MetricsRegistryService } from './metrics-registry.service';

describe('MetricsRegistryService', () => {
  let service: MetricsRegistryService;

  beforeEach(() => {
    service = new MetricsRegistryService();
  });

  it('registra métricas de domínio e reaproveita instrumentação em duplicidade', () => {
    const first = service.register('dds', [
      {
        name: 'dds_created',
        description: 'Total de DDS criados',
        type: 'counter',
      },
    ]);

    expect(first.dds_created).toBeDefined();

    const second = service.register('dds', [
      {
        name: 'dds_created',
        description: 'Total de DDS criados',
        type: 'counter',
      },
    ]);

    expect(second.dds_created).toBeDefined();
    expect(second.dds_created).toBe(first.dds_created);
  });

  it('não lança erro quando o mesmo nome é registrado novamente', () => {
    service.register('pts', [
      {
        name: 'pts_created',
        description: 'Total de PTs criadas',
        type: 'counter',
      },
    ]);

    expect(() =>
      service.register('pts', [
        {
          name: 'pts_created',
          description: 'Total de PTs criadas',
          type: 'counter',
        },
      ]),
    ).not.toThrow();
  });
});
