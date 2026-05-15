import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { jsonToExcelBuffer } from '../common/utils/excel.util';
import { MedicalExam } from './entities/medical-exam.entity';
import { CreateMedicalExamDto } from './dto/create-medical-exam.dto';
import { UpdateMedicalExamDto } from './dto/update-medical-exam.dto';
import { TenantService } from '../common/tenant/tenant.service';
import {
  ResolvedSiteAccessScope,
  resolveSiteAccessScopeFromTenantService,
} from '../common/tenant/site-access-scope.util';
import { User } from '../users/entities/user.entity';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';
import {
  CursorPaginatedResponse,
  decodeCursorToken,
  toCursorPaginatedResponse,
} from '../common/utils/cursor-pagination.util';
import { MetricsService } from '../common/observability/metrics.service';
import {
  decryptSensitiveValue,
  encryptSensitiveValue,
} from '../common/security/field-encryption.util';

const MEDICAL_EXAM_EXPIRY_SOON_DAYS = 30;

const TIPO_EXAME_LABEL: Record<string, string> = {
  admissional: 'Admissional',
  periodico: 'Periódico',
  retorno: 'Retorno ao Trabalho',
  demissional: 'Demissional',
  mudanca_funcao: 'Mudança de Função',
};

const RESULTADO_LABEL: Record<string, string> = {
  apto: 'Apto',
  inapto: 'Inapto',
  apto_com_restricoes: 'Apto c/ Restrições',
};

function getDateKey(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    const dateKey = value.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : null;
  }

  if (Number.isNaN(value.getTime())) {
    return null;
  }

  return value.toISOString().slice(0, 10);
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDateKeyToPtBr(value: Date | string | null | undefined): string {
  const dateKey = getDateKey(value);
  if (!dateKey) {
    return '';
  }

  const [year, month, day] = dateKey.split('-');
  return `${day}/${month}/${year}`;
}

@Injectable()
export class MedicalExamsService {
  constructor(
    @InjectRepository(MedicalExam)
    private readonly medicalExamsRepository: Repository<MedicalExam>,
    private readonly tenantService: TenantService,
    @Optional() private readonly metricsService?: MetricsService,
  ) {}

  private getSiteAccessScopeOrThrow(): ResolvedSiteAccessScope {
    return resolveSiteAccessScopeFromTenantService(
      this.tenantService,
      'exames médicos',
    );
  }

  private applyUserSiteScope(
    query: {
      andWhere: (
        condition: string,
        params?: Record<string, unknown>,
      ) => unknown;
    },
    userAlias: string,
    scope: ResolvedSiteAccessScope,
  ) {
    if (!scope.hasCompanyWideAccess) {
      query.andWhere(`${userAlias}.site_id = :currentSiteId`, {
        currentSiteId: scope.siteId,
      });
    }
  }

  private async assertUserInCurrentScope(
    userId: string,
    scope: ResolvedSiteAccessScope,
  ): Promise<void> {
    if (scope.hasCompanyWideAccess) {
      return;
    }
    const user = await this.medicalExamsRepository.manager
      .getRepository(User)
      .findOne({
        where: {
          id: userId,
          company_id: scope.companyId,
          site_id: scope.siteId,
        },
        select: { id: true },
      });
    if (!user) {
      throw new NotFoundException('Colaborador não encontrado na obra atual.');
    }
  }

  private encryptExamSensitiveFields<
    T extends CreateMedicalExamDto | UpdateMedicalExamDto,
  >(payload: T): T {
    const fields = [
      'medico_responsavel',
      'crm_medico',
      'observacoes',
      'resultado_auditoria',
      'notas_auditoria',
    ] as const;

    const next = { ...payload } as Record<string, unknown>;
    fields.forEach((field) => {
      const value = next[field];
      if (typeof value === 'string') {
        next[field] = encryptSensitiveValue(value);
      } else if (value === null) {
        next[field] = null;
      }
    });

    return next as T;
  }

  private decryptExamSensitiveFields(exam: MedicalExam): MedicalExam {
    exam.medico_responsavel = decryptSensitiveValue(exam.medico_responsavel);
    exam.crm_medico = decryptSensitiveValue(exam.crm_medico);
    exam.observacoes = decryptSensitiveValue(exam.observacoes);
    exam.resultado_auditoria = decryptSensitiveValue(exam.resultado_auditoria);
    exam.notas_auditoria = decryptSensitiveValue(exam.notas_auditoria);
    return exam;
  }

