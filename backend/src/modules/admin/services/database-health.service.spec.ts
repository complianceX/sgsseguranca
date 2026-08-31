import { ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PrivilegedDbService } from '../../../shared/database/privileged-db.service';
import { DatabaseHealthService } from './database-health.service';

type QueryClient = {
  query: jest.Mock;
};

type SlowQueryCheck = {
  name: string;
  status: 'pass' | 'warning' | 'fail';
  message: string;
  metrics?: { slow_query_count: number };
};

function callSlowQueryCheck(
  service: DatabaseHealthService,
): Promise<SlowQueryCheck> {
  return (
    service as unknown as {
      checkSlowQueries: () => Promise<SlowQueryCheck>;
    }
  ).checkSlowQueries();
}

describe('DatabaseHealthService slow-query observability', () => {
  it('usa exclusivamente o client privilegiado para pg_stat_statements', async () => {
    const dataSource = { query: jest.fn() };
    const client: QueryClient = { query: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [{ libraries: 'pg_stat_statements' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });
    const privilegedDb = {
      withRequiredPrivilegedClient: jest.fn(
        async (
          _operation: string,
          callback: (queryClient: QueryClient) => Promise<SlowQueryCheck>,
        ) => callback(client),
      ),
    };
    const service = new DatabaseHealthService(
      dataSource as unknown as DataSource,
      privilegedDb as unknown as PrivilegedDbService,
    );

    await expect(callSlowQueryCheck(service)).resolves.toMatchObject({
      name: 'Slow Query Detection',
      status: 'pass',
      metrics: { slow_query_count: 0 },
    });
    expect(client.query).toHaveBeenCalledTimes(2);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('não cai para a conexão de runtime quando o client privilegiado falta', async () => {
    const dataSource = { query: jest.fn() };
    const privilegedDb = {
      withRequiredPrivilegedClient: jest
        .fn()
        .mockRejectedValue(
          new ServiceUnavailableException(
            'conexão privilegiada não configurada',
          ),
        ),
    };
    const service = new DatabaseHealthService(
      dataSource as unknown as DataSource,
      privilegedDb as unknown as PrivilegedDbService,
    );

    await expect(callSlowQueryCheck(service)).resolves.toMatchObject({
      name: 'Slow Query Detection',
      status: 'warning',
    });
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('retorna warning sem consultar a view quando a extensão não está carregada', async () => {
    const dataSource = { query: jest.fn() };
    const client: QueryClient = { query: jest.fn() };
    client.query.mockResolvedValueOnce({ rows: [{ libraries: '' }] });
    const privilegedDb = {
      withRequiredPrivilegedClient: jest.fn(
        async (
          _operation: string,
          callback: (queryClient: QueryClient) => Promise<SlowQueryCheck>,
        ) => callback(client),
      ),
    };
    const service = new DatabaseHealthService(
      dataSource as unknown as DataSource,
      privilegedDb as unknown as PrivilegedDbService,
    );

    const result = await callSlowQueryCheck(service);
    expect(result.name).toBe('Slow Query Detection');
    expect(result.status).toBe('warning');
    expect(result.message).toContain('pg_stat_statements');
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(dataSource.query).not.toHaveBeenCalled();
  });
});
