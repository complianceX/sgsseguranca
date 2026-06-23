import { Test, TestingModule } from '@nestjs/testing';
import { EpisController } from './epis.controller';
import { EpisService } from './epis.service';
import { Epi } from './entities/epi.entity';
import { NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { TenantGuard } from '../../shared/guards/tenant.guard';
import { RolesGuard } from '../auth/roles.guard';
import { TenantInterceptor } from '../../shared/tenant/tenant.interceptor';

const TENANT_ID = 'company-uuid-1';

const makeEpi = (overrides: Partial<Epi> = {}): Epi =>
  ({
    id: 'epi-uuid-1',
    nome: 'Capacete de Segurança',
    ca: 'CA-12345',
    validade_ca: new Date('2025-12-31'),
    descricao: 'Capacete classe A',
    status: true,
    company_id: TENANT_ID,
    ...overrides,
  }) as Epi;

const makeOffsetPage = (items: Epi[], total = items.length) => ({
  data: items,
  total,
  page: 1,
  limit: 20,
  lastPage: Math.max(1, Math.ceil(total / 20)),
});

describe('EpisController', () => {
  let controller: EpisController;
  let service: jest.Mocked<
    Pick<
      EpisService,
      'create' | 'findOne' | 'update' | 'remove' | 'findPaginated' | 'findAll'
    >
  >;

  beforeEach(async () => {
    const mockService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      findPaginated: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EpisController],
      providers: [{ provide: EpisService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(TenantInterceptor)
      .useValue({
        intercept: (_: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .compile();

    controller = module.get<EpisController>(EpisController);
    service = module.get(EpisService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('POST / — create', () => {
    it('cria um EPI e retorna o registro criado', async () => {
      const epi = makeEpi();
      service.create.mockResolvedValueOnce(epi);

      const result = await controller.create({ nome: 'Capacete' } as never);

      expect(service.create).toHaveBeenCalledWith({ nome: 'Capacete' });
      expect(result).toEqual(epi);
    });

    it('propaga exceção do service', async () => {
      service.create.mockRejectedValueOnce(new NotFoundException('EPI'));

      await expect(
        controller.create({ nome: 'Invalido' } as never),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('GET / — findAll (findPaginated)', () => {
    it('delega para findPaginated com os parâmetros de query', async () => {
      const page = makeOffsetPage([makeEpi()]);
      service.findPaginated.mockResolvedValueOnce(page);

      const result = await controller.findAll({
        page: 1,
        limit: 10,
        search: 'capacete',
      } as never);

      expect(service.findPaginated).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        search: 'capacete',
      });
      expect(result).toEqual(page);
    });

    it('retorna lista vazia quando não há EPIs', async () => {
      const emptyPage = makeOffsetPage([]);
      service.findPaginated.mockResolvedValueOnce(emptyPage);

      const result = await controller.findAll({} as never);
      expect((result as typeof emptyPage).data).toHaveLength(0);
    });
  });

  describe('GET /:id — findOne', () => {
    it('retorna o EPI pelo ID', async () => {
      const epi = makeEpi();
      service.findOne.mockResolvedValueOnce(epi);

      const result = await controller.findOne(epi.id);

      expect(service.findOne).toHaveBeenCalledWith(epi.id);
      expect(result).toEqual(epi);
    });

    it('propaga NotFoundException quando EPI não existe', async () => {
      service.findOne.mockRejectedValueOnce(new NotFoundException());

      await expect(controller.findOne('inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('PATCH /:id — update', () => {
    it('atualiza e retorna o EPI', async () => {
      const updated = makeEpi({ nome: 'Capacete Atualizado' });
      service.update.mockResolvedValueOnce(updated);

      const result = await controller.update(updated.id, {
        nome: 'Capacete Atualizado',
      } as never);

      expect(service.update).toHaveBeenCalledWith(updated.id, {
        nome: 'Capacete Atualizado',
      });
      expect(result.nome).toBe('Capacete Atualizado');
    });

    it('propaga NotFoundException do service', async () => {
      service.update.mockRejectedValueOnce(new NotFoundException());

      await expect(
        controller.update('inexistente', { nome: 'X' } as never),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('DELETE /:id — remove', () => {
    it('delega remoção ao service', async () => {
      service.remove.mockResolvedValueOnce(undefined);

      await controller.remove('epi-uuid-1');

      expect(service.remove).toHaveBeenCalledWith('epi-uuid-1');
    });

    it('propaga NotFoundException quando EPI não existe', async () => {
      service.remove.mockRejectedValueOnce(new NotFoundException());

      await expect(controller.remove('inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
