/* eslint-disable @typescript-eslint/unbound-method */
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ConsentsService, computeConsentBodyHash } from './consents.service';
import { ConsentVersion } from './entities/consent-version.entity';
import { UserConsent } from './entities/user-consent.entity';
import { TenantService } from '../../shared/tenant/tenant.service';

describe('ConsentsService', () => {
  let service: ConsentsService;
  let versionsRepo: jest.Mocked<Repository<ConsentVersion>>;
  let userConsentsRepo: jest.Mocked<Repository<UserConsent>>;
  let tenantService: { getTenantId: jest.Mock };

  const ACTIVE_VERSION = {
    id: 'version-active',
    type: 'ai_processing',
    version_label: '2026-07-13',
    retired_at: null,
  } as ConsentVersion;

  const RETIRED_VERSION = {
    id: 'version-retired',
    type: 'ai_processing',
    version_label: '2026-04-24',
    retired_at: new Date('2026-07-13T00:00:00.000Z'),
  } as ConsentVersion;

  beforeEach(() => {
    versionsRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((input: unknown) => input),
      save: jest.fn((input: unknown) => Promise.resolve(input)),
    } as unknown as jest.Mocked<Repository<ConsentVersion>>;

    userConsentsRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((input: unknown) => input),
      save: jest.fn((input: unknown) =>
        Promise.resolve({ id: 'consent-1', ...(input as object) }),
      ),
    } as unknown as jest.Mocked<Repository<UserConsent>>;

    tenantService = { getTenantId: jest.fn().mockReturnValue('company-1') };

    service = new ConsentsService(
      versionsRepo,
      userConsentsRepo,
      tenantService as unknown as TenantService,
    );
  });

  describe('accept', () => {
    it('recusa aceite de versão já retirada', async () => {
      // Regressão: o versionLabel vem do cliente e getVersionByLabel não
      // checava retired_at — dava para gravar prova material (IP, UA,
      // timestamp) de aceite a um texto legal fora de vigor.
      versionsRepo.findOne.mockResolvedValue(RETIRED_VERSION);

      await expect(
        service.accept('user-1', 'ai_processing', '2026-04-24', {}),
      ).rejects.toThrow(ConflictException);
      expect(userConsentsRepo.save).not.toHaveBeenCalled();
    });

    it('registra aceite da versão vigente com prova material (IP + user-agent)', async () => {
      versionsRepo.findOne.mockResolvedValue(ACTIVE_VERSION);

      await service.accept('user-1', 'ai_processing', undefined, {
        ip: '203.0.113.10',
        userAgent: 'Mozilla/5.0',
      });

      expect(userConsentsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          company_id: 'company-1',
          type: 'ai_processing',
          version_id: 'version-active',
          accepted_ip: '203.0.113.10',
          accepted_user_agent: 'Mozilla/5.0',
          accepted_at: expect.any(Date) as Date,
        }),
      );
    });

    it('é idempotente para a mesma versão já aceita (não duplica prova)', async () => {
      versionsRepo.findOne.mockResolvedValue(ACTIVE_VERSION);
      userConsentsRepo.findOne.mockResolvedValue({
        id: 'consent-existing',
        version_id: 'version-active',
        accepted_at: new Date(),
        revoked_at: null,
      } as UserConsent);

      const result = await service.accept(
        'user-1',
        'ai_processing',
        undefined,
        {},
      );

      expect(result.id).toBe('consent-existing');
      expect(userConsentsRepo.save).not.toHaveBeenCalled();
    });

    it('exige contexto de empresa (não grava consentimento órfão)', async () => {
      tenantService.getTenantId.mockReturnValue(undefined);

      await expect(
        service.accept('user-1', 'ai_processing', undefined, {}),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('revoke', () => {
    it('cria evento de revogação preservando o aceite histórico', async () => {
      const original = {
        id: 'consent-1',
        version_id: 'version-active',
        accepted_at: new Date('2026-07-01T10:00:00.000Z'),
        accepted_ip: '203.0.113.10',
        accepted_user_agent: 'Mozilla/5.0',
        revoked_at: null,
      } as UserConsent;
      userConsentsRepo.findOne.mockResolvedValue(original);

      await service.revoke('user-1', 'ai_processing', { ip: '203.0.113.99' });

      // Event-sourcing: cria NOVA linha; jamais sobrescreve o aceite original.
      expect(userConsentsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          version_id: 'version-active',
          accepted_at: original.accepted_at,
          accepted_ip: '203.0.113.10',
          revoked_at: expect.any(Date) as Date,
          revoked_ip: '203.0.113.99',
        }),
      );
    });

    it('é idempotente quando já revogado', async () => {
      userConsentsRepo.findOne.mockResolvedValue({
        id: 'consent-1',
        revoked_at: new Date(),
      } as UserConsent);

      await service.revoke('user-1', 'ai_processing', {});
      expect(userConsentsRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('hasActiveConsent (usado pelo AiConsentGuard)', () => {
    it('força re-aceite quando a versão vigente mudou', async () => {
      versionsRepo.findOne.mockResolvedValue(ACTIVE_VERSION);
      userConsentsRepo.findOne.mockResolvedValue({
        version_id: 'version-retired', // aceitou o texto antigo
        accepted_at: new Date(),
        revoked_at: null,
      } as UserConsent);

      await expect(
        service.hasActiveConsent('user-1', 'ai_processing'),
      ).resolves.toBe(false);
    });

    it('nega quando o consentimento foi revogado', async () => {
      versionsRepo.findOne.mockResolvedValue(ACTIVE_VERSION);
      userConsentsRepo.findOne.mockResolvedValue({
        version_id: 'version-active',
        accepted_at: new Date(),
        revoked_at: new Date(),
      } as UserConsent);

      await expect(
        service.hasActiveConsent('user-1', 'ai_processing'),
      ).resolves.toBe(false);
    });

    it('fail-closed quando não há versão publicada', async () => {
      versionsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.hasActiveConsent('user-1', 'ai_processing'),
      ).resolves.toBe(false);
    });

    it('aceita quando o titular consentiu a versão vigente', async () => {
      versionsRepo.findOne.mockResolvedValue(ACTIVE_VERSION);
      userConsentsRepo.findOne.mockResolvedValue({
        version_id: 'version-active',
        accepted_at: new Date(),
        revoked_at: null,
      } as UserConsent);

      await expect(
        service.hasActiveConsent('user-1', 'ai_processing'),
      ).resolves.toBe(true);
    });
  });

  describe('getStatus', () => {
    it('expõe a versão que o titular aceitou (direito de acesso LGPD)', async () => {
      // Regressão: a relação `version` não é eager e o findOne não fazia join,
      // então acceptedVersionLabel vinha SEMPRE null — o titular não conseguia
      // saber qual texto legal aceitou.
      versionsRepo.find.mockResolvedValue([ACTIVE_VERSION]);
      userConsentsRepo.findOne.mockImplementation(((options: {
        where: { type: string };
      }) =>
        Promise.resolve(
          options.where.type === 'ai_processing'
            ? ({
                version_id: 'version-active',
                accepted_at: new Date('2026-07-13T10:00:00.000Z'),
                revoked_at: null,
                version: ACTIVE_VERSION,
              } as UserConsent)
            : null,
        )) as never);

      const status = await service.getStatus('user-1');
      const ai = status.consents.find((c) => c.type === 'ai_processing');

      expect(ai?.active).toBe(true);
      expect(ai?.acceptedVersionLabel).toBe('2026-07-13');
      expect(ai?.currentVersionLabel).toBe('2026-07-13');
      expect(ai?.needsReacceptance).toBe(false);
    });

    it('sinaliza necessidade de re-aceite quando a versão mudou', async () => {
      versionsRepo.find.mockResolvedValue([ACTIVE_VERSION]);
      userConsentsRepo.findOne.mockImplementation(((options: {
        where: { type: string };
      }) =>
        Promise.resolve(
          options.where.type === 'ai_processing'
            ? ({
                version_id: 'version-retired',
                accepted_at: new Date(),
                revoked_at: null,
                version: RETIRED_VERSION,
              } as UserConsent)
            : null,
        )) as never);

      const status = await service.getStatus('user-1');
      const ai = status.consents.find((c) => c.type === 'ai_processing');

      expect(ai?.active).toBe(false);
      expect(ai?.needsReacceptance).toBe(true);
      expect(ai?.acceptedVersionLabel).toBe('2026-04-24');
    });
  });

  describe('publishVersion', () => {
    it('bloqueia alteração do texto de uma versão já publicada', async () => {
      // O body_hash é a prova de que o texto aceito não foi adulterado depois.
      versionsRepo.findOne.mockResolvedValue({
        ...ACTIVE_VERSION,
        body_hash: computeConsentBodyHash('texto original'),
      });

      await expect(
        service.publishVersion({
          type: 'ai_processing',
          versionLabel: '2026-07-13',
          bodyMd: 'texto ADULTERADO',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('retira a versão anterior ao publicar uma nova', async () => {
      versionsRepo.findOne
        .mockResolvedValueOnce(null) // não existe com essa label
        .mockResolvedValueOnce(ACTIVE_VERSION); // versão ativa atual

      await service.publishVersion({
        type: 'ai_processing',
        versionLabel: '2026-08-01',
        bodyMd: 'novo texto',
      });

      expect(versionsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'version-active',
          retired_at: expect.any(Date) as Date,
        }),
      );
    });
  });
});
