import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RolesGuard } from '../auth/roles.guard';
import { TenantLifecycleController } from './tenant-lifecycle.controller';
import type { TenantLifecycleService } from './tenant-lifecycle.service';
import type { CompleteOnboardingDto } from './dto/complete-onboarding.dto';

describe('TenantLifecycleController security metadata', () => {
  const getMetadata = <T = unknown>(
    target: object,
    propertyKey: string | symbol,
  ): T | undefined =>
    Reflect.getMetadata(GUARDS_METADATA, target, propertyKey) as T | undefined;

  it('enforces RolesGuard on createInvite', () => {
    const guards = getMetadata<unknown[]>(
      TenantLifecycleController.prototype,
      'createInvite',
    );

    expect(Array.isArray(guards)).toBe(true);
    expect(guards).toContain(PermissionsGuard);
    expect(guards).toContain(RolesGuard);
  });

  it('does not require RolesGuard on public onboarding routes', () => {
    const getInviteGuards = getMetadata<unknown[]>(
      TenantLifecycleController.prototype,
      'getInvite',
    );
    const completeOnboardingGuards = getMetadata<unknown[]>(
      TenantLifecycleController.prototype,
      'completeOnboarding',
    );

    expect(getInviteGuards ?? []).not.toContain(RolesGuard);
    expect(completeOnboardingGuards ?? []).not.toContain(RolesGuard);
  });
});

describe('TenantLifecycleController token hardening', () => {
  let controller: TenantLifecycleController;
  let service: Pick<
    TenantLifecycleService,
    'getInvitePublicView' | 'completeOnboarding'
  >;

  beforeEach(() => {
    service = {
      getInvitePublicView: jest.fn(),
      completeOnboarding: jest.fn(),
    };
    controller = new TenantLifecycleController(
      service as TenantLifecycleService,
    );
  });

  it('bloqueia token de onboarding malformado no GET público', () => {
    expect(() => controller.getInvite('token@@@')).toThrow(BadRequestException);
    expect(service.getInvitePublicView).not.toHaveBeenCalled();
  });

  it('bloqueia token de onboarding malformado no POST público', () => {
    const payload = {} as CompleteOnboardingDto;
    expect(() => controller.completeOnboarding('token@@@', payload)).toThrow(
      BadRequestException,
    );
    expect(service.completeOnboarding).not.toHaveBeenCalled();
  });

  it('aceita token base64url válido e delega ao serviço', async () => {
    const token = 'A'.repeat(43);
    const payload = {} as CompleteOnboardingDto;
    (service.getInvitePublicView as jest.Mock).mockResolvedValue({
      email: 'admin@empresa.com',
      intended_company_name: 'Empresa X',
      expires_at: new Date('2026-05-31T00:00:00.000Z'),
    });
    (service.completeOnboarding as jest.Mock).mockResolvedValue({
      company_id: 'company-1',
      user_id: 'user-1',
      trial_ends_at: new Date('2026-06-30T00:00:00.000Z'),
    });

    await expect(controller.getInvite(token)).resolves.toEqual(
      expect.objectContaining({
        email: 'admin@empresa.com',
      }),
    );
    await expect(
      controller.completeOnboarding(token, payload),
    ).resolves.toEqual(
      expect.objectContaining({
        company_id: 'company-1',
      }),
    );
  });
});
