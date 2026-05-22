import type { Repository } from 'typeorm';
import { Dds, DdsStatus } from './entities/dds.entity';
import { DdsSignatureInvite } from './entities/dds-signature-invite.entity';
import { DdsSignatureInviteService } from './dds-signature-invite.service';
import type { MailService } from '../mail/mail.service';
import type { TenantService } from '../common/tenant/tenant.service';
import type { SignaturesService } from '../signatures/signatures.service';

type MailContextMock = { companyId?: string; userId?: string };
type SendMailSimpleMock = jest.Mock<
  Promise<Record<string, never>>,
  [string, string, string, MailContextMock?]
>;

describe('DdsSignatureInviteService', () => {
  const originalEnv = {
    FRONTEND_URL: process.env.FRONTEND_URL,
    VALIDATION_TOKEN_SECRET: process.env.VALIDATION_TOKEN_SECRET,
  };

  const inviteWriteRepository = {
    update: jest.fn(() => Promise.resolve(undefined)),
    create: jest.fn((input: Partial<DdsSignatureInvite>) => input),
    save: jest.fn((input: Partial<DdsSignatureInvite>) =>
      Promise.resolve(input as DdsSignatureInvite),
    ),
  };

  const inviteRepository = {
    manager: {
      transaction: jest.fn(
        <T>(
          callback: (manager: {
            getRepository: () => typeof inviteWriteRepository;
          }) => Promise<T> | T,
        ) =>
          Promise.resolve(
            callback({ getRepository: () => inviteWriteRepository }),
          ),
      ),
    },
  };

  const ddsRepository = {
    findOne: jest.fn(),
  };

  const tenantService = {
    getContext: jest.fn(() => ({
      companyId: 'company-1',
      userId: 'creator-1',
      isSuperAdmin: true,
      siteScope: 'all' as const,
      siteIds: [],
    })),
    getTenantId: jest.fn(() => 'company-1'),
  };

  const signaturesService = {
    findByDocument: jest.fn(() => Promise.resolve([])),
  };

  const mailService = {
    sendMailSimple: jest.fn<
      Promise<Record<string, never>>,
      [string, string, string, MailContextMock?]
    >(() => Promise.resolve({})) as SendMailSimpleMock,
  };

  let service: DdsSignatureInviteService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FRONTEND_URL = 'https://app.sgs.test';
    process.env.VALIDATION_TOKEN_SECRET =
      'test-validation-token-secret-0123456789abcdef';

    service = new DdsSignatureInviteService(
      inviteRepository as unknown as Repository<DdsSignatureInvite>,
      ddsRepository as unknown as Repository<Dds>,
      tenantService as unknown as TenantService,
      signaturesService as unknown as SignaturesService,
      mailService as unknown as MailService,
    );
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('gera link publico e envia convite DDS com contexto de auditoria do tenant', async () => {
    ddsRepository.findOne.mockResolvedValue({
      id: 'dds-1',
      company_id: 'company-1',
      tema: 'DDS Trabalho Seguro',
      version: 1,
      site_id: 'site-1',
      status: DdsStatus.PUBLICADO,
      is_modelo: false,
      pdf_file_key: null,
      participants: [
        {
          id: 'user-1',
          nome: 'Ana TST',
          email: 'ana@example.test',
          funcao: 'Tecnica de Seguranca',
        },
      ],
    });

    const result = await service.issueInvites(
      'dds-1',
      { participant_user_ids: ['user-1'], expires_in_days: 7 },
      'creator-1',
    );

    expect(result.invites[0]).toMatchObject({
      participantUserId: 'user-1',
      participantName: 'Ana TST',
      participantRole: 'Tecnica de Seguranca',
      status: 'pending',
    });
    expect(result.invites[0]?.signingUrl).toContain(
      'https://app.sgs.test/assinar/dds/',
    );

    expect(mailService.sendMailSimple).toHaveBeenCalledTimes(1);
    const [to, subject, body, context] = mailService.sendMailSimple.mock
      .calls[0] ?? ['', '', ''];
    expect(to).toBe('ana@example.test');
    expect(subject).toBe('Convite para assinar DDS: DDS Trabalho Seguro');
    expect(body).toContain('https://app.sgs.test/assinar/dds/');
    expect(context).toEqual({
      companyId: 'company-1',
      userId: 'creator-1',
    });
  });
});
