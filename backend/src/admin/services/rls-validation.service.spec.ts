import { Test, TestingModule } from '@nestjs/testing';
import { RLSValidationService } from '../services/rls-validation.service';
import { DataSource } from 'typeorm';

/**
 * 🔒 RLS Validation Tests
 * Validates Row Level Security policies and cross-tenant isolation
 */

describe('RLSValidationService', () => {
    let service: RLSValidationService;
    let mockDataSource: jest.Mocked<DataSource>;

    const buildSecureQueryMock = (
        overrides?: Partial<{
            missingTables: string[];
            tablesWithoutForce: string[];
            tablesWithoutPolicies: string[];
            forcedCount: number;
        }>,
    ) => {
        const missingTables = new Set(overrides?.missingTables || []);
        const tablesWithoutForce = new Set(overrides?.tablesWithoutForce || []);
        const tablesWithoutPolicies = new Set(overrides?.tablesWithoutPolicies || []);
        const forcedCount = overrides?.forcedCount ?? 10;

        return jest.fn().mockImplementation((sql: string, params?: unknown[]) => {
            const table = Array.isArray(params) ? String(params[1] || '') : '';

            if (sql.includes('FROM information_schema.tables')) {
                return Promise.resolve(missingTables.has(table) ? [] : [{ exists: true }]);
            }

            if (sql.includes('FROM pg_class c') && sql.includes('c.relrowsecurity')) {
                return Promise.resolve([
                    {
                        relrowsecurity: !missingTables.has(table),
                        relforcerowsecurity:
                            !missingTables.has(table) &&
                            !tablesWithoutForce.has(table),
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
            query: jest.fn(),
        } as any;

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
            mockDataSource.query = buildSecureQueryMock() as any;

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
            }) as any;

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
            expect(
                result.critical_tables.some((t) => t.status === 'fail'),
            ).toBe(true);
        });
    });

    describe('testCrossTenantIsolation', () => {
        it('should report SECURE when user cannot see other tenant data', async () => {
            // Mock: User from Company A queries Company B data → 0 results (correct)
            mockDataSource.query.mockResolvedValue([{ count: 0 }]); // No cross-tenant visibility

            const result = await service.testCrossTenantIsolation(
                'company-a-uuid',
                'company-b-uuid',
            );

            expect(result.status).toBe('secure');
            expect(result.activities_visible).toBe(0);
            expect(result.expected).toBe(0);
        });

        it('should report VULNERABLE when user can see other tenant data', async () => {
            // Mock: User from Company A can see Company B data (RLS broken!)
            mockDataSource.query.mockResolvedValue([{ count: 5 }]); // 5 records leaked!

            const result = await service.testCrossTenantIsolation(
                'company-a-uuid',
                'company-b-uuid',
            );

            expect(result.status).toBe('vulnerable');
            expect(result.activities_visible).toBe(5);
            expect(result.expected).toBe(0);
            expect(result.recommendations.length).toBeGreaterThan(0);
        });
    });

    describe('validateAdminCannotBypass', () => {
        it('should report SECURE when FORCE RLS is enabled', async () => {
            // Mock: FORCE RLS is active
            mockDataSource.query = buildSecureQueryMock({
                forcedCount: 10,
            }) as any;

            const result = await service.validateAdminCannotBypass('admin-uuid');

            expect(result.status).toBe('secure');
            expect(result.admin_can_set_super_admin).toBe(false);
        });

        it('should report VULNERABLE when FORCE RLS is disabled', async () => {
            // Mock: FORCE RLS not enabled
            mockDataSource.query = buildSecureQueryMock({
                forcedCount: 8,
            }) as any;

            const result = await service.validateAdminCannotBypass('admin-uuid');

            expect(result.status).toBe('vulnerable');
            expect(result.admin_can_set_super_admin).toBe(true);
        });
    });

    describe('getSecurityScore', () => {
        it('should calculate security score between 0-100', async () => {
            // Mock successful checks
            mockDataSource.query = buildSecureQueryMock({
                forcedCount: 10,
            }) as any;

            const result = await service.getSecurityScore();

            expect(result.overall_score).toBeGreaterThanOrEqual(0);
            expect(result.overall_score).toBeLessThanOrEqual(100);
            expect(result.percentage).toBeGreaterThanOrEqual(0);
            expect(result.percentage).toBeLessThanOrEqual(100);
        });

        it('should report SECURE status when score >= 80', async () => {
            mockDataSource.query = buildSecureQueryMock({
                forcedCount: 10,
            }) as any;

            const result = await service.getSecurityScore();

            if (result.overall_score >= 80) {
                expect(result.status).toBe('secure');
            }
        });

        it('should report components breakdown', async () => {
            mockDataSource.query = buildSecureQueryMock({
                forcedCount: 10,
            }) as any;

            const result = await service.getSecurityScore();

            expect(result.components.length).toBeGreaterThan(0);
            expect(result.components[0]).toHaveProperty('name');
            expect(result.components[0]).toHaveProperty('score');
            expect(result.components[0]).toHaveProperty('max');
        });
    });
});
