import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { jsonToExcelBuffer } from '../common/utils/excel.util';
import { MedicalExam } from './entities/medical-exam.entity';
import { CreateMedicalExamDto } from './dto/create-medical-exam.dto';
import { UpdateMedicalExamDto } from './dto/update-medical-exam.dto';
import { TenantService } from '../common/tenant/tenant.service';
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

@Injectable()
export class MedicalExamsService {
  constructor(
    @InjectRepository(MedicalExam)
    private readonly medicalExamsRepository: Repository<MedicalExam>,
    private readonly tenantService: TenantService,
    @Optional() private readonly metricsService?: MetricsService,
  ) {}

  private getTenantIdOrThrow(): string {
    const tenantId = this.tenantService.getTenantId();
    if (!tenantId) {
      throw new UnauthorizedException(
        'Contexto de empresa não identificado para exames médicos.',
      );
    }
    return tenantId;
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
    const tenantId = this.getTenantIdOrThrow();
    if (dto.company_id !== undefined) {
      throw new BadRequestException(
        'company_id não é permitido no payload. O tenant autenticado define a empresa.',
      );
    }
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
    const tenantId = this.getTenantIdOrThrow();
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

    const [data, total] = await qb.getManyAndCount();
    data.forEach((item) => this.decryptExamSensitiveFields(item));
    return toOffsetPage(data, total, page, limit);
  }

  // Carrega todos os registros para uso interno (exportações, relatórios).
  // Sem relação de user; apenas campos essenciais; take: 5000 como teto.
  async findAllForExport(): Promise<MedicalExam[]> {
    const tenantId = this.getTenantIdOrThrow();
    const qb = this.medicalExamsRepository
      .createQueryBuilder('exam')
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
      ])
      .where('exam.deleted_at IS NULL')
      .orderBy('exam.data_vencimento', 'ASC')
      .take(5000);

    qb.andWhere('exam.company_id = :tenantId', { tenantId });

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
    const tenantId = this.getTenantIdOrThrow();
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
    const tenantId = this.getTenantIdOrThrow();
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
    const tenantId = this.getTenantIdOrThrow();
    const exam = await this.medicalExamsRepository.findOne({
      where: { id, company_id: tenantId },
      relations: ['user'],
    });
    if (!exam) {
      throw new NotFoundException(`Exame médico com ID ${id} não encontrado`);
    }
    return this.decryptExamSensitiveFields(exam);
  }

  async update(id: string, dto: UpdateMedicalExamDto): Promise<MedicalExam> {
    const exam = await this.findOne(id);
    Object.assign(exam, this.encryptExamSensitiveFields(dto));
    const saved = await this.medicalExamsRepository.save(exam);
    return this.decryptExamSensitiveFields(saved);
  }

  async remove(id: string): Promise<void> {
    const exam = await this.findOne(id);
    await this.medicalExamsRepository.remove(exam);
  }

  async findExpirySummary() {
    const tenantId = this.getTenantIdOrThrow();
    const exams = await this.medicalExamsRepository.find({
      where: { company_id: tenantId },
    });
    exams.forEach((item) => this.decryptExamSensitiveFields(item));

    const now = new Date();
    const withVencimento = exams.filter((e) => e.data_vencimento !== null);
    const expired = withVencimento.filter(
      (e) => new Date(e.data_vencimento!) < now,
    ).length;
    const expiringSoon = withVencimento.filter((e) => {
      const diff = new Date(e.data_vencimento!).getTime() - now.getTime();
      const days = diff / (1000 * 60 * 60 * 24);
      return days > 0 && days <= 30;
    }).length;

    return {
      total: exams.length,
      expired,
      expiringSoon,
      valid: withVencimento.length - expired - expiringSoon,
    };
  }

  async findExpiring(days: number): Promise<MedicalExam[]> {
    const tenantId = this.getTenantIdOrThrow();
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
    const tenantId = this.getTenantIdOrThrow();
    const qb = this.medicalExamsRepository
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.user', 'user')
      .where('exam.deleted_at IS NULL')
      .orderBy('exam.data_vencimento', 'ASC');
    qb.andWhere('exam.company_id = :tenantId', { tenantId });
    const exams = await qb.getMany();
    exams.forEach((item) => this.decryptExamSensitiveFields(item));

    const now = new Date();
    const rows = exams.map((e) => {
      const venc = e.data_vencimento ? new Date(e.data_vencimento) : null;
      const statusVenc = !venc
        ? 'Sem vencimento'
        : venc < now
          ? 'Vencido'
          : (venc.getTime() - now.getTime()) / (1000 * 60 * 60 * 24) <= 30
            ? 'Vencendo em breve'
            : 'Em dia';
      return {
        Funcionário: e.user?.nome ?? '',
        Tipo: TIPO_EXAME_LABEL[e.tipo_exame] ?? e.tipo_exame,
        Resultado: RESULTADO_LABEL[e.resultado] ?? e.resultado,
        'Data Realização': new Date(e.data_realizacao).toLocaleDateString(
          'pt-BR',
        ),
        Vencimento: venc ? venc.toLocaleDateString('pt-BR') : '',
        'Status Vencimento': statusVenc,
        Médico: e.medico_responsavel ?? '',
        CRM: e.crm_medico ?? '',
      };
    });

    return jsonToExcelBuffer(rows, 'Exames');
  }
}
