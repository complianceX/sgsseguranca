import { TrainingsController } from './trainings.controller';
import { Role } from '../auth/enums/roles.enum';

describe('TrainingsController lookup endpoints', () => {
  it('mapeia lookup de colaboradores com role reduzido', async () => {
    const trainingsService = {
      findPaginated: jest.fn(),
    } as any;
    const usersService = {
      findPaginated: jest.fn().mockResolvedValue({
        data: [
          {
            id: 'u-1',
            nome: 'Ana',
            funcao: 'TST',
            company_id: 'c-1',
            site_id: 's-1',
            profile: { id: 'p-1', nome: Role.TST },
          },
        ],
        page: 1,
        limit: 20,
        total: 1,
        lastPage: 1,
      }),
    } as any;
    const controller = new TrainingsController(
      trainingsService,
      usersService,
      {} as any,
    );

    const result = await controller.findLookupUsers({
      page: 2,
      limit: 50,
      search: 'Ana',
    } as any);

    expect(usersService.findPaginated).toHaveBeenCalledWith({
      page: 2,
      limit: 50,
      search: 'Ana',
    });
    expect(result.data[0]).toMatchObject({
      id: 'u-1',
      nome: 'Ana',
      funcao: 'TST',
      role: 'manager',
      company_id: 'c-1',
      site_id: 's-1',
      profile: { id: 'p-1', nome: Role.TST },
    });
  });
});
