import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, QueryRunner } from 'typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';
import { N1QueryDetectorService } from './n1-query-detector.service';

describe('N1QueryDetectorService', () => {
    let service: N1QueryDetectorService;
    let mockConfigService: jest.Mocked<ConfigService>;
    let mockDataSource: jest.Mocked<DataSource>;
    let mockQueryRunner: jest.Mocked<QueryRunner>;

    beforeEach(async () => {
        mockConfigService = {
            get: jest.fn((key: string, defaultValue?: any) => {
                const config = {
                    N1_QUERY_DETECTION_ENABLED: true,
                    N1_QUERY_THRESHOLD: 5,
                    N1_SLOW_QUERY_THRESHOLD: 100,
                    N1_MAX_QUERIES_IN_MEMORY: 1000,
                    NODE_ENV: 'test',
                };
                return config[key] ?? defaultValue;
            }),
        } as any;

        mockQueryRunner = {
            query: jest.fn(),
            release: jest.fn().mockResolvedValue(undefined),
        } as any;

        mockDataSource = {
            createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
        } as any;

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                N1QueryDetectorService,
                {
                    provide: ConfigService,
                    useValue: mockConfigService,
                },
                {
                    provide: getDataSourceToken(),
                    useValue: mockDataSource,
                },
            ],
        }).compile();

        service = module.get<N1QueryDetectorService>(N1QueryDetectorService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Service Initialization', () => {
        it('should be defined', () => {
            expect(service).toBeDefined();
        });

        it('should setup QueryRunner listener when enabled', async () => {
            const logSpy = jest.spyOn(Logger.prototype, 'log');

            await service.onModuleInit();

            expect(mockDataSource.createQueryRunner).toHaveBeenCalled();
            expect(logSpy).toHaveBeenCalledWith('N+1 Query Detection: ENABLED');

            logSpy.mockRestore();
        });

        it('should NOT setup when disabled', async () => {
            mockConfigService.get.mockImplementation((key: string) => {
                if (key === 'N1_QUERY_DETECTION_ENABLED') return false;
                return true;
            });

            const disabledService = new N1QueryDetectorService(mockConfigService, mockDataSource);
            const logSpy = jest.spyOn(Logger.prototype, 'log');

            await disabledService.onModuleInit();

            expect(logSpy).toHaveBeenCalledWith('N+1 Query Detection: DISABLED');
            expect(mockDataSource.createQueryRunner).not.toHaveBeenCalled();

            logSpy.mockRestore();
        });
    });

    describe('Query Logging', () => {
        beforeEach(async () => {
            await service.onModuleInit();
        });

        it('should log normal queries', () => {
            service.logQuery('SELECT * FROM users WHERE id = 1', [], 50);

            const analysis = service.analyzeQueries();
            expect(analysis.totalQueries).toBe(1);
            expect(analysis.uniquePatterns).toBe(1);
        });

        it('should detect N+1 patterns', () => {
            const query = 'SELECT * FROM users WHERE id = 1';

            // Log query 6 times (above threshold of 5)
            for (let i = 0; i < 6; i++) {
                service.logQuery(query, [], 50);
            }

            const analysis = service.analyzeQueries();
            expect(analysis.suspects.length).toBeGreaterThan(0);
            expect(analysis.suspects[0].count).toBe(6);
        });

        it('should track execution time', () => {
            // Log enough queries to trigger suspect detection
            for (let i = 0; i < 6; i++) {
                service.logQuery('SELECT * FROM users WHERE id = 1', [], 50);
            }
            service.logQuery('SELECT * FROM users WHERE id = 1', [], 30);

            const analysis = service.analyzeQueries();
            expect(analysis.suspects[0].avgTime).toBeCloseTo(47, 0); // Approximate average
        });
    });

    describe('Alerting', () => {
        beforeEach(async () => {
            await service.onModuleInit();
        });

        it('should warn on N+1 detection', () => {
            const warnSpy = jest.spyOn(Logger.prototype, 'warn');
            const query = 'SELECT * FROM users WHERE id = 1';

            for (let i = 0; i < 6; i++) {
                service.logQuery(query, [], 50);
            }

            expect(warnSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'n1_query_detected',
                }),
            );

            warnSpy.mockRestore();
        });

        it('should warn on slow queries', () => {
            const warnSpy = jest.spyOn(Logger.prototype, 'warn');

            service.logQuery('SELECT * FROM users', [], 150); // Above 100ms threshold

            expect(warnSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'slow_query_detected',
                }),
            );

            warnSpy.mockRestore();
        });
    });

    describe('Reporting', () => {
        beforeEach(async () => {
            await service.onModuleInit();
        });

        it('should generate structured report', () => {
            service.logQuery('SELECT * FROM users WHERE id = 1', [], 50);

            const analysis = service.analyzeQueries();

            expect(analysis).toHaveProperty('totalQueries');
            expect(analysis).toHaveProperty('uniquePatterns');
            expect(analysis).toHaveProperty('suspects');
            expect(analysis).toHaveProperty('slowQueries');
            expect(analysis).toHaveProperty('errorQueries');
            expect(analysis).toHaveProperty('timestamp');
        });

        it('should export JSON report', () => {
            service.logQuery('SELECT * FROM users', [], 50);

            const jsonReport = service.exportReport();

            expect(typeof jsonReport).toBe('string');
            const parsed = JSON.parse(jsonReport);
            expect(parsed).toHaveProperty('totalQueries');
        });
    });

    describe('Memory Management', () => {
        beforeEach(async () => {
            await service.onModuleInit();
        });

        it('should limit queries in memory', () => {
            const maxQueries = 1000;
            const excessQueries = maxQueries + 100;

            for (let i = 0; i < excessQueries; i++) {
                service.logQuery(`SELECT * FROM table${i % 10}`, [], 50);
            }

            const analysis = service.analyzeQueries();
            expect(analysis.totalQueries).toBeLessThanOrEqual(maxQueries);
        });
    });

    describe('Cleanup', () => {
        beforeEach(async () => {
            await service.onModuleInit();
        });

        it('should reset logs', () => {
            service.logQuery('SELECT * FROM users', [], 50);

            let analysis = service.analyzeQueries();
            expect(analysis.totalQueries).toBe(1);

            service.reset();

            analysis = service.analyzeQueries();
            expect(analysis.totalQueries).toBe(0);
        });

        it('should cleanup QueryRunner', async () => {
            const releaseSpy = jest.spyOn(mockQueryRunner, 'release');

            await service.onModuleDestroy();

            expect(releaseSpy).toHaveBeenCalled();
        });
    });
});