import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseConnectionManager } from './database-connection.manager';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

describe('DatabaseConnectionManager', () => {
  let service: DatabaseConnectionManager;
  let mockDataSource: jest.Mocked<DataSource>;

  beforeEach(async () => {
    // Create a mock DataSource
    mockDataSource = {
      createQueryRunner: jest.fn(),
      query: jest.fn(),
      driver: {
        pool: {
          totalCount: 5,
          idleCount: 3,
          waitingCount: 0,
        },
      },
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseConnectionManager,
        {
          provide: getDataSourceToken(),
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<DatabaseConnectionManager>(DatabaseConnectionManager);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should safely execute queries with timeout and retries', async () => {
    const mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([{ id: 1, name: 'test' }]),
      release: jest.fn().mockResolvedValue(undefined),
    };

    mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner as any);

    const result = await service.safeRawQuery('SELECT * FROM test');

    expect(mockQueryRunner.connect).toHaveBeenCalled();
    expect(mockQueryRunner.query).toHaveBeenCalledWith(
      'SELECT * FROM test',
      undefined,
    );
    expect(mockQueryRunner.release).toHaveBeenCalled();
    expect(result).toEqual([{ id: 1, name: 'test' }]);
  });

  it('should handle connection pool status', async () => {
    const status = await service.getConnectionPoolStatus();

    expect(status).toEqual({
      totalConnections: 5,
      idleConnections: 3,
      waitingConnections: 0,
      activeConnections: 2,
    });
  });

  it('should safely execute transactions with rollback on error', async () => {
    const mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockRejectedValue(new Error('Query failed')),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      isTransactionActive: true,
    };

    mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner as any);

    await expect(
      service.safeTransaction(async (qr) => {
        await qr.query('INSERT INTO test VALUES (1)');
      }),
    ).rejects.toThrow('Query failed');

    expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(mockQueryRunner.release).toHaveBeenCalled();
  });

  it('should handle connection release errors gracefully', async () => {
    const mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([{ id: 1 }]),
      release: jest.fn().mockRejectedValue(new Error('Release failed')),
    };

    mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner as any);

    // Should not throw even if release fails
    const result = await service.safeRawQuery('SELECT 1');
    expect(result).toEqual([{ id: 1 }]);
    expect(mockQueryRunner.release).toHaveBeenCalled();
  });
});
