import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { TenantService } from '../common/tenant/tenant.service';
import { PasswordService } from '../common/services/password.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { Profile } from '../profiles/entities/profile.entity';
import { RequestContext } from '../common/middleware/request-context.middleware';

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

describe('UsersService.exportMyData', () => {
  let service: UsersService;
  let repo: jest.Mocked<Repository<User>>;
  let profilesRepo: jest.Mocked<Repository<Profile>>;
  let auditLogMock: jest.Mock;
  let tenantService: Partial<TenantService>;
  let passwordService: Partial<PasswordService>;
  let auditService: Partial<AuditService>;

  beforeEach(() => {
    auditLogMock = jest.fn();
    repo = {
      findOne: jest.fn(),
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

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reutiliza o mesmo exportedAt no audit log e na resposta tipada', async () => {
    const createdAt = new Date('2026-03-24T10:00:00.000Z');
    const updatedAt = new Date('2026-03-25T10:30:00.000Z');
    const user: User = {
      id: 'user-1',
      nome: 'Maria da Silva',
      cpf: '12345678900',
      email: 'maria@example.com',
      funcao: 'TST',
      status: true,
      ai_processing_consent: true,
      company_id: 'company-1',
      profile_id: 'profile-1',
      site_id: 'site-1',
      created_at: createdAt,
      updated_at: updatedAt,
      profile: {
        id: 'profile-1',
        nome: 'Administrador da Empresa',
      } as Profile,
      site: {
        id: 'site-1',
        nome: 'Matriz',
      } as User['site'],
    } as User;

    repo.findOne.mockResolvedValue(user);
    jest.spyOn(RequestContext, 'get').mockImplementation((key: string) => {
      if (key === 'ip') return '127.0.0.1';
      if (key === 'userAgent') return 'jest';
      return undefined;
    });

    const result = await service.exportMyData('user-1');

    expect(typeof result.exportedAt).toBe('string');
    expect(result.dataController).toBe('SGS — Sistema de Gestão de Segurança');
    expect(result.legalBasis).toBe(
      'LGPD Art. 20 — Portabilidade de dados pessoais',
    );
    expect(result.profile).toEqual({
      id: 'user-1',
      nome: 'Maria da Silva',
      cpf: '12345678900',
      email: 'maria@example.com',
      funcao: 'TST',
      status: true,
      ai_processing_consent: true,
      profile: {
        id: 'profile-1',
        nome: 'Administrador da Empresa',
      },
      site: {
        id: 'site-1',
        nome: 'Matriz',
      },
      company_id: 'company-1',
      created_at: createdAt.toISOString(),
      updated_at: updatedAt.toISOString(),
    });

    expect(auditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        action: AuditAction.DATA_PORTABILITY,
        entity: 'USER',
        entityId: 'user-1',
        companyId: 'company-1',
        ip: '127.0.0.1',
        userAgent: 'jest',
        changes: {
          exportedAt: result.exportedAt,
        },
      }),
    );
  });
});
