import { Injectable } from '@nestjs/common';
import type {
  DeepPartial,
  EntityTarget,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { DataSource } from 'typeorm';
import { TenantService } from './tenant.service';
import { withTenant, WithTenantOptions } from './with-tenant';

type TenantScopedEntity<TEntity extends object> = DeepPartial<TEntity> &
  Record<string, unknown>;

export type TenantRepositoryOptions = WithTenantOptions & {
  tenantColumn?: string;
};

/**
 * Wrapper de Repository com scoping automático de tenant (company_id).
 *
 * Objetivo:
 * - Evitar esquecimento de filtros por tenant
 * - Padronizar acesso por ID e queries baseadas em where
 * - Defesa em profundidade (além de RLS no Postgres)
 */
export class TenantRepository<TEntity extends object> {
  constructor(
    private readonly repo: Repository<TEntity>,
    private readonly tenantService: TenantService,
    private readonly options: TenantRepositoryOptions = {},
  ) {}

  private effectiveTenantId(tenantId?: string): string | undefined {
    return tenantId ?? this.tenantService.getTenantId();
  }

  private tenantColumn(): string {
    return this.options.tenantColumn || 'company_id';
  }

  private scopeWhere<
    TWhere extends FindOptionsWhere<TEntity> | FindOptionsWhere<TEntity>[],
  >(where: TWhere, companyId: string | undefined): TWhere {
    return withTenant(where as never, companyId, {
      tenantColumn: this.tenantColumn(),
      allowMissingTenant: this.options.allowMissingTenant,
    }) as TWhere;
  }

  private ensureTenantContext(companyId: string | undefined): void {
    if (!companyId && !this.options.allowMissingTenant) {
      withTenant({}, companyId, {
        tenantColumn: this.tenantColumn(),
        allowMissingTenant: this.options.allowMissingTenant,
      });
    }
  }

  /**
   * Busca por ID + tenant.
   *
   * Exemplo:
   * tenantRepo.findOne(id, tenantId) =>
   * WHERE id = :id AND company_id = :tenantId
   */
  findOne(
    id: string,
    tenantId?: string,
    options?: Omit<FindOneOptions<TEntity>, 'where'>,
  ): Promise<TEntity | null> {
    const companyId = this.effectiveTenantId(tenantId);
    const where = this.scopeWhere(
      { id } as unknown as FindOptionsWhere<TEntity>,
      companyId,
    );
    return this.repo.findOne({
      ...(options || {}),
      where,
    });
  }

  /**
   * Busca por where + tenant.
   * Útil quando o where inclui múltiplos campos além de id.
   */
  findOneWhere(
    where: FindOptionsWhere<TEntity> | FindOptionsWhere<TEntity>[],
    tenantId?: string,
    options?: Omit<FindOneOptions<TEntity>, 'where'>,
  ): Promise<TEntity | null> {
    const companyId = this.effectiveTenantId(tenantId);
    return this.repo.findOne({
      ...(options || {}),
      where: this.scopeWhere(where, companyId),
    });
  }

  /**
   * Lista com scoping de tenant aplicado ao where.
   */
  findMany(
    tenantId?: string,
    options?: Omit<FindManyOptions<TEntity>, 'where'> & {
      where?: FindOptionsWhere<TEntity> | FindOptionsWhere<TEntity>[];
    },
  ): Promise<TEntity[]> {
    const companyId = this.effectiveTenantId(tenantId);
    const where =
      options?.where ??
      ({} as unknown as
        | FindOptionsWhere<TEntity>
        | FindOptionsWhere<TEntity>[]);

    return this.repo.find({
      ...(options || {}),
      where: this.scopeWhere(where, companyId),
    });
  }

  /**
   * QueryBuilder com filtro de tenant embutido.
   */
  createQueryBuilder(
    alias: string,
    tenantId?: string,
  ): SelectQueryBuilder<TEntity> {
    const qb = this.repo.createQueryBuilder(alias);
    const companyId = this.effectiveTenantId(tenantId);
    this.ensureTenantContext(companyId);
    if (companyId) {
      qb.andWhere(`${alias}.${this.tenantColumn()} = :tenantId`, {
        tenantId: companyId,
      });
    }
    return qb;
  }

  /**
   * Save garantindo tenant no payload (quando aplicável).
   * Evita criação acidental de registros "sem tenant".
   */
  save(entity: DeepPartial<TEntity>, tenantId?: string): Promise<TEntity> {
    const companyId = this.effectiveTenantId(tenantId);
    const tenantColumn = this.tenantColumn();
    const next = {
      ...(entity as object),
    } as TenantScopedEntity<TEntity>;

    if (companyId && next[tenantColumn] == null) {
      next[tenantColumn] = companyId;
    }

    // Fail-closed: se o modelo é multi-tenant, não permitir salvar sem tenant.
    this.ensureTenantContext(companyId);

    return this.repo.save(next as DeepPartial<TEntity>);
  }

  /**
   * Escape hatch: acesso ao repo original (evite em código de domínio).
   */
  raw(): Repository<TEntity> {
    return this.repo;
  }
}

@Injectable()
export class TenantRepositoryFactory {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantService: TenantService,
  ) {}

  forEntity<TEntity extends object>(
    entity: EntityTarget<TEntity>,
    options?: TenantRepositoryOptions,
  ): TenantRepository<TEntity> {
    const repo = this.dataSource.getRepository(entity);
    return new TenantRepository(repo, this.tenantService, options);
  }

  wrap<TEntity extends object>(
    repo: Repository<TEntity>,
    options?: TenantRepositoryOptions,
  ): TenantRepository<TEntity> {
    return new TenantRepository(repo, this.tenantService, options);
  }
}
