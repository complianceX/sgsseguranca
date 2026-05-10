import { UnauthorizedException } from '@nestjs/common';
import { FindManyOptions, FindOneOptions, Repository } from 'typeorm';
import { EpiAssignment } from '../epi-assignments/entities/epi-assignment.entity';
import { MedicalExam } from '../medical-exams/entities/medical-exam.entity';
import { Training } from '../trainings/entities/training.entity';
import { TenantService } from '../common/tenant/tenant.service';
import { User } from './entities/user.entity';
import { WorkerOperationalStatusService } from './worker-operational-status.service';

type MockRepository<T extends object> = jest.Mocked<
  Pick<Repository<T>, 'findOne' | 'find'>
>;

const tenantId = '11111111-1111-4111-8111-111111111111';

function createRepository<T extends object>(): MockRepository<T> {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
  };
}

describe('WorkerOperationalStatusService', () => {
  let usersRepository: MockRepository<User>;
  let medicalExamsRepository: MockRepository<MedicalExam>;
  let trainingsRepository: MockRepository<Training>;
  let epiAssignmentsRepository: MockRepository<EpiAssignment>;
  let tenantService: jest.Mocked<Pick<TenantService, 'getTenantId'>>;
  let service: WorkerOperationalStatusService;

  beforeEach(() => {
    process.env.FIELD_ENCRYPTION_ENABLED = 'false';
    usersRepository = createRepository<User>();
    medicalExamsRepository = createRepository<MedicalExam>();
    trainingsRepository = createRepository<Training>();
    epiAssignmentsRepository = createRepository<EpiAssignment>();
    tenantService = {
      getTenantId: jest.fn(() => tenantId),
    };
    service = new WorkerOperationalStatusService(
      usersRepository as unknown as Repository<User>,
      medicalExamsRepository as unknown as Repository<MedicalExam>,
      trainingsRepository as unknown as Repository<Training>,
      epiAssignmentsRepository as unknown as Repository<EpiAssignment>,
      tenantService as unknown as TenantService,
    );
  });

  afterEach(() => {
    delete process.env.FIELD_ENCRYPTION_ENABLED;
  });

  it('falha fechado quando nao ha tenant efetivo', async () => {
    tenantService.getTenantId.mockReturnValue(undefined);

    await expect(service.getByCpf('12345678900')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(usersRepository.findOne).not.toHaveBeenCalled();
  });

  it('filtra consulta por CPF pelo tenant efetivo', async () => {
    usersRepository.findOne.mockResolvedValue(null);

    await expect(service.getByCpf('12345678900')).rejects.toThrow(
      'Trabalhador não encontrado.',
    );

    const options: FindOneOptions<User> =
      usersRepository.findOne.mock.calls[0][0];

    expect(options.where).toEqual([
      expect.objectContaining({ company_id: tenantId }),
      expect.objectContaining({ company_id: tenantId }),
    ]);
  });

  it('filtra consulta por ID pelo tenant efetivo', async () => {
    usersRepository.findOne.mockResolvedValue(null);

    await expect(
      service.getByUserId('22222222-2222-4222-8222-222222222222'),
    ).rejects.toThrow('Trabalhador não encontrado.');

    const options: FindOneOptions<User> =
      usersRepository.findOne.mock.calls[0][0];

    expect(options.where).toEqual(
      expect.objectContaining({ company_id: tenantId }),
    );
  });

  it('filtra consulta em lote e dados relacionados pelo tenant efetivo', async () => {
    usersRepository.find.mockResolvedValue([
      {
        id: '22222222-2222-4222-8222-222222222222',
        nome: 'Operador',
        cpf: '12345678900',
        cpf_ciphertext: null,
        funcao: 'Operador',
        company_id: tenantId,
        status: true,
      } as User,
    ]);
    medicalExamsRepository.find.mockResolvedValue([]);
    trainingsRepository.find.mockResolvedValue([]);
    epiAssignmentsRepository.find.mockResolvedValue([]);

    await service.getByUserIds(['22222222-2222-4222-8222-222222222222']);

    const userOptions: FindManyOptions<User> =
      usersRepository.find.mock.calls[0][0]!;
    const examOptions: FindManyOptions<MedicalExam> =
      medicalExamsRepository.find.mock.calls[0][0]!;
    const trainingOptions: FindManyOptions<Training> =
      trainingsRepository.find.mock.calls[0][0]!;
    const epiOptions: FindManyOptions<EpiAssignment> =
      epiAssignmentsRepository.find.mock.calls[0][0]!;

    expect(userOptions.where).toEqual(
      expect.objectContaining({
        company_id: tenantId,
      }),
    );
    expect(examOptions.where).toEqual(
      expect.objectContaining({ company_id: tenantId }),
    );
    expect(trainingOptions.where).toEqual(
      expect.objectContaining({ company_id: tenantId }),
    );
    expect(epiOptions.where).toEqual(
      expect.objectContaining({ company_id: tenantId }),
    );
  });
});
