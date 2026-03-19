import { NotFoundException, BadRequestException } from '@nestjs/common';
import {
  Repository,
  FindOptionsWhere,
  DeepPartial,
  ObjectLiteral,
} from 'typeorm';
import { TenantService } from '../tenant/tenant.service';

type SensitiveWriteFields = {
  company_id?: unknown;
  empresa_id?: unknown;
  profile_id?: unknown;
  role?: unknown;
  roles?: unknown;
  permissions?: unknown;
  permissoes?: unknown;
};

export abstract class BaseService<T extends ObjectLiteral> {
  constructor(
    protected readonly repository: Repository<T>,
    protected readonly tenantService: TenantService,
    protected readonly entityName: string,
  ) {}

  protected getTenantId(): string {
    const tenantId = this.tenantService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException(
        `Contexto de empresa não definido para ${this.entityName}.`,
      );
    }
    return tenantId;
  }

  protected applyTenantFilter(
    where: FindOptionsWhere<T> = {},
  ): FindOptionsWhere<T> {
    const tenantId = this.tenantService.getTenantId();
    if (!tenantId) return where;

    return {
      ...where,
      company_id: tenantId,
    } as FindOptionsWhere<T>;
  }

  protected addDays(days: number, fromDate: Date = new Date()): Date {
    const date = new Date(fromDate);
    date.setDate(date.getDate() + days);
    return date;
  }

  private sanitizeWritePayload(data: DeepPartial<T>): DeepPartial<T> {
    const next = Object.assign(
      {} as DeepPartial<T> & SensitiveWriteFields,
      data,
    );

    delete next.company_id;
    delete next.empresa_id;
    delete next.profile_id;
    delete next.role;
    delete next.roles;
    delete next.permissions;
    delete next.permissoes;

    return next;
  }

  async findAll(where: FindOptionsWhere<T> = {}): Promise<T[]> {
    return this.repository.find({
      where: this.applyTenantFilter(where),
    });
  }

  async findOne(
    id: string,
    options: { relations?: string[]; where?: FindOptionsWhere<T> } = {},
  ): Promise<T> {
    const where = this.applyTenantFilter({
      ...(options.where ?? {}),
      id,
    } as unknown as FindOptionsWhere<T>);

    const entity = await this.repository.findOne({
      where,
      relations: options.relations,
    });

    if (!entity) {
      throw new NotFoundException(`${this.entityName} não encontrado(a).`);
    }

    return entity;
  }

  async create(data: DeepPartial<T>): Promise<T> {
    // Defesa em profundidade: nunca confiar em company_id vindo do client.
    const next = this.sanitizeWritePayload(data);

    const entity = this.repository.create({
      ...next,
      company_id: this.getTenantId(),
    } as DeepPartial<T> & { company_id: string });
    return this.repository.save(entity);
  }

  async update(id: string, data: DeepPartial<T>): Promise<T> {
    const entity = await this.findOne(id);

    // Bloqueio de mass assignment: impedir alteração de campos sensíveis via payload.
    const next = this.sanitizeWritePayload(data);

    this.repository.merge(entity, next);
    return this.repository.save(entity);
  }

  async remove(id: string): Promise<void> {
    const entity = await this.findOne(id);
    await this.repository.remove(entity);
  }
}
