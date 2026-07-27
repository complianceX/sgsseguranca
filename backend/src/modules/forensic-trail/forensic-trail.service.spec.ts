import { DataSource, EntityManager, Repository } from 'typeorm';
import { requestContextStorage } from '../../shared/middleware/request-context.middleware';
import { ForensicTrailEvent } from './entities/forensic-trail-event.entity';
import { ForensicTrailService } from './forensic-trail.service';

describe('ForensicTrailService', () => {
  let service: ForensicTrailService;
  let repository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    manager: EntityManager;
  };
  let manager: {
    getRepository: jest.Mock;
    query: jest.Mock;
  };
  let dataSource: {
    transaction: jest.Mock;
    options: DataSource['options'];
  };

  beforeEach(() => {
    repository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn(
        (input: Partial<ForensicTrailEvent>) => input as ForensicTrailEvent,
      ),
      save: jest.fn((input: ForensicTrailEvent) =>
        Promise.resolve({ ...input, id: 'event-1' }),
      ),
      manager: {} as EntityManager,
    };
    manager = {
      getRepository: jest.fn(() => repository),
      query: jest.fn(() => Promise.resolve([])),
    };
    dataSource = {
      options: { type: 'postgres' },
      transaction: jest.fn(
        async (callback: (tx: EntityManager) => Promise<unknown>) =>
          callback(manager as unknown as EntityManager),
      ),
    };

    service = new ForensicTrailService(
      repository as unknown as Repository<ForensicTrailEvent>,
      dataSource as unknown as DataSource,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('gera evento append-only com sequência e hash encadeado', async () => {
    const result = await service.append({
      eventType: 'FINAL_DOCUMENT_REGISTERED',
      module: 'pt',
      entityId: 'pt-1',
      companyId: 'company-1',
      userId: 'user-1',
      metadata: { documentCode: 'PT-2026-AAA' },
    });

    expect(result.id).toBe('event-1');
    expect(result.stream_key).toBe('company-1:pt:pt-1');
    expect(result.stream_sequence).toBe(1);
    expect(result.previous_event_hash).toBeNull();
    expect(result.event_hash).toMatch(/^[a-f0-9]{64}$/);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    // Migration 360 adicionou INSERT policy em forensic_trail_events para sgs_app
    // — SET LOCAL is_super_admin não é mais necessário nem chamado.
    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['company-1:pt:pt-1'],
    );
    expect(manager.query).not.toHaveBeenCalledWith(
      "SET LOCAL app.is_super_admin = 'true'",
    );
  });

  it('ativa o contexto super-admin para eventos globais internos', async () => {
    await service.append(
      {
        eventType: 'dr_execution_started',
        module: 'disaster-recovery',
        entityId: 'execution-1',
      },
      { isSuperAdmin: true },
    );

    expect(manager.query).toHaveBeenNthCalledWith(
      1,
      "SET LOCAL app.is_super_admin = 'true'",
    );
    expect(manager.query).toHaveBeenNthCalledWith(
      2,
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['global:disaster-recovery:execution-1'],
    );
  });

  it('encadeia o hash e usa contexto da requisição quando disponível', async () => {
    repository.findOne.mockResolvedValue({
      id: 'event-previous',
      stream_sequence: 2,
      event_hash: 'a'.repeat(64),
    });

    const store = new Map<string, unknown>([
      ['requestId', 'req-1'],
      ['userId', 'user-context'],
      ['companyId', 'company-context'],
      ['ip', '10.0.0.1'],
      ['userAgent', 'jest-agent'],
    ]);

    const result = await requestContextStorage.run(store, () =>
      service.append({
        eventType: 'SIGNATURE_RECORDED',
        module: 'apr',
        entityId: 'apr-1',
        metadata: { signatureType: 'hmac' },
      }),
    );

    expect(result.stream_key).toBe('company-context:apr:apr-1');
    expect(result.stream_sequence).toBe(3);
    expect(result.previous_event_hash).toBe('a'.repeat(64));
    expect(result.request_id).toBe('req-1');
    expect(result.user_id).toBe('user-context');
    expect(result.ip).toBe('10.0.0.1');
    expect(result.user_agent).toBe('jest-agent');
  });
});
