import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ProfilesService } from '../../profiles/profiles.service';
import { CompaniesService } from '../../companies/companies.service';

@Injectable()
export class CacheWarmingService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CacheWarmingService.name);

  constructor(
    private profilesService: ProfilesService,
    private companiesService: CompaniesService,
  ) {}

  async onApplicationBootstrap() {
    this.logger.log('Warming up cache...');

    try {
      // Pré-carregar dados estáticos
      await this.profilesService.findAll();
      await this.companiesService.findAll();

      this.logger.log('Cache warmed up successfully');
    } catch (error) {
      this.logger.error('Failed to warm up cache', error);
    }
  }
}
