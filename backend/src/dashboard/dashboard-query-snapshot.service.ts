import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DASHBOARD_CACHE_STALE_WINDOW_MS,
  DASHBOARD_CACHE_TTL_MS,
  DASHBOARD_SNAPSHOT_SCHEMA_VERSION,
  DashboardQueryType,
} from './dashboard-query.types';
import { DashboardQuerySnapshot } from './entities/dashboard-query-snapshot.entity';

type SnapshotReadResult<T> = {
  hit: boolean;
  stale: boolean;
  value?: T;
  generatedAt?: number;
};

@Injectable()
export class DashboardQuerySnapshotService {
  constructor(
    @InjectRepository(DashboardQuerySnapshot)
    private readonly snapshotsRepository: Repository<DashboardQuerySnapshot>,
  ) {}

  async read<T extends Record<string, unknown>>(
    companyId: string,
    queryType: DashboardQueryType,
  ): Promise<SnapshotReadResult<T>> {
    const record = await this.snapshotsRepository.findOne({
      where: {
        company_id: companyId,
        query_type: queryType,
      },
    });

    if (!record) {
      return { hit: false, stale: false };
    }

    const generatedAt = new Date(record.generated_at).getTime();
    const now = Date.now();
    const freshUntil = generatedAt + DASHBOARD_CACHE_TTL_MS;
    const staleUntil = Math.max(
      freshUntil,
      new Date(record.expires_at).getTime(),
    );

    if (now <= freshUntil) {
      return {
        hit: true,
        stale: false,
        value: record.payload as T,
        generatedAt,
      };
    }

    if (now <= staleUntil) {
      return {
        hit: false,
        stale: true,
        value: record.payload as T,
        generatedAt,
      };
    }

    return {
      hit: false,
      stale: false,
    };
  }

  async upsert<T extends Record<string, unknown>>(
    companyId: string,
    queryType: DashboardQueryType,
    value: T,
    generatedAt = new Date(),
  ): Promise<void> {
    const generatedAtDate = new Date(generatedAt);
    const staleUntil = new Date(
      generatedAtDate.getTime() +
        DASHBOARD_CACHE_TTL_MS +
        DASHBOARD_CACHE_STALE_WINDOW_MS,
    );
    const snapshotInput = {
      company_id: companyId,
      query_type: queryType,
      payload: value,
      schema_version: DASHBOARD_SNAPSHOT_SCHEMA_VERSION,
      generated_at: generatedAtDate,
      expires_at: staleUntil,
      last_error: null,
    } as Parameters<Repository<DashboardQuerySnapshot>['upsert']>[0];

    await this.snapshotsRepository.upsert(snapshotInput, [
      'company_id',
      'query_type',
    ]);
  }

  async recordFailure(
    companyId: string,
    queryType: DashboardQueryType,
    errorMessage: string,
  ): Promise<void> {
    await this.snapshotsRepository
      .createQueryBuilder()
      .update(DashboardQuerySnapshot)
      .set({
        last_error: errorMessage,
      })
      .where('company_id = :companyId', { companyId })
      .andWhere('query_type = :queryType', { queryType })
      .execute();
  }

  async invalidate(
    companyId: string,
    queryType?: DashboardQueryType,
  ): Promise<void> {
    const where = queryType
      ? {
          company_id: companyId,
          query_type: queryType,
        }
      : {
          company_id: companyId,
        };

    await this.snapshotsRepository.delete(where);
  }
}
