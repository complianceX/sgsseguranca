import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { Activity } from './entities/activity.entity';
import { TenantService } from '../common/tenant/tenant.service';

@Injectable()
export class ActivitiesService {
  constructor(
    @InjectRepository(Activity)
    private activitiesRepository: Repository<Activity>,
    private tenantService: TenantService,
  ) {}

  async create(createActivityDto: DeepPartial<Activity>): Promise<Activity> {
    const activity = this.activitiesRepository.create(createActivityDto);
    const saved = await this.activitiesRepository.save(activity);
    return saved;
  }

  async findAll(): Promise<Activity[]> {
    const tenantId = this.tenantService.getTenantId();
    return this.activitiesRepository.find({
      where: tenantId ? { company_id: tenantId } : {},
    });
  }

  async findOne(id: string): Promise<Activity> {
    const tenantId = this.tenantService.getTenantId();
    const activity = await this.activitiesRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
    });
    if (!activity) {
      throw new NotFoundException(`Atividade com ID ${id} não encontrada`);
    }
    return activity;
  }

  async update(
    id: string,
    updateActivityDto: DeepPartial<Activity>,
  ): Promise<Activity> {
    const activity = await this.findOne(id);
    Object.assign(activity, updateActivityDto);
    const saved = await this.activitiesRepository.save(activity);
    return saved;
  }

  async remove(id: string): Promise<void> {
    const activity = await this.findOne(id);
    await this.activitiesRepository.remove(activity);
  }

  async count(options?: any): Promise<number> {
    return this.activitiesRepository.count(options);
  }
}
