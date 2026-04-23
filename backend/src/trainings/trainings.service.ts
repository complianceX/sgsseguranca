import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  LessThan,
  type FindManyOptions,
  type FindOptionsSelect,
  type FindOptionsWhere,
  Repository,
} from 'typeorm';
import { jsonToExcelBuffer } from '../common/utils/excel.util';
import { Training } from './entities/training.entity';
import { CreateTrainingDto } from './dto/create-training.dto';
import { UpdateTrainingDto } from './dto/update-training.dto';
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

export interface BlockingTrainingUser {
  user: Training['user'];
  blockingTrainings: Training[];
}

const TRAINING_LIST_SELECT: FindOptionsSelect<Training> = {
  id: true,
  nome: true,
  nr_codigo: true,
  carga_horaria: true,
  obrigatorio_para_funcao: true,
  bloqueia_operacao_quando_vencido: true,
  data_conclusao: true,
  data_vencimento: true,
  certificado_url: true,
  user_id: true,
  company_id: true,
  auditado_por_id: true,
  data_auditoria: true,
  resultado_auditoria: true,
  notas_auditoria: true,
  created_at: true,
  updated_at: true,
};

@Injectable()
export class TrainingsService {
  constructor(
    @InjectRepository(Training)
    private trainingsRepository: Repository<Training>,
    private tenantService: TenantService,
    @Optional() private readonly metricsService?: MetricsService,
  ) {}

  private getTenantIdOrThrow(): string {
    const tenantId = this.tenantService.getTenantId();
    if (!tenantId) {
      throw new UnauthorizedException(
        'Contexto de empresa não identificado para treinamentos.',
      );
    }
    return tenantId;
  }

  async create(createTrainingDto: CreateTrainingDto): Promise<Training> {
    const tenantId = this.getTenantIdOrThrow();
    if (createTrainingDto.company_id !== undefined) {
      throw new BadRequestException(
        'company_id não é permitido no payload. O tenant autenticado define a empresa.',
      );
    }
    const training = this.trainingsRepository.create({
      ...createTrainingDto,
      company_id: tenantId,
    });
    const saved = await this.trainingsRepository.save(training);
    this.metricsService?.incrementTrainingRegistered(
      saved.company_id,
      saved.nr_codigo || saved.nome,
    );
    return saved;
  }

  async findAll(opts?: {
    page?: number;
    limit?: number;
  }): Promise<OffsetPage<Training>> {
    const tenantId = this.getTenantIdOrThrow();
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const [data, total] = await this.trainingsRepository.findAndCount({
      where: { company_id: tenantId },
      relations: ['user'],
      select: TRAINING_LIST_SELECT,
      order: { data_vencimento: 'ASC' },
      skip,
      take: limit,
    });

    return toOffsetPage(data, total, page, limit);
  }

  // Carrega todos os registros para uso interno (exportações, relatórios).
  // Sem relação de user; apenas campos essenciais; take: 5000 como teto.
  async findAllForExport(): Promise<Training[]> {
    const tenantId = this.getTenantIdOrThrow();
    return this.trainingsRepository.find({
      where: { company_id: tenantId },
      select: TRAINING_LIST_SELECT,
      order: { data_vencimento: 'ASC' },
      take: 5000,
    });
  }

  async findPaginated(opts?: {
    page?: number;
    limit?: number;
  }): Promise<OffsetPage<Training>> {
    const tenantId = this.getTenantIdOrThrow();
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const [data, total] = await this.trainingsRepository.findAndCount({
      where: { company_id: tenantId },
      // LISTING: manter apenas user (para nome) e evitar relations adicionais.
      relations: ['user'],
      select: TRAINING_LIST_SELECT,
      order: { data_vencimento: 'ASC' },
      skip,
      take: limit,
    });

    return toOffsetPage(data, total, page, limit);
  }

