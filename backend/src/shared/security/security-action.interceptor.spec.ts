import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { lastValueFrom } from 'rxjs';
import { SecurityActionInterceptor } from './security-action.interceptor';

describe('SecurityActionInterceptor', () => {
  it('registra approvalDecision tambem para PATCH /:id/approve', async () => {
    const securityAudit = {
      approvalDecision: jest.fn(),
      deletionInitiated: jest.fn(),
      exportInitiated: jest.fn(),
    };
    const interceptor = new SecurityActionInterceptor(securityAudit as never);
    const request = {
      method: 'PATCH',
      route: { path: '/aprs/:id/approve' },
      path: '/aprs/11111111-1111-4111-8111-111111111111/approve',
      params: { id: '11111111-1111-4111-8111-111111111111' },
      user: { userId: 'user-1' },
      body: { reason: 'Aprovacao canonica' },
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;
    const next = {
      handle: () => of({ ok: true }),
    } satisfies CallHandler;

    await lastValueFrom(interceptor.intercept(context, next));

    expect(securityAudit.approvalDecision).toHaveBeenCalledWith(
      'user-1',
      'aprs',
      '11111111-1111-4111-8111-111111111111',
      'approve',
      'Aprovacao canonica',
    );
  });

  it('registra approvalDecision tambem para POST /:id/approve legado', async () => {
    const securityAudit = {
      approvalDecision: jest.fn(),
      deletionInitiated: jest.fn(),
      exportInitiated: jest.fn(),
    };
    const interceptor = new SecurityActionInterceptor(securityAudit as never);
    const request = {
      method: 'POST',
      route: { path: '/aprs/:id/approve' },
      path: '/aprs/11111111-1111-4111-8111-111111111111/approve',
      params: { id: '11111111-1111-4111-8111-111111111111' },
      user: { userId: 'user-1' },
      body: { reason: 'Compat legado auditada' },
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;
    const next = {
      handle: () => of({ ok: true }),
    } satisfies CallHandler;

    await lastValueFrom(interceptor.intercept(context, next));

    expect(securityAudit.approvalDecision).toHaveBeenCalledWith(
      'user-1',
      'aprs',
      '11111111-1111-4111-8111-111111111111',
      'approve',
      'Compat legado auditada',
    );
  });

  it('registra approvalDecision tambem para PATCH /:id/reject', async () => {
    const securityAudit = {
      approvalDecision: jest.fn(),
      deletionInitiated: jest.fn(),
      exportInitiated: jest.fn(),
    };
    const interceptor = new SecurityActionInterceptor(securityAudit as never);
    const request = {
      method: 'PATCH',
      route: { path: '/aprs/:id/reject' },
      path: '/aprs/11111111-1111-4111-8111-111111111111/reject',
      params: { id: '11111111-1111-4111-8111-111111111111' },
      user: { userId: 'user-1' },
      body: { reason: 'Motivo canônico' },
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;
    const next = {
      handle: () => of({ ok: true }),
    } satisfies CallHandler;

    await lastValueFrom(interceptor.intercept(context, next));

    expect(securityAudit.approvalDecision).toHaveBeenCalledWith(
      'user-1',
      'aprs',
      '11111111-1111-4111-8111-111111111111',
      'reject',
      'Motivo canônico',
    );
  });

  it('registra approvalDecision tambem para PATCH /:id/finalize', async () => {
    const securityAudit = {
      approvalDecision: jest.fn(),
      deletionInitiated: jest.fn(),
      exportInitiated: jest.fn(),
    };
    const interceptor = new SecurityActionInterceptor(securityAudit as never);
    const request = {
      method: 'PATCH',
      route: { path: '/aprs/:id/finalize' },
      path: '/aprs/11111111-1111-4111-8111-111111111111/finalize',
      params: { id: '11111111-1111-4111-8111-111111111111' },
      user: { userId: 'user-1' },
      body: {},
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;
    const next = {
      handle: () => of({ ok: true }),
    } satisfies CallHandler;

    await lastValueFrom(interceptor.intercept(context, next));

    expect(securityAudit.approvalDecision).toHaveBeenCalledWith(
      'user-1',
      'aprs',
      '11111111-1111-4111-8111-111111111111',
      'finalize',
      undefined,
    );
  });
});
