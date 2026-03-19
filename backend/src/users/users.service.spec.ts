import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { TenantService } from '../common/tenant/tenant.service';
import { PasswordService } from '../common/services/password.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { Profile } from '../profiles/entities/profile.entity';

describe('UsersService.gdprErasure', () => {
  let service: UsersService;
  let repo: jest.Mocked<Repository<User>>;
  let profilesRepo: jest.Mocked<Repository<Profile>>;
  let updateMock: jest.Mock;
  let softDeleteMock: jest.Mock;
  let auditLogMock: jest.Mock;
  let tenantService: Partial<TenantService>;
  let passwordService: Partial<PasswordService>;
  let auditService: Partial<AuditService>;

  beforeEach(() => {
    updateMock = jest.fn();
    softDeleteMock = jest.fn();
    auditLogMock = jest.fn();
    repo = {
      findOne: jest.fn(),
      update: updateMock,
      softDelete: softDeleteMock,
    } as unknown as jest.Mocked<Repository<User>>;
    profilesRepo = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<Profile>>;

    tenantService = {
      getTenantId: jest.fn().mockReturnValue(undefined),
    };
    passwordService = {};
    auditService = {
      log: auditLogMock,
    };

    service = new UsersService(
      repo as unknown as Repository<User>,
      profilesRepo as unknown as Repository<Profile>,
      tenantService as TenantService,
      passwordService as PasswordService,
      auditService as AuditService,
    );
  });

  it('anonimiza PII e faz soft delete', async () => {
    const user: User = {
      id: 'user-1',
      nome: 'Nome Original',
      cpf: '12345678900',
      email: 'user@example.com',
      funcao: 'Dev',
      status: true,
      company_id: 'company-1',
      profile_id: 'profile-1',
      site_id: 'site-1',
      created_at: new Date(),
      updated_at: new Date(),
    } as unknown as User;

    repo.findOne.mockResolvedValue(user);

    await service.gdprErasure(user.id);

    expect(updateMock).toHaveBeenCalledWith(user.id, {
      email: `deleted_${user.id}@anon.invalid`,
      nome: 'Usuário Removido',
      cpf: null,
      funcao: null,
      status: false,
    });
    expect(softDeleteMock).toHaveBeenCalledWith(user.id);
    expect(auditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.GDPR_ERASURE,
        entity: 'USER',
        entityId: user.id,
        companyId: user.company_id,
      }),
    );
  });

  it('lança NotFound se usuário não existir', async () => {
    repo.findOne.mockResolvedValue(null as unknown as User);
    await expect(service.gdprErasure('missing')).rejects.toThrow(
      /Usuário com ID missing não encontrado/,
    );
  });
});
