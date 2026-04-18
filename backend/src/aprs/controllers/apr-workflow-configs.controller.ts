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
import { Repository } from 'typeorm';
import { AprWorkflowConfig } from '../entities/apr-workflow-config.entity';
import { AprWorkflowStep } from '../entities/apr-workflow-step.entity';
import { AprFeatureFlag } from '../decorators/apr-feature-flag.decorator';
import {
  CreateWorkflowConfigDto,
  ReplaceWorkflowStepsDto,
  UpdateWorkflowConfigDto,
} from '../dto/apr-workflow-config.dto';
import { TenantService } from '../../common/tenant/tenant.service';

@Controller('apr-workflow-configs')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
@Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA)
@AprFeatureFlag('APR_WORKFLOW_CONFIGURAVEL')
export class AprWorkflowConfigsController {
  constructor(
    @InjectRepository(AprWorkflowConfig)
    private readonly configRepo: Repository<AprWorkflowConfig>,
    @InjectRepository(AprWorkflowStep)
    private readonly stepRepo: Repository<AprWorkflowStep>,
    private readonly tenantService: TenantService,
  ) {}

  @Post()
  async create(@Body() dto: CreateWorkflowConfigDto) {
    const tenantId = dto.tenantId ?? this.tenantService.getTenantId() ?? null;
    const config = await this.configRepo.save(
      this.configRepo.create({
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
      await this.stepRepo.save(
        dto.steps.map((s) =>
          this.stepRepo.create({
            workflowConfigId: config.id,
            stepOrder: s.stepOrder,
            roleName: s.roleName,
            isRequired: s.isRequired ?? true,
            canDelegate: s.canDelegate ?? false,
            timeoutHours: s.timeoutHours ?? null,
          }),
        ),
      );
    }

    return this.findOne(config.id);
  }

  @Get()
  findAll(
    @Query('tenantId') tenantId?: string,
    @Query('siteId') siteId?: string,
  ) {
    const effectiveTenantId = tenantId ?? this.tenantService.getTenantId();
    return this.configRepo.find({
      where: {
        ...(effectiveTenantId ? { tenantId: effectiveTenantId } : {}),
        ...(siteId ? { siteId } : {}),
        isActive: true,
      },
      relations: ['steps'],
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.configRepo.findOne({
      where: { id },
      relations: ['steps'],
    });
  }

  @Patch(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateWorkflowConfigDto,
  ) {
    await this.configRepo.update(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    });
    return this.findOne(id);
  }

  @Delete(':id')
  async softDelete(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.configRepo.update(id, { isActive: false });
    return { success: true };
  }

  @Post(':id/steps')
  async addStep(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReplaceWorkflowStepsDto,
  ) {
    const steps = await this.stepRepo.save(
      dto.steps.map((s) =>
        this.stepRepo.create({
          workflowConfigId: id,
          stepOrder: s.stepOrder,
          roleName: s.roleName,
          isRequired: s.isRequired ?? true,
          canDelegate: s.canDelegate ?? false,
          timeoutHours: s.timeoutHours ?? null,
        }),
      ),
    );
    return steps;
  }

  @Put(':id/steps')
  async replaceSteps(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReplaceWorkflowStepsDto,
  ) {
    await this.stepRepo.delete({ workflowConfigId: id });
    return this.addStep(id, dto);
  }
}
