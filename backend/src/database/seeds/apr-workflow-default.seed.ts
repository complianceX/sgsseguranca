import { DataSource } from 'typeorm';
import { AprWorkflowConfig } from '../../aprs/entities/apr-workflow-config.entity';
import { AprWorkflowStep } from '../../aprs/entities/apr-workflow-step.entity';
import { WorkflowStepRole } from '../../aprs/entities/apr-workflow-step.entity';

export async function seedAprWorkflowDefault(
  dataSource: DataSource,
): Promise<void> {
  const configRepo = dataSource.getRepository(AprWorkflowConfig);
  const stepRepo = dataSource.getRepository(AprWorkflowStep);

  const existing = await configRepo.findOne({
    where: { name: 'Fluxo Padrão SST', tenantId: null as unknown as string, isDefault: true },
  });

  if (existing) return;

  const config = await configRepo.save(
    configRepo.create({
      tenantId: null,
      siteId: null,
      activityType: null,
      criticality: null,
      name: 'Fluxo Padrão SST',
      isDefault: true,
      isActive: true,
    }),
  );

  await stepRepo.save([
    stepRepo.create({
      workflowConfigId: config.id,
      stepOrder: 1,
      roleName: WorkflowStepRole.TECNICO_SST,
      isRequired: true,
      canDelegate: false,
      timeoutHours: 48,
    }),
    stepRepo.create({
      workflowConfigId: config.id,
      stepOrder: 2,
      roleName: WorkflowStepRole.SUPERVISOR,
      isRequired: true,
      canDelegate: false,
      timeoutHours: 24,
    }),
    stepRepo.create({
      workflowConfigId: config.id,
      stepOrder: 3,
      roleName: WorkflowStepRole.RESPONSAVEL_TECNICO,
      isRequired: true,
      canDelegate: false,
      timeoutHours: 72,
    }),
  ]);
}
