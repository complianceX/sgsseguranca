import { MedicalExamsController } from './medical-exams.controller';
import { Role } from '../auth/enums/roles.enum';

describe('MedicalExamsController lookup endpoints', () => {
  it('mapeia lookup de colaboradores com role reduzido', async () => {
    const medicalExamsService = {
      findPaginated: jest.fn(),
    } as any;
    const usersService = {
      findPaginated: jest.fn().mockResolvedValue({
        data: [
          {
            id: 'u-1',
            nome: 'Bruno',
            funcao: 'Supervisor',
            company_id: 'c-1',
            site_id: 's-1',
            profile: { id: 'p-1', nome: Role.SUPERVISOR },
          },
        ],
        page: 1,
        limit: 20,
        total: 1,
        lastPage: 1,
      }),
    } as any;
    const controller = new MedicalExamsController(
      medicalExamsService,
      usersService,
    );

    const result = await controller.findLookupUsers({
      page: 1,
      limit: 20,
      search: 'Bruno',
    } as any);

    expect(usersService.findPaginated).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      search: 'Bruno',
    });
    expect(result.data[0]).toMatchObject({
      id: 'u-1',
      nome: 'Bruno',
      funcao: 'Supervisor',
      role: 'manager',
      company_id: 'c-1',
      site_id: 's-1',
    });
  });
});