  async findByCursor(opts?: {
    cursor?: string;
    limit?: number;
  }): Promise<CursorPaginatedResponse<Training>> {
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
        'Cursor inválido para listagem de treinamentos.',
      );
    }

    const qb = this.trainingsRepository
      .createQueryBuilder('training')
      .leftJoinAndSelect('training.user', 'user')
      .where('training.deleted_at IS NULL')
      .select([
        'training.id',
        'training.nome',
        'training.nr_codigo',
        'training.carga_horaria',
        'training.obrigatorio_para_funcao',
        'training.bloqueia_operacao_quando_vencido',
        'training.data_conclusao',
        'training.data_vencimento',
        'training.certificado_url',
        'training.user_id',
        'training.company_id',
        'training.auditado_por_id',
        'training.data_auditoria',
        'training.resultado_auditoria',
        'training.notas_auditoria',
        'training.created_at',
        'training.updated_at',
        'user.id',
        'user.nome',
      ])
      .orderBy('training.created_at', 'DESC')
      .addOrderBy('training.id', 'DESC')
      .take(limit + 1);

    qb.andWhere('training.company_id = :tenantId', { tenantId });

    if (decodedCursor) {
      qb.andWhere(
        '(training.created_at < :cursorCreatedAt OR (training.created_at = :cursorCreatedAt AND training.id < :cursorId))',
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

  async findOne(id: string): Promise<Training> {
    const tenantId = this.getTenantIdOrThrow();
    const training = await this.trainingsRepository.findOne({
      where: { id, company_id: tenantId },
      relations: ['user'],
    });
    if (!training) {
      throw new NotFoundException(`Treinamento com ID ${id} não encontrado`);
    }
    return training;
  }

  async update(id: string, updateTrainingDto: UpdateTrainingDto) {
    const training = await this.findOne(id);
    Object.assign(training, updateTrainingDto);
    return this.trainingsRepository.save(training);
  }

  async remove(id: string): Promise<void> {
    const training = await this.findOne(id);
    await this.trainingsRepository.remove(training);
  }

  async findByUserId(userId: string): Promise<Training[]> {
    const tenantId = this.getTenantIdOrThrow();
    return this.trainingsRepository.find({
      where: { user_id: userId, company_id: tenantId },
    });
  }

  async findExpirySummary() {
    const now = new Date();
    const limitDate = new Date();
    limitDate.setDate(now.getDate() + 30);

    const [total, expired, expiringSoon] = await Promise.all([
      this.count(),
      this.count({
        where: {
          data_vencimento: LessThan(now),
        },
      }),
      this.count({
        where: {
          data_vencimento: Between(now, limitDate),
        },
      }),
    ]);

    return {
      total,
      expired,
      expiringSoon,
      valid: total - expired - expiringSoon,
    };
  }

  async findExpiring(days: number) {
    const tenantId = this.getTenantIdOrThrow();
    const now = new Date();
    const future = new Date();
    future.setDate(now.getDate() + days);

    const qb = this.trainingsRepository
      .createQueryBuilder('training')
      .leftJoinAndSelect('training.user', 'user')
      .where('training.data_vencimento BETWEEN :now AND :future', {
        now,
        future,
      });

    qb.andWhere('training.deleted_at IS NULL');
    qb.andWhere('training.company_id = :tenantId', { tenantId });

    return qb.getMany();
  }

  async dispatchExpiryNotifications(days: number) {
    const expiring = await this.findExpiring(days);
    // Simulação de envio de notificações
    return {
      dispatched: expiring.length,
      timestamp: new Date(),
    };
  }

  async findBlockingUsers() {
    const tenantId = this.getTenantIdOrThrow();
    const now = new Date();

    const qb = this.trainingsRepository
      .createQueryBuilder('training')
      .leftJoinAndSelect('training.user', 'user')
      .where('training.data_vencimento < :now', { now })
      .andWhere('training.bloqueia_operacao_quando_vencido = :blocking', {
        blocking: true,
      });

    qb.andWhere('training.deleted_at IS NULL');
    qb.andWhere('training.company_id = :tenantId', { tenantId });

    const trainings = await qb.getMany();
    const usersMap = new Map<string, BlockingTrainingUser>();
    trainings.forEach((t) => {
      if (!usersMap.has(t.user_id)) {
        usersMap.set(t.user_id, {
          user: t.user,
          blockingTrainings: [],
        });
      }

      const userEntry = usersMap.get(t.user_id);
      if (userEntry) {
        userEntry.blockingTrainings.push(t);
      }
    });

    return Array.from(usersMap.values());
  }

  async getComplianceByUser(userId: string) {
    const trainings = await this.findByUserId(userId);
    const now = new Date();
    const expired = trainings.filter((t) => new Date(t.data_vencimento) < now);

    return {
      userId,
      isCompliant: expired.length === 0,
      totalTrainings: trainings.length,
      expiredCount: expired.length,
      expiredTrainings: expired,
    };
  }

  async count(options?: FindManyOptions<Training>): Promise<number> {
    const tenantId = this.getTenantIdOrThrow();

    const scopedWhere = options?.where;
    const where = Array.isArray(scopedWhere)
      ? scopedWhere.map((clause) => ({
          ...clause,
          company_id: tenantId,
        }))
      : ({
          ...(scopedWhere ?? {}),
          company_id: tenantId,
        } satisfies FindOptionsWhere<Training>);

    return this.trainingsRepository.count({
      ...(options ?? {}),
      where,
    });
  }

  async exportExcel(): Promise<Buffer> {
    const tenantId = this.getTenantIdOrThrow();
    const qb = this.trainingsRepository
      .createQueryBuilder('training')
      .leftJoinAndSelect('training.user', 'user')
      .select([
        'training.nr_codigo',
        'training.nome',
        'training.data_vencimento',
        'training.data_conclusao',
        'training.carga_horaria',
        'training.created_at',
        'user.nome',
      ])
      .where('training.deleted_at IS NULL')
      .orderBy('training.data_vencimento', 'ASC');
    qb.andWhere('training.company_id = :tenantId', { tenantId });
    const trainings = await qb.getMany();

    const now = new Date();
    const rows = trainings.map((t) => {
      const vencimento = t.data_vencimento ? new Date(t.data_vencimento) : null;
      const status = !vencimento
        ? 'Sem validade'
        : vencimento < now
          ? 'Vencido'
          : (vencimento.getTime() - now.getTime()) / (1000 * 60 * 60 * 24) <= 30
            ? 'Vencendo em breve'
            : 'Em dia';
      return {
        'Código NR': t.nr_codigo ?? '',
        Nome: t.nome,
        Status: status,
        'Data de Vencimento': vencimento
          ? vencimento.toLocaleDateString('pt-BR')
          : '',
        'Data de Conclusão': t.data_conclusao
          ? new Date(t.data_conclusao).toLocaleDateString('pt-BR')
          : '',
        'Carga Horária (h)': t.carga_horaria ?? '',
        Funcionário: t.user?.nome ?? '',
      };
    });

    return jsonToExcelBuffer(rows, 'Treinamentos');
  }
}
