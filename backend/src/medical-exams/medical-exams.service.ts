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

  async create(dto: CreateMedicalExamDto): Promise<MedicalExam> {
    const tenantId = this.tenantService.getTenantId();
    const exam = this.medicalExamsRepository.create({
      ...dto,
      company_id: tenantId ?? dto.company_id,
    });
    const saved = await this.medicalExamsRepository.save(exam);
    this.metricsService?.incrementMedicalExamRegistered(
      saved.company_id,
      saved.tipo_exame,
    );
    return saved;
  }

  async findAll(opts?: {
    page?: number;
    limit?: number;
  }): Promise<OffsetPage<MedicalExam>> {
    const tenantId = this.tenantService.getTenantId();
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

    if (tenantId) {
      qb.andWhere('exam.company_id = :tenantId', { tenantId });
    }

    const [data, total] = await qb.getManyAndCount();
    return toOffsetPage(data, total, page, limit);
  }

  // Carrega todos os registros para uso interno (exportações, relatórios).
  // Sem relação de user; apenas campos essenciais; take: 5000 como teto.
  async findAllForExport(): Promise<MedicalExam[]> {
    const tenantId = this.tenantService.getTenantId();
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

    if (tenantId) {
      qb.andWhere('exam.company_id = :tenantId', { tenantId });
    }

    return qb.getMany();
  }

  async findPaginated(opts?: {
    page?: number;
    limit?: number;
    tipo_exame?: string;
    resultado?: string;
    user_id?: string;
  }): Promise<OffsetPage<MedicalExam>> {
    const tenantId = this.tenantService.getTenantId();
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

    if (tenantId) qb.andWhere('exam.company_id = :tenantId', { tenantId });
    if (opts?.tipo_exame)
      qb.andWhere('exam.tipo_exame = :tipo_exame', {
        tipo_exame: opts.tipo_exame,
      });
    if (opts?.resultado)
      qb.andWhere('exam.resultado = :resultado', { resultado: opts.resultado });
    if (opts?.user_id)
      qb.andWhere('exam.user_id = :user_id', { user_id: opts.user_id });

    const [data, total] = await qb.getManyAndCount();
    return toOffsetPage(data, total, page, limit);
  }

  async findByCursor(opts?: {
    cursor?: string;
    limit?: number;
    tipo_exame?: string;
    resultado?: string;
    user_id?: string;
  }): Promise<CursorPaginatedResponse<MedicalExam>> {
    const tenantId = this.tenantService.getTenantId();
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

    if (tenantId) qb.andWhere('exam.company_id = :tenantId', { tenantId });
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
    return toCursorPaginatedResponse({
      rows,
      limit,
      getCreatedAt: (row) => row.created_at,
    });
  }

  async findOne(id: string): Promise<MedicalExam> {
    const tenantId = this.tenantService.getTenantId();
    const exam = await this.medicalExamsRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
      relations: ['user'],
    });
    if (!exam) {
      throw new NotFoundException(`Exame médico com ID ${id} não encontrado`);
    }
    return exam;
  }

  async update(id: string, dto: UpdateMedicalExamDto): Promise<MedicalExam> {
    const exam = await this.findOne(id);
    Object.assign(exam, dto);
    return this.medicalExamsRepository.save(exam);
  }

  async remove(id: string): Promise<void> {
    const exam = await this.findOne(id);
    await this.medicalExamsRepository.remove(exam);
  }

  async findExpirySummary() {
    const tenantId = this.tenantService.getTenantId();
    const exams = await this.medicalExamsRepository.find({
      where: tenantId ? { company_id: tenantId } : {},
    });

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
    const tenantId = this.tenantService.getTenantId();
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

    if (tenantId) qb.andWhere('exam.company_id = :tenantId', { tenantId });

    return qb.getMany();
  }

  async dispatchExpiryNotifications(days: number) {
    const expiring = await this.findExpiring(days);
    return {
      dispatched: expiring.length,
      timestamp: new Date(),
    };
  }

  async exportExcel(): Promise<Buffer> {
    const tenantId = this.tenantService.getTenantId();
    const qb = this.medicalExamsRepository
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.user', 'user')
      .where('exam.deleted_at IS NULL')
      .orderBy('exam.data_vencimento', 'ASC');
    if (tenantId) qb.andWhere('exam.company_id = :tenantId', { tenantId });
    const exams = await qb.getMany();

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