  async create(dto: CreateMedicalExamDto): Promise<MedicalExam> {
    const scope = this.getSiteAccessScopeOrThrow();
    const tenantId = scope.companyId;
    if (dto.company_id !== undefined) {
      throw new BadRequestException(
        'company_id não é permitido no payload. O tenant autenticado define a empresa.',
      );
    }
    await this.assertUserInCurrentScope(dto.user_id, scope);
    const encryptedPayload = this.encryptExamSensitiveFields(dto);
    const exam = this.medicalExamsRepository.create({
      ...encryptedPayload,
      company_id: tenantId,
    });
    const saved = await this.medicalExamsRepository.save(exam);
    this.metricsService?.incrementMedicalExamRegistered(
      saved.company_id,
      saved.tipo_exame,
    );
    return this.decryptExamSensitiveFields(saved);
  }

  async findAll(opts?: {
    page?: number;
    limit?: number;
  }): Promise<OffsetPage<MedicalExam>> {
    const scope = this.getSiteAccessScopeOrThrow();
    const tenantId = scope.companyId;
    // maxLimit: 1000 — limite de segurança para evitar OOM em tenants grandes
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 1000,
    });

    const qb = this.medicalExamsRepository
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.user', 'user')
      .where('exam.deleted_at IS NULL')
      .orderBy('exam.data_vencimento', 'ASC')
      .skip(skip)
      .take(limit);

    qb.andWhere('exam.company_id = :tenantId', { tenantId });
    this.applyUserSiteScope(qb, 'user', scope);

    const [data, total] = await qb.getManyAndCount();
    data.forEach((item) => this.decryptExamSensitiveFields(item));
    return toOffsetPage(data, total, page, limit);
  }

  // Carrega todos os registros para uso interno (exportações, relatórios).
  // Mantém o colaborador carregado para não quebrar o nome no Excel; take: 5000 como teto.
  async findAllForExport(): Promise<MedicalExam[]> {
    const scope = this.getSiteAccessScopeOrThrow();
    const tenantId = scope.companyId;
    const qb = this.medicalExamsRepository
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.user', 'user')
      .select([
        'exam.id',
        'exam.tipo_exame',
        'exam.resultado',
        'exam.data_realizacao',
        'exam.data_vencimento',
        'exam.medico_responsavel',
        'exam.crm_medico',
        'exam.company_id',
        'exam.user_id',
        'exam.created_at',
        'user.id',
        'user.nome',
      ])
      .where('exam.deleted_at IS NULL')
      .orderBy('exam.data_vencimento', 'ASC')
      .take(5000);

    qb.andWhere('exam.company_id = :tenantId', { tenantId });
    if (!scope.hasCompanyWideAccess) {
      this.applyUserSiteScope(qb, 'user', scope);
    }

    const rows = await qb.getMany();
    rows.forEach((item) => this.decryptExamSensitiveFields(item));
    return rows;
  }

  async findPaginated(opts?: {
    page?: number;
    limit?: number;
    tipo_exame?: string;
    resultado?: string;
    user_id?: string;
  }): Promise<OffsetPage<MedicalExam>> {
    const scope = this.getSiteAccessScopeOrThrow();
    const tenantId = scope.companyId;
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const qb = this.medicalExamsRepository
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.user', 'user')
      .where('exam.deleted_at IS NULL')
      .orderBy('exam.data_vencimento', 'ASC')
      .skip(skip)
      .take(limit);

    qb.andWhere('exam.company_id = :tenantId', { tenantId });
    this.applyUserSiteScope(qb, 'user', scope);
    if (opts?.tipo_exame)
      qb.andWhere('exam.tipo_exame = :tipo_exame', {
        tipo_exame: opts.tipo_exame,
      });
    if (opts?.resultado)
      qb.andWhere('exam.resultado = :resultado', { resultado: opts.resultado });
    if (opts?.user_id)
      qb.andWhere('exam.user_id = :user_id', { user_id: opts.user_id });

    const [data, total] = await qb.getManyAndCount();
    data.forEach((item) => this.decryptExamSensitiveFields(item));
    return toOffsetPage(data, total, page, limit);
  }

  async findByCursor(opts?: {
    cursor?: string;
    limit?: number;
    tipo_exame?: string;
    resultado?: string;
    user_id?: string;
  }): Promise<CursorPaginatedResponse<MedicalExam>> {
    const scope = this.getSiteAccessScopeOrThrow();
    const tenantId = scope.companyId;
    const { limit } = normalizeOffsetPagination(
      { page: 1, limit: opts?.limit },
      {
        defaultLimit: 20,
        maxLimit: 100,
      },
    );
    const decodedCursor = decodeCursorToken(opts?.cursor);
    if (opts?.cursor && !decodedCursor) {
      throw new BadRequestException(
        'Cursor inválido para listagem de exames médicos.',
      );
    }

    const qb = this.medicalExamsRepository
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.user', 'user')
      .where('exam.deleted_at IS NULL')
      .orderBy('exam.created_at', 'DESC')
      .addOrderBy('exam.id', 'DESC')
      .take(limit + 1);

    qb.andWhere('exam.company_id = :tenantId', { tenantId });
    this.applyUserSiteScope(qb, 'user', scope);
    if (opts?.tipo_exame)
      qb.andWhere('exam.tipo_exame = :tipo_exame', {
        tipo_exame: opts.tipo_exame,
      });
    if (opts?.resultado)
      qb.andWhere('exam.resultado = :resultado', { resultado: opts.resultado });
    if (opts?.user_id)
      qb.andWhere('exam.user_id = :user_id', { user_id: opts.user_id });

    if (decodedCursor) {
      qb.andWhere(
        '(exam.created_at < :cursorCreatedAt OR (exam.created_at = :cursorCreatedAt AND exam.id < :cursorId))',
        {
          cursorCreatedAt: decodedCursor.created_at,
          cursorId: decodedCursor.id,
        },
      );
    }

    const rows = await qb.getMany();
    rows.forEach((item) => this.decryptExamSensitiveFields(item));
    return toCursorPaginatedResponse({
      rows,
      limit,
      getCreatedAt: (row) => row.created_at,
    });
  }

  async findOne(id: string): Promise<MedicalExam> {
    const scope = this.getSiteAccessScopeOrThrow();
    if (scope.hasCompanyWideAccess) {
      const exam = await this.medicalExamsRepository.findOne({
        where: { id, company_id: scope.companyId },
        relations: ['user'],
      });
      if (!exam) {
        throw new NotFoundException(`Exame médico com ID ${id} não encontrado`);
      }
      return this.decryptExamSensitiveFields(exam);
    }

    const qb = this.medicalExamsRepository
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.user', 'user')
      .where('exam.id = :id', { id })
      .andWhere('exam.company_id = :tenantId', {
        tenantId: scope.companyId,
      });
    this.applyUserSiteScope(qb, 'user', scope);
    const exam = await qb.getOne();
    if (!exam) {
      throw new NotFoundException(`Exame médico com ID ${id} não encontrado`);
    }
    return this.decryptExamSensitiveFields(exam);
  }

  async update(id: string, dto: UpdateMedicalExamDto): Promise<MedicalExam> {
    const exam = await this.findOne(id);
    if (dto.user_id) {
      await this.assertUserInCurrentScope(
        dto.user_id,
        this.getSiteAccessScopeOrThrow(),
      );
    }
    Object.assign(exam, this.encryptExamSensitiveFields(dto));
    const saved = await this.medicalExamsRepository.save(exam);
    return this.decryptExamSensitiveFields(saved);
  }

  async remove(id: string): Promise<void> {
    const exam = await this.findOne(id);
    await this.medicalExamsRepository.remove(exam);
  }

  async findExpirySummary() {
    const scope = this.getSiteAccessScopeOrThrow();
    const qb = this.medicalExamsRepository
      .createQueryBuilder('exam')
      .leftJoin('exam.user', 'user')
      .where('exam.company_id = :tenantId', { tenantId: scope.companyId })
      .andWhere('exam.deleted_at IS NULL');

    if (!scope.hasCompanyWideAccess) {
      this.applyUserSiteScope(qb, 'user', scope);
    }

    const summary = await qb
      .select('COUNT(*)', 'total')
      .addSelect(
        'COUNT(*) FILTER (WHERE exam.data_vencimento IS NOT NULL AND exam.data_vencimento < CURRENT_DATE)',
        'expired',
      )
      .addSelect(
        `COUNT(*) FILTER (
          WHERE exam.data_vencimento IS NOT NULL
            AND exam.data_vencimento >= CURRENT_DATE
            AND exam.data_vencimento <= CURRENT_DATE + ${MEDICAL_EXAM_EXPIRY_SOON_DAYS}
        )`,
        'expiringSoon',
      )
      .addSelect(
        `COUNT(*) FILTER (
          WHERE exam.data_vencimento IS NOT NULL
            AND exam.data_vencimento > CURRENT_DATE + ${MEDICAL_EXAM_EXPIRY_SOON_DAYS}
        )`,
        'valid',
      )
      .getRawOne();

    return {
      total: parseInt(summary.total || 0, 10),
      expired: parseInt(summary.expired || 0, 10),
      expiringSoon: parseInt(summary.expiringSoon || 0, 10),
      valid: parseInt(summary.valid || 0, 10),
    };
  }

  async findExpiring(days: number): Promise<MedicalExam[]> {
    const scope = this.getSiteAccessScopeOrThrow();
    const tenantId = scope.companyId;
    const now = new Date();
    const future = new Date();
    future.setDate(now.getDate() + days);

    const qb = this.medicalExamsRepository
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.user', 'user')
      .where('exam.deleted_at IS NULL')
      .andWhere('exam.data_vencimento BETWEEN :now AND :future', {
        now,
        future,
      });

    qb.andWhere('exam.company_id = :tenantId', { tenantId });
    this.applyUserSiteScope(qb, 'user', scope);

    const rows = await qb.getMany();
    rows.forEach((item) => this.decryptExamSensitiveFields(item));
    return rows;
  }

  async dispatchExpiryNotifications(days: number) {
    const expiring = await this.findExpiring(days);
    return {
      dispatched: expiring.length,
      timestamp: new Date(),
    };
  }

  async exportExcel(): Promise<Buffer> {
    const scope = this.getSiteAccessScopeOrThrow();
    const tenantId = scope.companyId;
    const qb = this.medicalExamsRepository
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.user', 'user')
      .select([
        'exam.id',
        'exam.tipo_exame',
        'exam.resultado',
        'exam.data_realizacao',
        'exam.data_vencimento',
        'exam.medico_responsavel',
        'exam.crm_medico',
        'exam.company_id',
        'exam.user_id',
        'exam.created_at',
        'user.id',
        'user.nome',
      ])
      .where('exam.deleted_at IS NULL')
      .orderBy('exam.data_vencimento', 'ASC');
    qb.andWhere('exam.company_id = :tenantId', { tenantId });
    if (!scope.hasCompanyWideAccess) {
      this.applyUserSiteScope(qb, 'user', scope);
    }
    const exams = await qb.getMany();
    exams.forEach((item) => this.decryptExamSensitiveFields(item));

    const todayKey =
      getDateKey(new Date()) ?? new Date().toISOString().slice(0, 10);
    const rows = exams.map((e) => {
      const vencKey = getDateKey(e.data_vencimento);
      const expiringSoonKey = addDaysToDateKey(
        todayKey,
        MEDICAL_EXAM_EXPIRY_SOON_DAYS,
      );
      const statusVenc = !vencKey
        ? 'Sem vencimento'
        : vencKey < todayKey
          ? 'Vencido'
          : vencKey <= expiringSoonKey
            ? 'Vencendo em breve'
            : 'Em dia';
      return {
        Funcionário: e.user?.nome ?? '',
        Tipo: TIPO_EXAME_LABEL[e.tipo_exame] ?? e.tipo_exame,
        Resultado: RESULTADO_LABEL[e.resultado] ?? e.resultado,
        'Data Realização': formatDateKeyToPtBr(e.data_realizacao),
        Vencimento: formatDateKeyToPtBr(e.data_vencimento),
        'Status Vencimento': statusVenc,
        Médico: e.medico_responsavel ?? '',
        CRM: e.crm_medico ?? '',
      };
    });

    return jsonToExcelBuffer(rows, 'Exames');
  }
}
