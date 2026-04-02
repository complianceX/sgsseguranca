import { Test, TestingModule } from '@nestjs/testing';
import { GDPRDeletionService } from '../services/gdpr-deletion.service';
import { DataSource } from 'typeorm';
import { BadRequestException } from '@nestjs/common';

/**
 * ⚖️ GDPR Deletion Service Tests
 * Validates data deletion for GDPR/LGPD compliance
 */

describe('GDPRDeletionService', () => {
    let service: GDPRDeletionService;
    let mockDataSource: jest.Mocked<DataSource>;

    beforeEach(async () => {
        mockDataSource = {
            query: jest.fn(),
        } as any;

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                GDPRDeletionService,
                {
                    provide: DataSource,
                    useValue: mockDataSource,
                },
            ],
        }).compile();

        service = module.get<GDPRDeletionService>(GDPRDeletionService);
    });

    describe('deleteUserData', () => {
        const validUserId = '550e8400-e29b-41d4-a716-446655440000';

        it('should successfully anonymize user data', async () => {
            // Mock: GDPR function returns row counts
            mockDataSource.query.mockResolvedValue([
                { table_name: 'activities', deleted_count: '5' },
                { table_name: 'audit_logs', deleted_count: '10' },
                { table_name: 'user_sessions', deleted_count: '2' },
            ]);

            const result = await service.deleteUserData(validUserId);

            expect(result.status).toBe('completed');
            expect(result.user_id).toBe(validUserId);
            expect(result.tables_processed.length).toBe(3);
            expect(result.tables_processed[0].rows_deleted).toBe(5);
        });

        it('should return request ID for tracking', async () => {
            mockDataSource.query.mockResolvedValue([]);

            const result = await service.deleteUserData(validUserId);

            expect(result.id).toBeDefined();
            expect(result.id.length).toBeGreaterThan(0);
            // Should be valid UUID
            expect(result.id).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
            );
        });

        it('should reject invalid user ID format', async () => {
            const invalidId = 'not-a-uuid';

            await expect(service.deleteUserData(invalidId)).rejects.toThrow(
                BadRequestException,
            );
        });

        it('should handle database errors and report status', async () => {
            mockDataSource.query.mockRejectedValue(
                new Error('Database connection failed'),
            );

            const result = await service.deleteUserData(validUserId);

            expect(result.status).toBe('failed');
            expect(result.error_message).toContain('Database connection failed');
        });
    });

    describe('deleteExpiredData', () => {
        it('should execute TTL cleanup successfully', async () => {
            mockDataSource.query.mockResolvedValue([
                { table_name: 'mail_logs', deleted_count: '100' },
                { table_name: 'user_sessions', deleted_count: '25' },
                { table_name: 'forensic_trail_events', deleted_count: '5' },
                { table_name: 'activities', deleted_count: '10' },
                { table_name: 'audit_logs', deleted_count: '8' },
            ]);

            const result = await service.deleteExpiredData();

            expect(result.status).toBe('success');
            expect(result.total_rows_deleted).toBe(148);
            expect(result.tables_cleaned.length).toBe(5);
        });

        it('should report table-specific cleanup counts', async () => {
            mockDataSource.query.mockResolvedValue([
                { table_name: 'mail_logs', deleted_count: '100' },
            ]);

            const result = await service.deleteExpiredData();

            expect(result.tables_cleaned[0].table).toBe('mail_logs');
            expect(result.tables_cleaned[0].rows_deleted).toBe(100);
        });

        it('should include execution duration', async () => {
            mockDataSource.query.mockResolvedValue([]);

            const beforeTime = Date.now();
            const result = await service.deleteExpiredData();
            const afterTime = Date.now();

            expect(result.duration_ms).toBeGreaterThanOrEqual(0);
            expect(result.duration_ms).toBeLessThanOrEqual(afterTime - beforeTime + 100);
        });

        it('should handle errors gracefully', async () => {
            mockDataSource.query.mockRejectedValue(
                new Error('TTL function not found'),
            );

            const result = await service.deleteExpiredData();

            expect(result.status).toBe('error');
        });
    });

    describe('deleteCompanyData', () => {
        const validCompanyId = '550e8400-e29b-41d4-a716-446655440000';

        it('should soft-delete all company data', async () => {
            mockDataSource.query.mockResolvedValue([1, 2, 3]); // Updated rows for each table

            const result = await service.deleteCompanyData(validCompanyId);

            expect(result.status).toBe('success');
            expect(result.company_id).toBe(validCompanyId);
            expect(result.total_rows_deleted).toBeGreaterThan(0);
        });

        it('should reject invalid company ID', async () => {
            await expect(
                service.deleteCompanyData('invalid-uuid'),
            ).rejects.toThrow(BadRequestException);
        });

        it('should warn about enterprise operation', async () => {
            mockDataSource.query.mockResolvedValue([]);

            const result = await service.deleteCompanyData(validCompanyId);

            expect(result.warning).toContain('soft-deleted');
            expect(result.warning).toContain('retention policy');
        });
    });

    describe('getDeleteRequestStatus', () => {
        it('should return status of completed request', async () => {
            const userId = '550e8400-e29b-41d4-a716-446655440000';
            mockDataSource.query.mockResolvedValue([]);

            // First, create a deletion request
            const created = await service.deleteUserData(userId);
            const requestId = created.id;

            // Then query its status
            const status = service.getDeleteRequestStatus(requestId);

            expect(status).toBeDefined();
            expect(status?.status).toBe('completed');
        });

        it('should return null for non-existent request', async () => {
            const fakeRequestId = 'non-existent-id';

            const status = service.getDeleteRequestStatus(fakeRequestId);

            expect(status).toBeNull();
        });
    });

    describe('getPendingRequests', () => {
        it('should return all pending deletion requests', async () => {
            mockDataSource.query.mockResolvedValue([]);

            const pending = service.getPendingRequests();

            expect(Array.isArray(pending)).toBe(true);
        });
    });

    describe('validateUserConsent', () => {
        it('should check ai_processing_consent flag', async () => {
            const userId = '550e8400-e29b-41d4-a716-446655440000';

            // User with consent
            mockDataSource.query.mockResolvedValue([
                { ai_processing_consent: true },
            ]);

            const result = await service.validateUserConsent(userId);

            expect(result.can_delete).toBe(true);
        });

        it('should return null for non-existent user', async () => {
            mockDataSource.query.mockResolvedValue([]);

            const result = await service.validateUserConsent('any-uuid');

            expect(result.can_delete).toBe(false);
        });
    });
});
