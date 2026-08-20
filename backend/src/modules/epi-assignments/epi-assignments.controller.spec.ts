import { EpiAssignmentsController } from './epi-assignments.controller';
import { Role } from '../auth/enums/roles.enum';
import type { CatalogQueryDto } from '../../shared/dto/catalog-query.dto';
import type { EpiAssignmentsService } from './epi-assignments.service';
import type { UsersService } from '../users/users.service';
import type { EpisService } from '../epis/epis.service';

describe('EpiAssignmentsController lookup endpoints', () => {
  it('mapeia lookup de colaboradores e EPIs com payload mínimo', async () => {
    const assignmentsService = {
      findPaginated: jest.fn(),
    } as jest.Mocked<Pick<EpiAssignmentsService, 'findPaginated'>>;
    const usersService = {
      findPaginated: jest.fn().mockResolvedValue({
        data: [
          {
            id: 'u-1',
            nome: 'Carlos',
            funcao: 'Operador',
            company_id: 'c-1',
            site_id: 's-1',
            profile: { id: 'p-1', nome: Role.COLABORADOR },
          },
        ],
        page: 1,
        limit: 20,
        total: 1,
        lastPage: 1,
      }),
    } as jest.Mocked<Pick<UsersService, 'findPaginated'>>;
    const episService = {
      findPaginated: jest.fn().mockResolvedValue({
        data: [
          {
            id: 'e-1',
            nome: 'Luva',
            ca: '123',
            validade_ca: '2026-12-31',
            company_id: 'c-1',
          },
        ],
        page: 1,
        limit: 20,
        total: 1,
        lastPage: 1,
      }),
    } as jest.Mocked<Pick<EpisService, 'findPaginated'>>;
    const controller = new EpiAssignmentsController(
      assignmentsService as unknown as EpiAssignmentsService,
      usersService as unknown as UsersService,
      episService as unknown as EpisService,
    );

    const usersQuery: CatalogQueryDto = {
      page: 1,
      limit: 20,
      search: 'Carlos',
    };
    const episQuery: CatalogQueryDto = {
      page: 1,
      limit: 20,
      search: 'Luva',
    };

    const usersResult = await controller.findLookupUsers(usersQuery);
    const episResult = await controller.findLookupEpis(episQuery);

    expect(usersService.findPaginated).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      search: 'Carlos',
    });
    expect(episService.findPaginated).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      search: 'Luva',
    });
    expect(usersResult.data[0]).toMatchObject({
      id: 'u-1',
      nome: 'Carlos',
      funcao: 'Operador',
      role: 'user',
      company_id: 'c-1',
      site_id: 's-1',
    });
    expect(episResult.data[0]).toMatchObject({
      id: 'e-1',
      nome: 'Luva',
      ca: '123',
      validade_ca: '2026-12-31',
      company_id: 'c-1',
    });
  });

  it('repassa o usuário autenticado ao emitir o PDF final governado', async () => {
    const generateFinalPdfMock = jest
      .fn()
      .mockResolvedValue({ generated: true });
    const assignmentsService = {
      generateFinalPdf: generateFinalPdfMock,
    } as unknown as EpiAssignmentsService;
    const controller = new EpiAssignmentsController(
      assignmentsService,
      {} as UsersService,
      {} as EpisService,
    );

    await controller.generateFinalPdf('11111111-1111-4111-8111-111111111111', {
      user: { id: 'actor-1' },
    } as never);

    expect(generateFinalPdfMock).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'actor-1',
    );
  });
});
