import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Training } from './entities/training.entity';
import { CreateTrainingDto } from './dto/create-training.dto';
import { UpdateTrainingDto } from './dto/update-training.dto';
import { TenantService } from '../common/tenant/tenant.service';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';

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
      select: {
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
      } as any,
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
    const trainings = await this.findAll();
    const now = new Date();
    const expired = trainings.filter(
      (t) => new Date(t.data_vencimento) < now,
    ).length;
    const expiringSoon = trainings.filter((t) => {
      const diff = new Date(t.data_vencimento).getTime() - now.getTime();
      const days = diff / (1000 * 60 * 60 * 24);
      return days > 0 && days <= 30;
    }).length;

    return {
      total: trainings.length,
      expired,
      expiringSoon,
      valid: trainings.length - expired - expiringSoon,
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
    const usersMap = new Map();
    trainings.forEach((t) => {
      if (!usersMap.has(t.user_id)) {
        usersMap.set(t.user_id, {
          user: t.user,
          blockingTrainings: [],
        });
      }
      usersMap.get(t.user_id).blockingTrainings.push(t);
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

  async count(options?: any): Promise<number> {
    const tenantId = this.tenantService.getTenantId();
    if (tenantId) {
      options = options || {};
      options.where = options.where || {};
      options.where.company_id = tenantId;
    }
    return this.trainingsRepository.count(options);
  }
}
