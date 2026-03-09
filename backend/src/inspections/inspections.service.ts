import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { plainToClass } from 'class-transformer';
import { Inspection } from './entities/inspection.entity';
import { InspectionResponseDto } from './dto/inspection-response.dto';
import {
  CreateInspectionDto,
  UpdateInspectionDto,
} from './dto/create-inspection.dto';

import { NotificationsGateway } from '../notifications/notifications.gateway';
import { TenantService } from '../common/tenant/tenant.service';
import {
  TenantRepository,
  TenantRepositoryFactory,
} from '../common/tenant/tenant-repository';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';

@Injectable()
export class InspectionsService {
  private readonly logger = new Logger(InspectionsService.name);
  private readonly tenantRepo: TenantRepository<Inspection>;

  constructor(
    @InjectRepository(Inspection)
    private inspectionsRepository: Repository<Inspection>,
    private notificationsGateway: NotificationsGateway,
    private tenantService: TenantService,
    tenantRepositoryFactory: TenantRepositoryFactory,
  ) {
    this.tenantRepo = tenantRepositoryFactory.wrap(this.inspectionsRepository);
  }

  async create(
    createInspectionDto: CreateInspectionDto,
    companyId: string,
  ): Promise<InspectionResponseDto> {
    const inspection = this.inspectionsRepository.create({
      ...createInspectionDto,
      company_id: companyId,
    });
    const saved = await this.inspectionsRepository.save(inspection);

    // Notificar em tempo real
    try {
      // Notificar usuário (ex: admin ou quem criou se fosse passado)
      // Como não temos userId aqui, vamos notificar a empresa
      this.notificationsGateway.sendToCompany(companyId, 'inspection:created', {
        id: saved.id,
        message: 'Nova inspeção foi criada',
      });

      // Exemplo de notificar usuário específico se tivéssemos o ID
      // const currentUserId = this.tenantService.getTenantId(); // tenantId costuma ser companyId, mas se fosse userId...
      // assumindo que podemos pegar o usuário atual via request context se injetado, mas aqui vamos manter simples
    } catch (error) {
      this.logger.error('Falha ao enviar notificação de inspeção', error);
    }

    return plainToClass(InspectionResponseDto, saved);
  }

  async findAll(companyId: string): Promise<InspectionResponseDto[]> {
    const inspections = await this.inspectionsRepository.find({
      where: { company_id: companyId },
      relations: ['site', 'responsavel'],
      order: { created_at: 'DESC' },
    });
    return inspections.map((i) => plainToClass(InspectionResponseDto, i));
  }

  async findPaginated(
    companyId: string,
    opts?: {
      page?: number;
      limit?: number;
      search?: string;
    },
  ): Promise<OffsetPage<InspectionResponseDto>> {
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const query = this.inspectionsRepository
      .createQueryBuilder('inspection')
      .leftJoinAndSelect('inspection.site', 'site')
      .leftJoinAndSelect('inspection.responsavel', 'responsavel')
      .where('inspection.company_id = :companyId', { companyId })
      .orderBy('inspection.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (opts?.search?.trim()) {
      const search = `%${opts.search.trim().toLowerCase()}%`;
      query.andWhere(
        `(
          LOWER(inspection.setor_area) LIKE :search
          OR LOWER(inspection.tipo_inspecao) LIKE :search
          OR LOWER(COALESCE(site.nome, '')) LIKE :search
          OR LOWER(COALESCE(responsavel.nome, '')) LIKE :search
        )`,
        { search },
      );
    }

    const [data, total] = await query.getManyAndCount();
    return toOffsetPage(
      data.map((item) => plainToClass(InspectionResponseDto, item)),
      total,
      page,
      limit,
    );
  }

  async countPendingActionItems(companyId?: string): Promise<number> {
    const resolvedCompanyId = companyId || this.tenantService.getTenantId();
    const params = resolvedCompanyId ? [resolvedCompanyId] : [];
    const where = resolvedCompanyId ? 'WHERE i.company_id = $1' : '';

    const rows = (await this.inspectionsRepository.query(
      `
        SELECT COALESCE(
          SUM(
            (
              SELECT COUNT(*)
              FROM json_array_elements(COALESCE(i.plano_acao, '[]'::json)) AS item
              WHERE LOWER(COALESCE(item->>'status', '')) NOT LIKE '%conclu%'
                AND LOWER(COALESCE(item->>'status', '')) NOT LIKE '%encerr%'
            )
          ),
          0
        )::int AS total
        FROM inspections i
        ${where}
      `,
      params,
    )) as Array<{ total?: number | string }>;

    return Number(rows[0]?.total ?? 0);
  }

  async findOne(id: string, companyId: string): Promise<InspectionResponseDto> {
    const inspection = await this.findOneEntity(id, companyId);
    return plainToClass(InspectionResponseDto, inspection);
  }

  async findOneEntity(id: string, companyId: string): Promise<Inspection> {
    const inspection = await this.tenantRepo.findOne(id, companyId, {
      relations: ['site', 'responsavel', 'company'],
    });

    if (!inspection) {
      throw new NotFoundException(`Inspection with ID ${id} not found`);
    }

    return inspection;
  }

  async update(
    id: string,
    updateInspectionDto: UpdateInspectionDto,
    companyId: string,
  ): Promise<InspectionResponseDto> {
    const inspection = await this.findOneEntity(id, companyId);
    Object.assign(inspection, updateInspectionDto);
    const saved = await this.inspectionsRepository.save(inspection);
    return plainToClass(InspectionResponseDto, saved);
  }

  async remove(id: string, companyId: string): Promise<void> {
    const inspection = await this.findOneEntity(id, companyId);
    await this.inspectionsRepository.remove(inspection);
  }
}
