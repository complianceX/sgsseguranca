import { Injectable } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Apr } from '../../aprs/entities/apr.entity';
import { Dds } from '../../dds/entities/dds.entity';
import { Pt } from '../../pts/entities/pt.entity';
import { Training } from '../../trainings/entities/training.entity';
import { MedicalExam } from '../../medical-exams/entities/medical-exam.entity';
import { Cat } from '../../cats/entities/cat.entity';
import { AiInteraction } from '../../ai/entities/ai-interaction.entity';
import {
  BusinessHealthGaugeSnapshot,
  BusinessMetricsRefreshService,
} from './business-metrics-refresh.service';

type CountByCompanyRow = {
  company_id: string;
  total: string;
};

type CountByCompanyAndLabelRow = {
  company_id: string;
  label: string | null;
  total: string;
};

type AiRawRow = {
  company_id: string | null;
  model: string | null;
  tools_called: unknown;
  tokens_used: string | number | null;
  latency_ms: string | number | null;
};

type CompanyMap = Map<string, Record<string, number>>;

@Injectable()
export class BusinessMetricsSummaryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly businessMetricsRefreshService: BusinessMetricsRefreshService,
  ) {}

  async getBusinessSummaryByTenant(): Promise<{
    generatedAt: string;
    tenants: Array<{
      companyId: string;
      activity: {
        aprsCreatedByStatus: Record<string, number>;
        ddsCreatedTotal: number;
        ptsCreatedTotal: number;
        trainingsRegisteredByNr: Record<string, number>;
        medicalExamsRegisteredByType: Record<string, number>;
        catsReportedBySeverity: Record<string, number>;
        aiInteractionsByTool: Record<string, number>;
      };
      operationalHealth: {
        examsOverdueCount: number;
        trainingsOverdueCount: number;
        aprsPendingReviewCount: number;
        activeUsersCount: number;
      };
      aiPerformance: {
        tokensUsedByModel: Record<string, number>;
        avgResponseTimeSecondsByModelTool: Record<string, number>;
      };
    }>;
  }> {
    const [
      gaugeSnapshot,
      activeCompanies,
      aprByStatus,
      ddsTotals,
      ptsTotals,
      trainingsByNr,
      examsByType,
      catsBySeverity,
      aiStats,
    ] = await Promise.all([
      this.businessMetricsRefreshService.refreshTenantHealthGauges(),
      this.listActiveCompanyIds(),
      this.loadAprByStatus(),
      this.loadSimpleTotalsByCompany(Dds, 'dds', true),
      this.loadSimpleTotalsByCompany(Pt, 'pt', true),
      this.loadTrainingsByNr(),
      this.loadMedicalExamsByType(),
      this.loadCatsBySeverity(),
      this.loadAiStats(),
    ]);

    const healthByCompany = new Map(
      gaugeSnapshot.snapshot.map((item) => [item.companyId, item]),
    );
    const companyIds = this.buildCompanyScope({
      activeCompanies,
      healthSnapshot: gaugeSnapshot.snapshot,
      aprByStatus,
      ddsTotals,
      ptsTotals,
      trainingsByNr,
      examsByType,
      catsBySeverity,
      aiStats,
    });

    const tenants = companyIds.map((companyId) => {
      const health = healthByCompany.get(companyId);

      return {
        companyId,
        activity: {
          aprsCreatedByStatus: aprByStatus.get(companyId) || {},
          ddsCreatedTotal: ddsTotals.get(companyId) || 0,
          ptsCreatedTotal: ptsTotals.get(companyId) || 0,
          trainingsRegisteredByNr: trainingsByNr.get(companyId) || {},
          medicalExamsRegisteredByType: examsByType.get(companyId) || {},
          catsReportedBySeverity: catsBySeverity.get(companyId) || {},
          aiInteractionsByTool: aiStats.interactionsByTool.get(companyId) || {},
        },
        operationalHealth: {
          examsOverdueCount: health?.examsOverdueCount || 0,
          trainingsOverdueCount: health?.trainingsOverdueCount || 0,
          aprsPendingReviewCount: health?.aprsPendingReviewCount || 0,
          activeUsersCount: health?.activeUsersCount || 0,
        },
        aiPerformance: {
          tokensUsedByModel: aiStats.tokensByModel.get(companyId) || {},
          avgResponseTimeSecondsByModelTool:
            aiStats.avgLatencySecondsByModelTool.get(companyId) || {},
        },
      };
    });

    return {
      generatedAt: gaugeSnapshot.updatedAt,
      tenants,
    };
  }

  private buildCompanyScope(input: {
    activeCompanies: string[];
    healthSnapshot: BusinessHealthGaugeSnapshot[];
    aprByStatus: CompanyMap;
    ddsTotals: Map<string, number>;
    ptsTotals: Map<string, number>;
    trainingsByNr: CompanyMap;
    examsByType: CompanyMap;
    catsBySeverity: CompanyMap;
    aiStats: {
      interactionsByTool: CompanyMap;
      tokensByModel: CompanyMap;
      avgLatencySecondsByModelTool: CompanyMap;
    };
  }): string[] {
    const ids = new Set<string>(input.activeCompanies);

    input.healthSnapshot.forEach((item) => ids.add(item.companyId));
    input.aprByStatus.forEach((_value, key) => ids.add(key));
    input.ddsTotals.forEach((_value, key) => ids.add(key));
    input.ptsTotals.forEach((_value, key) => ids.add(key));
    input.trainingsByNr.forEach((_value, key) => ids.add(key));
    input.examsByType.forEach((_value, key) => ids.add(key));
    input.catsBySeverity.forEach((_value, key) => ids.add(key));
    input.aiStats.interactionsByTool.forEach((_value, key) => ids.add(key));
    input.aiStats.tokensByModel.forEach((_value, key) => ids.add(key));
    input.aiStats.avgLatencySecondsByModelTool.forEach((_value, key) =>
      ids.add(key),
    );

    return Array.from(ids).sort((a, b) => a.localeCompare(b));
  }

  private async listActiveCompanyIds(): Promise<string[]> {
    const companies = await this.dataSource.getRepository(Company).find({
      where: {
        status: true,
        deletedAt: IsNull(),
      },
      select: ['id'],
    });

    return companies.map((company) => company.id);
  }

  private async loadAprByStatus(): Promise<CompanyMap> {
    const rows = await this.dataSource
      .getRepository(Apr)
      .createQueryBuilder('apr')
      .select('apr.company_id', 'company_id')
      .addSelect('apr.status', 'label')
      .addSelect('COUNT(*)', 'total')
      .where('apr.deleted_at IS NULL')
      .groupBy('apr.company_id')
      .addGroupBy('apr.status')
      .getRawMany<CountByCompanyAndLabelRow>();

    return this.toNestedCountMap(rows);
  }

  private async loadSimpleTotalsByCompany(
    entity: { new (): Dds | Pt },
    alias: string,
    hasSoftDelete: boolean,
  ): Promise<Map<string, number>> {
    const query = this.dataSource
      .getRepository(entity)
      .createQueryBuilder(alias)
      .select(`${alias}.company_id`, 'company_id')
      .addSelect('COUNT(*)', 'total')
      .groupBy(`${alias}.company_id`);

    if (hasSoftDelete) {
      query.where(`${alias}.deleted_at IS NULL`);
    }

    const rows = await query.getRawMany<CountByCompanyRow>();
    return this.toCountMap(rows);
  }

  private async loadTrainingsByNr(): Promise<CompanyMap> {
    const rows = await this.dataSource
      .getRepository(Training)
      .createQueryBuilder('training')
      .select('training.company_id', 'company_id')
      .addSelect('COALESCE(training.nr_codigo, training.nome)', 'label')
      .addSelect('COUNT(*)', 'total')
      .groupBy('training.company_id')
      .addGroupBy('COALESCE(training.nr_codigo, training.nome)')
      .getRawMany<CountByCompanyAndLabelRow>();

    return this.toNestedCountMap(rows, 'unknown');
  }

  private async loadMedicalExamsByType(): Promise<CompanyMap> {
    const rows = await this.dataSource
      .getRepository(MedicalExam)
      .createQueryBuilder('exam')
      .select('exam.company_id', 'company_id')
      .addSelect('exam.tipo_exame', 'label')
      .addSelect('COUNT(*)', 'total')
      .groupBy('exam.company_id')
      .addGroupBy('exam.tipo_exame')
      .getRawMany<CountByCompanyAndLabelRow>();

    return this.toNestedCountMap(rows, 'unknown');
  }

  private async loadCatsBySeverity(): Promise<CompanyMap> {
    const rows = await this.dataSource
      .getRepository(Cat)
      .createQueryBuilder('cat')
      .select('cat.company_id', 'company_id')
      .addSelect('cat.gravidade', 'label')
      .addSelect('COUNT(*)', 'total')
      .groupBy('cat.company_id')
      .addGroupBy('cat.gravidade')
      .getRawMany<CountByCompanyAndLabelRow>();

    return this.toNestedCountMap(rows, 'unknown');
  }

  private async loadAiStats(): Promise<{
    interactionsByTool: CompanyMap;
    tokensByModel: CompanyMap;
    avgLatencySecondsByModelTool: CompanyMap;
  }> {
    const rows = await this.dataSource
      .getRepository(AiInteraction)
      .createQueryBuilder('ai')
      .select('ai.tenant_id', 'company_id')
      .addSelect('ai.model', 'model')
      .addSelect('ai.tools_called', 'tools_called')
      .addSelect('ai.tokens_used', 'tokens_used')
      .addSelect('ai.latency_ms', 'latency_ms')
      .getRawMany<AiRawRow>();

    const interactionsByTool: CompanyMap = new Map();
    const tokensByModel: CompanyMap = new Map();
    const latencyAccumulator = new Map<
      string,
      Map<string, { sumSeconds: number; count: number }>
    >();

    rows.forEach((row) => {
      const companyId = this.normalizeGroupKey(row.company_id, 'unknown');
      const model = this.normalizeGroupKey(row.model, 'unknown');
      const tools = this.parseTools(row.tools_called);
      const tokens = this.parseNumber(row.tokens_used);
      const latencySeconds =
        Math.max(0, this.parseNumber(row.latency_ms)) / 1000;

      this.addNestedCounter(tokensByModel, companyId, model, tokens);

      tools.forEach((tool) => {
        this.addNestedCounter(interactionsByTool, companyId, tool, 1);
        this.addLatency(
          latencyAccumulator,
          companyId,
          `${model}:${tool}`,
          latencySeconds,
        );
      });
    });

    const avgLatencySecondsByModelTool: CompanyMap = new Map();
    latencyAccumulator.forEach((toolMap, companyId) => {
      toolMap.forEach((value, modelToolKey) => {
        const average = value.count > 0 ? value.sumSeconds / value.count : 0;
        this.addNestedCounter(
          avgLatencySecondsByModelTool,
          companyId,
          modelToolKey,
          Number(average.toFixed(4)),
        );
      });
    });

    return {
      interactionsByTool,
      tokensByModel,
      avgLatencySecondsByModelTool,
    };
  }

  private parseTools(raw: unknown): string[] {
    if (!raw) {
      return ['none'];
    }

    if (Array.isArray(raw)) {
      return this.normalizeTools(raw);
    }

    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          return this.normalizeTools(parsed);
        }
      } catch {
        return ['none'];
      }
    }

    return ['none'];
  }

  private normalizeTools(value: unknown[]): string[] {
    const tools = value
      .map((item) => this.normalizeGroupKey(item, 'none'))
      .filter(Boolean);

    if (tools.length === 0) {
      return ['none'];
    }

    return Array.from(new Set(tools));
  }

  private parseNumber(raw: unknown): number {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return raw;
    }

    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private normalizeGroupKey(raw: unknown, fallback: string): string {
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      return fallback;
    }

    return raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9:_-]+/g, '_')
      .slice(0, 64);
  }

  private addLatency(
    map: Map<string, Map<string, { sumSeconds: number; count: number }>>,
    companyId: string,
    key: string,
    valueSeconds: number,
  ) {
    const companyMap =
      map.get(companyId) ??
      new Map<string, { sumSeconds: number; count: number }>();
    const current = companyMap.get(key) || { sumSeconds: 0, count: 0 };
    companyMap.set(key, {
      sumSeconds: current.sumSeconds + valueSeconds,
      count: current.count + 1,
    });
    map.set(companyId, companyMap);
  }

  private addNestedCounter(
    map: CompanyMap,
    companyId: string,
    label: string,
    value: number,
  ) {
    const current = map.get(companyId) || {};
    current[label] = (current[label] ?? 0) + value;
    map.set(companyId, current);
  }

  private toCountMap(rows: CountByCompanyRow[]): Map<string, number> {
    return new Map(
      rows.map((row) => [row.company_id, Number.parseInt(row.total, 10) || 0]),
    );
  }

  private toNestedCountMap(
    rows: CountByCompanyAndLabelRow[],
    fallbackLabel = 'unknown',
  ): CompanyMap {
    const map: CompanyMap = new Map();
    rows.forEach((row) => {
      const companyId = this.normalizeGroupKey(row.company_id, 'unknown');
      const label = this.normalizeGroupKey(row.label, fallbackLabel);
      const count = Number.parseInt(row.total, 10) || 0;

      const current = map.get(companyId) || {};
      current[label] = (current[label] ?? 0) + count;
      map.set(companyId, current);
    });

    return map;
  }
}
