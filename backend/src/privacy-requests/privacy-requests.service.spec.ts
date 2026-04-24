import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { TenantService } from '../common/tenant/tenant.service';
import type { MailService } from '../mail/mail.service';
import { User } from '../users/entities/user.entity';
import { PrivacyRequest } from './entities/privacy-request.entity';
import { PrivacyRequestEvent } from './entities/privacy-request-event.entity';
import { PrivacyRequestsService } from './privacy-requests.service';

describe('PrivacyRequestsService', () => {
  let service: PrivacyRequestsService;
  let repository: jest.Mocked<Repository<PrivacyRequest>>;
  let eventsRepository: jest.Mocked<Repository<PrivacyRequestEvent>>;
  let usersRepository: jest.Mocked<Repository<User>>;
  let mailService: Pick<MailService, 'sendMailSimple'>;

  beforeEach(() => {
    repository = {
      create: jest.fn((input: Partial<PrivacyRequest>) => input as PrivacyRequest),
      save: jest.fn((input: PrivacyRequest) => Promise.resolve(input)),
      find: jest.fn(),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<PrivacyRequest>>;
    eventsRepository = {
      create: jest.fn(
        (input: Partial<PrivacyRequestEvent>) => input as PrivacyRequestEvent,
      ),
      save: jest.fn((input: PrivacyRequestEvent) => Promise.resolve(input)),
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<PrivacyRequestEvent>>;
    usersRepository = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<User>>;
    mailService = {
      sendMailSimple: jest.fn().mockResolvedValue({
        info: {},
        usingTestAccount: false,
      }),
    };

    service = new PrivacyRequestsService(
      repository,
      eventsRepository,
      usersRepository,
      {
        getTenantId: jest.fn().mockReturnValue('company-1'),
      } as unknown as TenantService,
      mailService as MailService,
    );
  });

  it('cria requisição LGPD com SLA interno e tenant atual', async () => {
    const result = await service.createForCurrentUser('user-1', {
      type: 'access',
      description: 'Quero acessar meus dados',
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 'company-1',
        requester_user_id: 'user-1',
        type: 'access',
        status: 'open',
        description: 'Quero acessar meus dados',
      }),
    );
    expect(result.due_at).toBeInstanceOf(Date);
    expect(eventsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 'company-1',
        actor_user_id: 'user-1',
        event_type: 'created',
        to_status: 'open',
      }),
    );
  });

  it('bloqueia leitura de requisição de outro titular para usuário comum', async () => {
    repository.findOne.mockResolvedValue({
      id: 'req-1',
      company_id: 'company-1',
      requester_user_id: 'other-user',
    } as PrivacyRequest);

    await expect(
      service.findOne('req-1', { userId: 'user-1', isAdmin: false }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('exige resumo ao concluir ou rejeitar requisição', async () => {
    repository.findOne.mockResolvedValue({
      id: 'req-1',
      company_id: 'company-1',
      requester_user_id: 'user-1',
      status: 'open',
    } as PrivacyRequest);

    await expect(
      service.updateStatus('req-1', 'admin-1', {
        status: 'fulfilled',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('registra evento ao mudar status da requisição', async () => {
    repository.findOne.mockResolvedValue({
      id: 'req-1',
      company_id: 'company-1',
      requester_user_id: 'user-1',
      status: 'open',
      response_summary: null,
    } as PrivacyRequest);
    repository.save.mockImplementation(async (input) => input);
    usersRepository.findOne.mockResolvedValue({
      id: 'user-1',
      nome: 'Titular',
      email: 'titular@example.com',
      company_id: 'company-1',
    } as User);

    await service.updateStatus('req-1', 'admin-1', {
      status: 'in_review',
      response_summary: 'Em análise pelo controlador.',
    });

    expect(eventsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        privacy_request_id: 'req-1',
        actor_user_id: 'admin-1',
        event_type: 'status_changed',
        from_status: 'open',
        to_status: 'in_review',
      }),
    );
    expect(mailService.sendMailSimple).toHaveBeenCalledWith(
      'titular@example.com',
      'SGS - Atualização da sua requisição LGPD',
      expect.stringContaining('Status atual: Em análise'),
      expect.objectContaining({
        companyId: 'company-1',
        userId: 'user-1',
      }),
      undefined,
      expect.objectContaining({
        filename: 'privacy-request-req-1',
      }),
    );
  });

  it('não falha atualização quando titular não tem e-mail', async () => {
    repository.findOne.mockResolvedValue({
      id: 'req-1',
      company_id: 'company-1',
      requester_user_id: 'user-1',
      status: 'open',
      response_summary: null,
    } as PrivacyRequest);
    repository.save.mockImplementation(async (input) => input);
    usersRepository.findOne.mockResolvedValue({
      id: 'user-1',
      email: '',
      company_id: 'company-1',
    } as User);

    await expect(
      service.updateStatus('req-1', 'admin-1', {
        status: 'in_review',
      }),
    ).resolves.toMatchObject({ status: 'in_review' });
    expect(mailService.sendMailSimple).not.toHaveBeenCalled();
  });

  it('não falha atualização quando envio de e-mail falha', async () => {
    repository.findOne.mockResolvedValue({
      id: 'req-1',
      company_id: 'company-1',
      requester_user_id: 'user-1',
      status: 'open',
      response_summary: null,
    } as PrivacyRequest);
    repository.save.mockImplementation(async (input) => input);
    usersRepository.findOne.mockResolvedValue({
      id: 'user-1',
      nome: 'Titular',
      email: 'titular@example.com',
      company_id: 'company-1',
    } as User);
    jest
      .mocked(mailService.sendMailSimple)
      .mockRejectedValueOnce(new Error('SMTP indisponível'));

    await expect(
      service.updateStatus('req-1', 'admin-1', {
        status: 'in_review',
      }),
    ).resolves.toMatchObject({ status: 'in_review' });
  });

  it('lista eventos depois de validar acesso ao protocolo', async () => {
    repository.findOne.mockResolvedValue({
      id: 'req-1',
      company_id: 'company-1',
      requester_user_id: 'user-1',
    } as PrivacyRequest);
    eventsRepository.find.mockResolvedValue([
      { id: 'event-1', privacy_request_id: 'req-1' } as PrivacyRequestEvent,
    ]);

    const result = await service.listEvents('req-1', {
      userId: 'user-1',
      isAdmin: false,
    });

    expect(result).toHaveLength(1);
    expect(eventsRepository.find).toHaveBeenCalledWith({
      where: { privacy_request_id: 'req-1', company_id: 'company-1' },
      order: { created_at: 'ASC' },
    });
  });
});
