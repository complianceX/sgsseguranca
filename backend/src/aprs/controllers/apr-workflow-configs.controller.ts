import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { Role } from '../../auth/enums/roles.enum';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantInterceptor } from '../../common/tenant/tenant.interceptor';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AprWorkflowConfig } from '../entities/apr-workflow-config.entity';
import { AprWorkflowStep } from '../entities/apr-workflow-step.entity';
import { AprFeatureFlag } from '../decorators/apr-feature-flag.decorator';
import {
  CreateWorkflowConfigDto,
  CreateWorkflowStepDto,
  ReplaceWorkflowStepsDto,
  UpdateWorkflowConfigDto,
} from '../dto/apr-workflow-config.dto';
import { TenantService } from '../../common/tenant/tenant.service';
import { Site } from '../../sites/entities/site.entity';

@Controller('apr-workflow-configs')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
@Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA)
@AprFeatureFlag('APR_WORKFLOW_CONFIGURAVEL')
export class AprWorkflowConfigsController {
  constructor(
    @InjectRepository(AprWorkflowConfig)
    private readonly configRepo: Repository<AprWorkflowConfig>,
    private readonly tenantService: TenantService,
  ) {}

  private getTenantIdOrThrow(): string {
    const tenantId = this.tenantService.getTenantId()?.trim();
    if (!tenantId) {
      throw new UnauthorizedException(
        'Contexto de empresa é obrigatório para configurar o workflow da APR.',
      );
    }

    return tenantId;
  }

  private async assertSiteBelongsToTenant(
    siteId: string | null | undefined,
    tenantId: string,
    manager: EntityManager = this.configRepo.manager,
  ): Promise<void> {
    if (!siteId) {
      return;
    }

    const siteRepository = manager.getRepository(Site);
    const exists = await siteRepository.exist({
      where: { id: siteId, company_id: tenantId },
    });

    if (!exists) {
      throw new BadRequestException(
        'siteId inválido para o tenant autenticado.',
      );
    }
  }

  private async findOneScopedOrFail(
    id: string,
    tenantId: string,
    manager: EntityManager = this.configRepo.manager,
  ): Promise<AprWorkflowConfig> {
    const configRepository = manager.getRepository(AprWorkflowConfig);
    const config = await configRepository.findOne({
      where: { id, tenantId },
      relations: ['steps'],
    });

    if (!config) {
      throw new NotFoundException('Workflow APR não encontrado.');
    }

    return config;
  }

  private buildStepEntities(
    manager: EntityManager,
    configId: string,
    steps: CreateWorkflowStepDto[],
  ): AprWorkflowStep[] {
    const stepRepository = manager.getRepository(AprWorkflowStep);
    return steps.map((step) =>
      stepRepository.create({
        workflowConfigId: configId,
        stepOrder: step.stepOrder,
        roleName: step.roleName,
        isRequired: step.isRequired ?? true,
        canDelegate: step.canDelegate ?? false,
        timeoutHours: step.timeoutHours ?? null,
      }),
    );
  }

  @Post()
  async create(@Body() dto: CreateWorkflowConfigDto) {
    const tenantId = this.getTenantIdOrThrow();

    return this.configRepo.manager.transaction(async (manager) => {
      await this.assertSiteBelongsToTenant(dto.siteId, tenantId, manager);

      const configRepository = manager.getRepository(AprWorkflowConfig);
      const config = await configRepository.save(
        configRepository.create({
          tenantId,
          siteId: dto.siteId ?? null,
          activityType: dto.activityType ?? null,
          criticality: dto.criticality ?? null,
          name: dto.name,
          isDefault: dto.isDefault ?? false,
          isActive: true,
        }),
      );

      if (dto.steps?.length) {
        const steps = this.buildStepEntities(manager, config.id, dto.steps);
        await manager.getRepository(AprWorkflowStep).save(steps);
      }

      return configRepository.findOneOrFail({
        where: { id: config.id, tenantId },
        relations: ['steps'],
      });
    });
  }

  @Get()
  async findAll(@Query('siteId') siteId?: string) {
    const tenantId = this.getTenantIdOrThrow();

    await this.assertSiteBelongsToTenant(siteId, tenantId);

    return this.configRepo.find({
      where: {
        tenantId,
        ...(siteId ? { siteId } : {}),
        isActive: true,
      },
      relations: ['steps'],
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    const tenantId = this.getTenantIdOrThrow();
    return this.findOneScopedOrFail(id, tenantId);
  }

  @Patch(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateWorkflowConfigDto,
  ) {
    const tenantId = this.getTenantIdOrThrow();
    await this.findOneScopedOrFail(id, tenantId);

    await this.configRepo.update({ id, tenantId }, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    });

    return this.findOneScopedOrFail(id, tenantId);
  }

  @Delete(':id')
  async softDelete(@Param('id', new ParseUUIDPipe()) id: string) {
    const tenantId = this.getTenantIdOrThrow();
    await this.findOneScopedOrFail(id, tenantId);
    await this.configRepo.update({ id, tenantId }, { isActive: false });
    return { success: true };
  }

  @Post(':id/steps')
  async addStep(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReplaceWorkflowStepsDto,
  ) {
    const tenantId = this.getTenantIdOrThrow();
    return this.configRepo.manager.transaction(async (manager) => {
      await this.findOneScopedOrFail(id, tenantId, manager);
      const steps = this.buildStepEntities(manager, id, dto.steps);
      return manager.getRepository(AprWorkflowStep).save(steps);
    });
  }

  @Put(':id/steps')
  async replaceSteps(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReplaceWorkflowStepsDto,
  ) {
    const tenantId = this.getTenantIdOrThrow();
    return this.configRepo.manager.transaction(async (manager) => {
      await this.findOneScopedOrFail(id, tenantId, manager);
      await manager.getRepository(AprWorkflowStep).delete({
        workflowConfigId: id,
      });
      const steps = this.buildStepEntities(manager, id, dto.steps);
      return manager.getRepository(AprWorkflowStep).save(steps);
    });
  }
}
