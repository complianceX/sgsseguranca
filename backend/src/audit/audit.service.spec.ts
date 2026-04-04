import { InternalServerErrorException } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditAction } from './enums/audit-action.enum';
import type { AuditLog } from './entities/audit-log.entity';

describe('AuditService', () => {
  it('persiste apenas o contrato canônico de audit_logs', async () => {
    const create = jest.fn((payload: Partial<AuditLog>) => payload);
    const save = jest.fn(async (payload: Partial<AuditLog>) => payload);
    const service = new AuditService({ create, save } as never);

    await service.log({
      userId: '550e8400-e29b-41d4-a716-446655440000',
      action: AuditAction.UPDATE,
      entity: 'PT',
      entityId: 'pt-1',
      changes: {
        before: { status: 'draft' },
        after: { status: 'approved' },
      },
      ip: '127.0.0.1',
      userAgent: 'jest',
      companyId: '550e8400-e29b-41d4-a716-446655440001',
    });

    expect(create).toHaveBeenCalledTimes(1);
    const payload = create.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(payload.userId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(payload.entity).toBe('PT');
    expect(payload.entityId).toBe('pt-1');
    expect(payload.companyId).toBe('550e8400-e29b-41d4-a716-446655440001');
    expect(payload.timestamp).toBeInstanceOf(Date);
    expect(payload.before).toEqual({ status: 'draft' });
    expect(payload.after).toEqual({ status: 'approved' });
    expect(payload).not.toHaveProperty('user_id');
    expect(payload).not.toHaveProperty('entity_type');
    expect(payload).not.toHaveProperty('entity_id');
    expect(payload).not.toHaveProperty('created_at');
    expect(save).toHaveBeenCalledWith(payload);
  });

  it('falha quando userId ou companyId não são informados', async () => {
    const service = new AuditService({
      create: jest.fn(),
      save: jest.fn(),
    } as never);

    await expect(
      service.log({
        userId: '',
        action: AuditAction.CREATE,
        entity: 'PT',
        entityId: 'pt-1',
        ip: '127.0.0.1',
        companyId: '',
      }),
    ).rejects.toThrow(InternalServerErrorException);
  });
});
