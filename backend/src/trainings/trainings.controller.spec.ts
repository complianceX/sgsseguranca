import { TrainingsController } from './trainings.controller';
import { Role } from '../auth/enums/roles.enum';
import type { CatalogQueryDto } from '../common/dto/catalog-query.dto';
import type { TrainingsService } from './trainings.service';
import type { UsersService } from '../users/users.service';
import type { FileInspectionService } from '../common/security/file-inspection.service';

describe('TrainingsController lookup endpoints', () => {
  it('mapeia lookup de colaboradores com role reduzido', async () => {
    const trainingsService = {
      findPaginated: jest.fn(),
    } as jest.Mocked<Pick<TrainingsService, 'findPaginated'>>;
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
    } as jest.Mocked<Pick<UsersService, 'findPaginated'>>;
    const controller = new TrainingsController(
      trainingsService as unknown as TrainingsService,
      usersService as unknown as UsersService,
      {} as unknown as FileInspectionService,
    );

    const query: CatalogQueryDto = {
      page: 2,
      limit: 50,
      search: 'Ana',
    };

    const result = await controller.findLookupUsers(query);

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
