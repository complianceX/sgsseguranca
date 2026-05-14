import { EpiAssignmentsController } from './epi-assignments.controller';
import { Role } from '../auth/enums/roles.enum';

describe('EpiAssignmentsController lookup endpoints', () => {
  it('mapeia lookup de colaboradores e EPIs com payload mínimo', async () => {
    const assignmentsService = {
      findPaginated: jest.fn(),
    } as any;
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
    } as any;
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
    } as any;
    const controller = new EpiAssignmentsController(
      assignmentsService,
      usersService,
      episService,
    );

    const usersResult = await controller.findLookupUsers({
      page: 1,
      limit: 20,
      search: 'Carlos',
    } as any);
    const episResult = await controller.findLookupEpis({
      page: 1,
      limit: 20,
      search: 'Luva',
    } as any);

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
});
