import { Injectable, Scope } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import DataLoader from 'dataloader';
import { Company } from '../../companies/entities/company.entity';

@Injectable({ scope: Scope.REQUEST })
export class CompanyDataLoader {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  public readonly loader = new DataLoader<string, Company>(
    async (ids: readonly string[]) => {
      const companies = await this.companyRepository.findBy({
        id: In([...ids]),
      });
      const companyMap = new Map(
        companies.map((company) => [company.id, company]),
      );
      return ids.map((id) => {
        const company = companyMap.get(id);
        if (!company) {
          throw new Error(`Company ${id} not found in dataloader batch`);
        }

        return company;
      });
    },
  );
}
