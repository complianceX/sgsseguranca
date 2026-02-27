import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { plainToClass } from 'class-transformer';
import type { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Company } from './entities/company.entity';
import { CompanyResponseDto } from './dto/company-response.dto';
import { CnpjUtil } from '../common/utils/cnpj.util';

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
    return plainToClass(CompanyResponseDto, saved);
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
    await this.cacheManager.del(`company:${id}`);

    return plainToClass(CompanyResponseDto, saved);
  }

  async remove(id: string): Promise<void> {
    const company = await this.findOneEntity(id);
    await this.companiesRepository.remove(company);

    // Invalidar caches
    await this.cacheManager.del('companies:all');
    await this.cacheManager.del(`company:${id}`);
  }
}
