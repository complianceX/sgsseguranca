import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { jsonToExcelBuffer } from '../common/utils/excel.util';
import { ServiceOrder } from './entities/service-order.entity';
import { CreateServiceOrderDto } from './dto/create-service-order.dto';
import { UpdateServiceOrderDto } from './dto/update-service-order.dto';
import { TenantService } from '../common/tenant/tenant.service';
import {
  ResolvedSiteAccessScope,
  resolveSiteAccessScopeFromTenantService,
} from '../common/tenant/site-access-scope.util';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  ativo: ['concluido', 'cancelado'],
  concluido: [],
  cancelado: [],
};

const STATUS_LABEL: Record<string, string> = {
  ativo: 'Ativo',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

@Injectable()
export class ServiceOrdersService {
  constructor(
    @InjectRepository(ServiceOrder)
    private readonly serviceOrdersRepository: Repository<ServiceOrder>,
    private readonly tenantService: TenantService,
  ) {}

  private getTenantIdOrThrow(): string {
    const tenantId = this.tenantService.getTenantId();
    if (!tenantId) {
      throw new UnauthorizedException(
        'Contexto de empresa não identificado para ordens de serviço.',
      );
    }
    return tenantId;
  }

  private getSiteAccessScopeOrThrow(): ResolvedSiteAccessScope {
    return resolveSiteAccessScopeFromTenantService(
      this.tenantService,
      'ordens de serviço',
    );
  }

  private resolveWritableSiteId(
    siteId: string | null | undefined,
    scope: ResolvedSiteAccessScope,
  ): string | null | undefined {
    if (scope.hasCompanyWideAccess) {
      return siteId;
    }
    if (siteId && siteId !== scope.siteId) {
      throw new ForbiddenException('Obra fora do escopo do usuário atual.');
    }
    return scope.siteId;
  }

  private async generateNumero(companyId: string): Promise<string> {
    const now = new Date();
    const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prefix = `OS-${yyyymm}-`;
    const last = await this.serviceOrdersRepository
      .createQueryBuilder('so')
      .select('MAX(so.numero)', 'max')
      .where('so.company_id = :companyId', { companyId })
      .andWhere('so.numero LIKE :prefix', { prefix: `${prefix}%` })
      .getRawOne<{ max: string | null }>();
    const lastSeq = last?.max ? Number(last.max.slice(prefix.length)) || 0 : 0;
    return `${prefix}${String(lastSeq + 1).padStart(3, '0')}`;
  }

  private isDuplicateNumeroError(error: unknown): boolean {
    if (error instanceof QueryFailedError) {
      const driverError = (
        error as QueryFailedError & { driverError?: unknown }
      ).driverError as
        | {
            code?: string;
            constraint?: string;
            detail?: string;
          }
        | undefined;

      if (driverError?.code === '23505') {
        const constraint = String(
          driverError.constraint || driverError.detail || '',
        ).toLowerCase();
        return constraint.includes('uq_service_orders_company_numero');
      }
    }

    const message =
      error instanceof Error
        ? error.message.toLowerCase()
        : typeof error === 'string'
          ? error.toLowerCase()
          : '';

    return (
      message.includes('uq_service_orders_company_numero') ||
      message.includes('duplicate key')
    );
  }

  async create(dto: CreateServiceOrderDto): Promise<ServiceOrder> {
    const scope = this.getSiteAccessScopeOrThrow();
    const companyId = scope.companyId;
    if (dto.company_id !== undefined) {
      throw new BadRequestException(
        'company_id não é permitido no payload. O tenant autenticado define a empresa.',
      );
    }
    const siteId = this.resolveWritableSiteId(dto.site_id, scope);
    const numero = await this.generateNumero(companyId);
    const order = this.serviceOrdersRepository.create({
      ...dto,
      numero,
      company_id: companyId,
      site_id: siteId,
      status: dto.status ?? 'ativo',
    });
    try {
      return await this.serviceOrdersRepository.save(order);
    } catch (error) {
      if (this.isDuplicateNumeroError(error)) {
        throw new BadRequestException(
          'Já existe uma ordem de serviço com este número na empresa atual.',
        );
      }
      throw error;
    }
  }

  async findPaginated(opts?: {
    page?: number;
    limit?: number;
    status?: string;
    site_id?: string;
  }): Promise<OffsetPage<ServiceOrder>> {
    const scope = this.getSiteAccessScopeOrThrow();
    const tenantId = scope.companyId;
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const qb = this.serviceOrdersRepository
      .createQueryBuilder('so')
      .leftJoinAndSelect('so.responsavel', 'responsavel')
      .leftJoinAndSelect('so.site', 'site')
      .orderBy('so.data_emissao', 'DESC')
      .skip(skip)
      .take(limit);

    qb.where('so.company_id = :tenantId', { tenantId });
    if (opts?.status)
      qb.andWhere('so.status = :status', { status: opts.status });
    if (scope.hasCompanyWideAccess && opts?.site_id) {
      qb.andWhere('so.site_id = :site_id', { site_id: opts.site_id });
    }
    if (!scope.hasCompanyWideAccess) {
      if (opts?.site_id && opts.site_id !== scope.siteId) {
        throw new ForbiddenException('Obra fora do escopo do usuário atual.');
      }
      qb.andWhere('so.site_id = :site_id', { site_id: scope.siteId });
    }

    const [data, total] = await qb.getManyAndCount();
    return toOffsetPage(data, total, page, limit);
  }

  async findOne(id: string): Promise<ServiceOrder> {
    const scope = this.getSiteAccessScopeOrThrow();
    const order = await this.serviceOrdersRepository.findOne({
      where: {
        id,
        company_id: scope.companyId,
        ...(!scope.hasCompanyWideAccess ? { site_id: scope.siteId } : {}),
      },
      relations: ['responsavel', 'site'],
    });
    if (!order) {
      throw new NotFoundException(
        `Ordem de Serviço com ID ${id} não encontrada`,
      );
    }
    return order;
  }

  async update(id: string, dto: UpdateServiceOrderDto): Promise<ServiceOrder> {
    const order = await this.findOne(id);
    const scope = this.getSiteAccessScopeOrThrow();
    const siteId = this.resolveWritableSiteId(dto.site_id, scope);
    Object.assign(order, {
      ...dto,
      ...(siteId !== undefined ? { site_id: siteId } : {}),
    });
    return this.serviceOrdersRepository.save(order);
  }

  async updateStatus(id: string, newStatus: string): Promise<ServiceOrder> {
    const order = await this.findOne(id);
    const allowed = ALLOWED_STATUS_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Transição inválida: ${order.status} → ${newStatus}`,
      );
    }
    order.status = newStatus;
    return this.serviceOrdersRepository.save(order);
  }

  async remove(id: string): Promise<void> {
    const order = await this.findOne(id);
    await this.serviceOrdersRepository.remove(order);
  }

  async exportExcel(): Promise<Buffer> {
    const scope = this.getSiteAccessScopeOrThrow();
    const tenantId = scope.companyId;
    const qb = this.serviceOrdersRepository
      .createQueryBuilder('so')
      .leftJoinAndSelect('so.responsavel', 'responsavel')
      .leftJoinAndSelect('so.site', 'site')
      .orderBy('so.data_emissao', 'DESC');
    qb.where('so.company_id = :tenantId', { tenantId });
    if (!scope.hasCompanyWideAccess) {
      qb.andWhere('so.site_id = :siteId', { siteId: scope.siteId });
    }
    const orders = await qb.getMany();

    const rows = orders.map((o) => ({
      Número: o.numero,
      Título: o.titulo,
      Obra: o.site?.nome ?? '',
      Responsável: o.responsavel?.nome ?? '',
      Status: STATUS_LABEL[o.status] ?? o.status,
      'Data Emissão': new Date(o.data_emissao).toLocaleDateString('pt-BR'),
      'Data Início': o.data_inicio
        ? new Date(o.data_inicio).toLocaleDateString('pt-BR')
        : '',
      'Data Fim Previsto': o.data_fim_previsto
        ? new Date(o.data_fim_previsto).toLocaleDateString('pt-BR')
        : '',
    }));

    return jsonToExcelBuffer(rows, 'Ordens de Serviço');
  }
}
