import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  LessThan,
  type FindManyOptions,
  type FindOptionsSelect,
  type FindOptionsWhere,
  Repository,
} from 'typeorm';
import * as XLSX from 'xlsx';
import { Training } from './entities/training.entity';
import { CreateTrainingDto } from './dto/create-training.dto';
import { UpdateTrainingDto } from './dto/update-training.dto';
import { TenantService } from '../common/tenant/tenant.service';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';

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
  ) {}

  async create(createTrainingDto: CreateTrainingDto): Promise<Training> {
    const training = this.trainingsRepository.create(createTrainingDto);
    return this.trainingsRepository.save(training);
  }

  async findAll(): Promise<Training[]> {
    const tenantId = this.tenantService.getTenantId();
    return this.trainingsRepository.find({
      where: tenantId ? { company_id: tenantId } : {},
      relations: ['user'],
    });
  }

  async findPaginated(opts?: {
    page?: number;
    limit?: number;
  }): Promise<OffsetPage<Training>> {
    const tenantId = this.tenantService.getTenantId();
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const [data, total] = await this.trainingsRepository.findAndCount({
      where: tenantId ? { company_id: tenantId } : {},
      // LISTING: manter apenas user (para nome) e evitar relations adicionais.
      relations: ['user'],
      select: TRAINING_LIST_SELECT,
      order: { data_vencimento: 'ASC' },
      skip,
      take: limit,
    });

    return toOffsetPage(data, total, page, limit);
  }

  async findOne(id: string): Promise<Training> {
    const tenantId = this.tenantService.getTenantId();
    const training = await this.trainingsRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
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
    const tenantId = this.tenantService.getTenantId();
    return this.trainingsRepository.find({
      where: tenantId
        ? { user_id: userId, company_id: tenantId }
        : { user_id: userId },
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
    const tenantId = this.tenantService.getTenantId();
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

    if (tenantId) {
      qb.andWhere('training.company_id = :tenantId', { tenantId });
    }

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
    const tenantId = this.tenantService.getTenantId();
    const now = new Date();

    const qb = this.trainingsRepository
      .createQueryBuilder('training')
      .leftJoinAndSelect('training.user', 'user')
      .where('training.data_vencimento < :now', { now })
      .andWhere('training.bloqueia_operacao_quando_vencido = :blocking', {
        blocking: true,
      });

    if (tenantId) {
      qb.andWhere('training.company_id = :tenantId', { tenantId });
    }

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
    const tenantId = this.tenantService.getTenantId();

    if (!tenantId) {
      return this.trainingsRepository.count(options);
    }

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
    const tenantId = this.tenantService.getTenantId();
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
      .orderBy('training.data_vencimento', 'ASC');
    if (tenantId) qb.where('training.company_id = :tenantId', { tenantId });
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

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Treinamentos');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }
}
