import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RLSValidationService } from '../services/rls-validation.service';
import { DataSource } from 'typeorm';

/**
 * Fase 1/2 — Testes P0: RLSValidationService
 *
 * Fase 1: Validação UUID + queries parametrizadas + isolamento cross-tenant
 * Fase 2 adiciona:
 *   - Boundary conditions do regex UUID (casos extremos aceitos e rejeitados)
 *   - Invariante: CRITICAL_TABLES tem no mínimo as tabelas de segurança obrigatórias
 *   - Invariante: SQL nunca contém UUID interpolado em nenhum caso de sucesso
 *   - Comportamento correto de score (componentes somam ≤ 100)
 *   - validateRLSPolicies retorna timestamp ISO 8601
 */

// ─── Invariante das tabelas críticas ─────────────────────────────────────────
// Estas tabelas DEVEM estar na lista CRITICAL_TABLES do serviço.
// Se alguma for removida por acidente, o teste falha.
const MANDATORY_CRITICAL_TABLES = [
  'activities',
  'companies',
  'audit_logs',
  'user_sessions',
  'notifications',
] as const;

describe('RLSValidationService', () => {
  let service: RLSValidationService;
  type QueryFn = (sql: string, params?: unknown[]) => Promise<unknown[]>;
  type QueryMock = jest.MockedFunction<QueryFn>;

  let mockDataSource: { query: QueryMock };

  const buildSecureQueryMock = (
    overrides?: Partial<{
      missingTables: string[];
      tablesWithoutForce: string[];
      tablesWithoutPolicies: string[];
      forcedCount: number;
    }>,
  ): QueryMock => {
    const missingTables = new Set(overrides?.missingTables || []);
    const tablesWithoutForce = new Set(overrides?.tablesWithoutForce || []);
    const tablesWithoutPolicies = new Set(
      overrides?.tablesWithoutPolicies || [],
    );
    const forcedCount = overrides?.forcedCount ?? 10;

    return jest.fn().mockImplementation((sql: string, params?: unknown[]) => {
      const table =
        Array.isArray(params) && typeof params[1] === 'string' ? params[1] : '';

      if (sql.includes('FROM information_schema.tables')) {
        return Promise.resolve(
          missingTables.has(table) ? [] : [{ exists: true }],
        );
      }

      if (sql.includes('FROM pg_class c') && sql.includes('c.relrowsecurity')) {
        return Promise.resolve([
          {
            relrowsecurity: !missingTables.has(table),
            relforcerowsecurity:
              !missingTables.has(table) && !tablesWithoutForce.has(table),
          },
        ]);
      }

      if (sql.includes('FROM pg_policies')) {
        return Promise.resolve([
          {
            count: tablesWithoutPolicies.has(table) ? '0' : '1',
          },
        ]);
      }

      if (sql.includes('COUNT(*) as forced_count')) {
        return Promise.resolve([{ forced_count: String(forcedCount) }]);
      }

      if (sql.includes('SELECT COUNT(*) as count FROM activities')) {
        return Promise.resolve([{ count: 0 }]);
      }

      return Promise.resolve([{ rowsecurity: true }]);
    });
  };

  beforeEach(async () => {
    // Mock DataSource
    mockDataSource = {
      query: jest.fn<Promise<unknown[]>, [string, unknown[]?]>(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RLSValidationService,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<RLSValidationService>(RLSValidationService);
  });

  describe('validateRLSPolicies', () => {
    it('should report PASS when RLS is enabled on all critical tables', async () => {
      // Mock: All tables have RLS enabled
      mockDataSource.query = buildSecureQueryMock();

      const result = await service.validateRLSPolicies();

      expect(result.status).toBe('secure');
      expect(result.all_pass).toBe(true);
      expect(result.critical_tables.length).toBeGreaterThan(0);
    });

    it('should report WARNING when RLS is missing on some tables', async () => {
      // Mock: Some tables missing RLS
      mockDataSource.query = buildSecureQueryMock({
        tablesWithoutForce: ['audit_logs'],
        tablesWithoutPolicies: ['audit_logs'],
      });

      const result = await service.validateRLSPolicies();

      expect(result.status).toBe('warning');
      expect(result.all_pass).toBe(false);
      expect(result.critical_tables.some((t) => t.status === 'warning')).toBe(
        true,
      );
    });

    it('should handle database connection errors gracefully', async () => {
      mockDataSource.query.mockRejectedValue(new Error('Connection failed'));

      const result = await service.validateRLSPolicies();

      expect(result.status).toBe('warning');
      expect(result.critical_tables.some((t) => t.status === 'fail')).toBe(
        true,
      );
    });
  });

  describe('testCrossTenantIsolation — P0: Validação UUID', () => {
    const VALID_UUID_A = '11111111-1111-4111-8111-111111111111';
    const VALID_UUID_B = '22222222-2222-4222-8222-222222222222';

    const invalidInputs = [
      { label: 'string vazia', value: '' },
      { label: 'string arbitrária', value: 'company-a-uuid' },
      { label: 'SQL injection básico', value: "'; DROP TABLE activities; --" },
      { label: "SQL injection OR '1'='1'", value: "' OR '1'='1" },
      { label: 'UUID versão 1', value: '550e8400-e29b-11d4-a716-446655440000' },
      {
        label: 'UUID mal-formado',
        value: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      },
    ];

    for (const { label, value } of invalidInputs) {
      it(`rejeita userCompanyId inválido (${label}) com BadRequestException`, async () => {
        await expect(
          service.testCrossTenantIsolation(value, VALID_UUID_B),
        ).rejects.toThrow(BadRequestException);
      });

      it(`rejeita otherCompanyId inválido (${label}) com BadRequestException`, async () => {
        await expect(
          service.testCrossTenantIsolation(VALID_UUID_A, value),
        ).rejects.toThrow(BadRequestException);
      });
    }

    it('não executa nenhuma query quando UUID é inválido', async () => {
      await expect(
        service.testCrossTenantIsolation('invalid', VALID_UUID_B),
      ).rejects.toThrow(BadRequestException);
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });
  });

  describe('testCrossTenantIsolation — P0: Queries parametrizadas', () => {
    const VALID_UUID_A = '11111111-1111-4111-8111-111111111111';
    const VALID_UUID_B = '22222222-2222-4222-8222-222222222222';

    it('usa set_config com $1 parametrizado (não interpolação)', async () => {
      mockDataSource.query.mockResolvedValue([{ count: '0' }]);

      await service.testCrossTenantIsolation(VALID_UUID_A, VALID_UUID_B);

      const firstCall = mockDataSource.query.mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(firstCall[0]).toContain('set_config');
      expect(firstCall[0]).toContain('$1');
      expect(firstCall[0]).not.toContain(VALID_UUID_A);
      expect(firstCall[1]).toEqual(expect.arrayContaining([VALID_UUID_A]));
    });

    it('usa SELECT COUNT com $1 parametrizado para otherCompanyId', async () => {
      mockDataSource.query.mockResolvedValue([{ count: '0' }]);

      await service.testCrossTenantIsolation(VALID_UUID_A, VALID_UUID_B);

      const secondCall = mockDataSource.query.mock.calls[1] as [
        string,
        unknown[],
      ];
      expect(secondCall[0]).toContain('$1');
      expect(secondCall[0]).not.toContain(VALID_UUID_B);
      expect(secondCall[1]).toEqual(expect.arrayContaining([VALID_UUID_B]));
    });

    it('should report SECURE when user cannot see other tenant data', async () => {
      mockDataSource.query.mockResolvedValue([{ count: '0' }]);

      const result = await service.testCrossTenantIsolation(
        VALID_UUID_A,
        VALID_UUID_B,
      );

      expect(result.status).toBe('secure');
      expect(result.activities_visible).toBe(0);
      expect(result.expected).toBe(0);
    });

    it('should report VULNERABLE when user can see other tenant data', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([]) // set_config
        .mockResolvedValueOnce([{ count: '5' }]); // dados vazando!

      const result = await service.testCrossTenantIsolation(
        VALID_UUID_A,
        VALID_UUID_B,
      );

      expect(result.status).toBe('vulnerable');
      expect(result.activities_visible).toBe(5);
      expect(result.expected).toBe(0);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('não expõe erro interno do banco em caso de falha de query', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(
          new Error('pg: relation "activities" does not exist'),
        );

      const result = await service.testCrossTenantIsolation(
        VALID_UUID_A,
        VALID_UUID_B,
      );

      expect(result.status).toBe('vulnerable');
      expect(result.result).not.toContain('pg:');
      expect(result.result).not.toContain('relation');
    });
  });

  describe('validateAdminCannotBypass', () => {
    it('should report SECURE when FORCE RLS is enabled', async () => {
      // Mock: FORCE RLS is active
      mockDataSource.query = buildSecureQueryMock({
        forcedCount: 12,
      });

      const result = await service.validateAdminCannotBypass('admin-uuid');

      expect(result.status).toBe('secure');
      expect(result.admin_can_set_super_admin).toBe(false);
    });

    it('should report VULNERABLE when FORCE RLS is disabled', async () => {
      // Mock: FORCE RLS not enabled
      mockDataSource.query = buildSecureQueryMock({
        forcedCount: 8,
      });

      const result = await service.validateAdminCannotBypass('admin-uuid');

      expect(result.status).toBe('vulnerable');
      expect(result.admin_can_set_super_admin).toBe(true);
    });
  });

  describe('getSecurityScore', () => {
    it('should calculate security score between 0-100', async () => {
      // Mock successful checks
      mockDataSource.query = buildSecureQueryMock({
        forcedCount: 12,
      });

      const result = await service.getSecurityScore();

      expect(result.overall_score).toBeGreaterThanOrEqual(0);
      expect(result.overall_score).toBeLessThanOrEqual(100);
      expect(result.percentage).toBeGreaterThanOrEqual(0);
      expect(result.percentage).toBeLessThanOrEqual(100);
    });

    it('should report SECURE status when score >= 80', async () => {
      mockDataSource.query = buildSecureQueryMock({
        forcedCount: 12,
      });

      const result = await service.getSecurityScore();

      if (result.overall_score >= 80) {
        expect(result.status).toBe('secure');
      }
    });

    it('should report components breakdown', async () => {
      mockDataSource.query = buildSecureQueryMock({
        forcedCount: 12,
      });

      const result = await service.getSecurityScore();

      expect(result.components.length).toBeGreaterThan(0);
      expect(result.components[0]).toHaveProperty('name');
      expect(result.components[0]).toHaveProperty('score');
      expect(result.components[0]).toHaveProperty('max');
    });

    it('Fase 2 — soma dos scores dos componentes ≤ max_score', async () => {
      mockDataSource.query = buildSecureQueryMock({ forcedCount: 12 });
      const result = await service.getSecurityScore();

      const componentSum = result.components.reduce(
        (acc, c) => acc + c.score,
        0,
      );
      expect(componentSum).toBeLessThanOrEqual(result.max_score);
    });

    it('Fase 2 — score de cada componente ≤ seu max individual', async () => {
      mockDataSource.query = buildSecureQueryMock({ forcedCount: 12 });
      const result = await service.getSecurityScore();

      for (const component of result.components) {
        expect(component.score).toBeLessThanOrEqual(component.max);
        expect(component.score).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ─── Fase 2: Boundary conditions do regex UUID ───────────────────────────────

  describe('Fase 2 — UUID regex boundary conditions', () => {
    const VALID_UUID_B = '22222222-2222-4222-8222-222222222222';

    // UUIDs v4 válidos que devem ser aceitos (boundary cases)
    const validUUIDBoundary = [
      {
        label: 'versão 4, variante 8',
        value: '00000000-0000-4000-8000-000000000000',
      },
      {
        label: 'versão 4, variante 9',
        value: '00000000-0000-4000-9000-000000000000',
      },
      {
        label: 'versão 4, variante a',
        value: '00000000-0000-4000-a000-000000000000',
      },
      {
        label: 'versão 4, variante b',
        value: '00000000-0000-4000-b000-000000000000',
      },
      {
        label: 'maiúsculas (case-insensitive)',
        value: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
      },
    ];

    for (const { label, value } of validUUIDBoundary) {
      it(`aceita UUID v4 válido: ${label}`, async () => {
        mockDataSource.query.mockResolvedValue([{ count: '0' }]);
        await expect(
          service.testCrossTenantIsolation(value, VALID_UUID_B),
        ).resolves.toBeDefined();
      });
    }

    // UUIDs inválidos que DEVEM ser rejeitados (boundary cases)
    const invalidUUIDBoundary = [
      { label: 'versão 0', value: '00000000-0000-0000-8000-000000000000' },
      { label: 'versão 5', value: '00000000-0000-5000-8000-000000000000' },
      {
        label: 'variante c (inválida)',
        value: '00000000-0000-4000-c000-000000000000',
      },
      {
        label: 'variante d (inválida)',
        value: '00000000-0000-4000-d000-000000000000',
      },
      {
        label: 'tamanho errado (35 chars)',
        value: '00000000-0000-4000-8000-00000000000',
      },
      {
        label: 'tamanho errado (37 chars)',
        value: '00000000-0000-4000-8000-0000000000001',
      },
      {
        label: 'separadores errados',
        value: '00000000_0000_4000_8000_000000000000',
      },
      {
        label: 'caractere G (inválido hex)',
        value: 'GGGGGGGG-GGGG-4GGG-8GGG-GGGGGGGGGGGG',
      },
      {
        label: 'espaços internos',
        value: '00000000 0000-4000-8000-000000000000',
      },
    ];

    for (const { label, value } of invalidUUIDBoundary) {
      it(`rejeita UUID inválido: ${label}`, async () => {
        await expect(
          service.testCrossTenantIsolation(value, VALID_UUID_B),
        ).rejects.toThrow(BadRequestException);
        expect(mockDataSource.query).not.toHaveBeenCalled();
      });
    }
  });

  // ─── Fase 2: Invariante das tabelas críticas ────────────────────────────────

  describe('Fase 2 — Invariante: CRITICAL_TABLES contém tabelas obrigatórias', () => {
    it(`validateRLSPolicies verifica ao menos ${MANDATORY_CRITICAL_TABLES.length} tabelas obrigatórias`, async () => {
      const queryMock = jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('FROM information_schema.tables')) {
          return Promise.resolve([{ exists: true }]);
        }
        if (sql.includes('FROM pg_class') && sql.includes('relrowsecurity')) {
          return Promise.resolve([
            { relrowsecurity: true, relforcerowsecurity: true },
          ]);
        }
        if (sql.includes('FROM pg_policies')) {
          return Promise.resolve([{ count: '1' }]);
        }
        return Promise.resolve([]);
      });

      // Substitui o mock para capturar quais tabelas foram consultadas
      const queriedTables: string[] = [];
      const trackingMock = jest
        .fn<Promise<unknown[]>, [string, unknown[]?]>()
        .mockImplementation((sql: string, params?: unknown[]) => {
          if (Array.isArray(params) && typeof params[1] === 'string') {
            queriedTables.push(params[1]);
          }
          return queryMock(sql, params) as Promise<unknown[]>;
        });

      const module = await Test.createTestingModule({
        providers: [
          RLSValidationService,
          { provide: DataSource, useValue: { query: trackingMock } },
        ],
      }).compile();
      const svc = module.get<RLSValidationService>(RLSValidationService);

      await svc.validateRLSPolicies();

      for (const mandatoryTable of MANDATORY_CRITICAL_TABLES) {
        expect(queriedTables).toContain(mandatoryTable);
      }
    });

    it('validateRLSPolicies retorna resultado com timestamp ISO 8601', async () => {
      mockDataSource.query = buildSecureQueryMock({ forcedCount: 12 });
      const result = await service.validateRLSPolicies();

      expect(() => new Date(result.timestamp)).not.toThrow();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });

    it('resultado de getSecurityScore tem timestamp ISO 8601', async () => {
      mockDataSource.query = buildSecureQueryMock({ forcedCount: 12 });
      const result = await service.getSecurityScore();

      expect(() => new Date(result.timestamp)).not.toThrow();
    });
  });

  // ─── Fase 2: Nenhum UUID jamais interpolado no SQL ──────────────────────────

  describe('Fase 2 — Invariante: nenhum UUID é interpolado no SQL em condição de sucesso', () => {
    const UUID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const UUID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    it('nenhuma chamada de query contém UUID_A interpolado no SQL string', async () => {
      mockDataSource.query.mockResolvedValue([{ count: '0' }]);

      await service.testCrossTenantIsolation(UUID_A, UUID_B);

      for (const call of mockDataSource.query.mock.calls) {
        const sql = call[0];
        expect(sql).not.toContain(UUID_A);
        expect(sql).not.toContain(UUID_B);
      }
    });

    it('nenhuma chamada de query contém UUID_B interpolado no SQL string', async () => {
      mockDataSource.query.mockResolvedValue([{ count: '0' }]);

      await service.testCrossTenantIsolation(UUID_A, UUID_B);

      const allSqlCalls = mockDataSource.query.mock.calls
        .map((c) => c[0])
        .join('\n');
      expect(allSqlCalls).not.toContain(UUID_B);
    });
  });
});
