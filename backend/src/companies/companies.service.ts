import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { plainToClass } from 'class-transformer';
import type { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Company } from './entities/company.entity';
import { CompanyResponseDto } from './dto/company-response.dto';
import { CnpjUtil } from '../common/utils/cnpj.util';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company)
    private companiesRepository: Repository<Company>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async create(
    createCompanyDto: DeepPartial<Company>,
  ): Promise<CompanyResponseDto> {
    const cnpj = createCompanyDto.cnpj
      ? CnpjUtil.normalize(createCompanyDto.cnpj)
      : undefined;

    const company = this.companiesRepository.create({
      ...createCompanyDto,
      cnpj,
    });
    const saved = await this.companiesRepository.save(company);
    await this.cacheManager.del('companies:all');
    await this.cacheManager.del('companies:active:ids');
    return plainToClass(CompanyResponseDto, saved);
  }

  /** Retorna apenas os IDs das empresas ativas — para uso interno em cron jobs. */
  async findAllActive(): Promise<{ id: string }[]> {
    const cacheKey = 'companies:active:ids';
    const cached = await this.cacheManager.get<{ id: string }[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const companies = await this.companiesRepository.find({
      select: ['id'],
      where: { status: true },
    });
    await this.cacheManager.set(cacheKey, companies, 60 * 60 * 1000);
    return companies;
  }

  async findPaginated(opts?: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<OffsetPage<CompanyResponseDto>> {
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const query = this.companiesRepository
      .createQueryBuilder('company')
      .orderBy('company.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (opts?.search?.trim()) {
      const search = `%${escapeLikePattern(opts.search.trim())}%`;
      query.where(
        `(
          company.razao_social ILIKE :search ESCAPE '\\'
          OR company.cnpj ILIKE :search ESCAPE '\\'
          OR COALESCE(company.responsavel, '') ILIKE :search ESCAPE '\\'
        )`,
        { search },
      );
    }

    const [companies, total] = await query.getManyAndCount();
    const data = companies.map((company) =>
      plainToClass(CompanyResponseDto, company),
    );

    return toOffsetPage(data, total, page, limit);
  }

  async findAll(): Promise<CompanyResponseDto[]> {
    const cached =
      await this.cacheManager.get<CompanyResponseDto[]>('companies:all');
    if (cached) {
      return cached;
    }

    const companies = await this.companiesRepository.find();
    const result = companies.map((company) =>
      plainToClass(CompanyResponseDto, company),
    );

    // Cache por 12 horas (dados básicos que raramente mudam)
    await this.cacheManager.set('companies:all', result, 12 * 60 * 60 * 1000);

    return result;
  }

  async findOne(id: string): Promise<CompanyResponseDto> {
    const cached = await this.cacheManager.get<CompanyResponseDto>(
      `company:${id}`,
    );
    if (cached) {
      return cached;
    }

    const company = await this.findOneEntity(id);
    const result = plainToClass(CompanyResponseDto, company);

    // Cache por 1 hora
    await this.cacheManager.set(`company:${id}`, result, 60 * 60 * 1000);

    return result;
  }

  async findOneEntity(id: string): Promise<Company> {
    const company = await this.companiesRepository.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Empresa com ID ${id} não encontrada`);
    }
    return company;
  }

  async update(
    id: string,
    updateCompanyDto: DeepPartial<Company>,
  ): Promise<CompanyResponseDto> {
    const company = await this.findOneEntity(id);
    Object.assign(company, updateCompanyDto);
    const saved = await this.companiesRepository.save(company);

    // Invalidar caches
    await this.cacheManager.del('companies:all');
    await this.cacheManager.del('companies:active:ids');
    await this.cacheManager.del(`company:${id}`);

    return plainToClass(CompanyResponseDto, saved);
  }

  async remove(id: string): Promise<void> {
    const company = await this.findOneEntity(id);
    await this.companiesRepository.remove(company);

    // Invalidar caches
    await this.cacheManager.del('companies:all');
    await this.cacheManager.del('companies:active:ids');
    await this.cacheManager.del(`company:${id}`);
  }
}
