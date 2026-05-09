import type { DynamicModule, ForwardReference, Type } from '@nestjs/common';

type NestModule =
  | Type<unknown>
  | DynamicModule
  | Promise<DynamicModule>
  | ForwardReference;

/**
 * Catálogo de módulos por domínio de negócio.
 *
 * Objetivo: substituir a lista plana de 50+ imports no app.module.ts por
 * grupos nomeados, tornando o arquivo legível e tornando claro qual domínio
 * é responsável por qual funcionalidade.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * COMO ADICIONAR UM NOVO MÓDULO
 * ─────────────────────────────────────────────────────────────────────────
 * 1. Crie a pasta: backend/src/<meu-modulo>/
 * 2. Crie os arquivos: meu-modulo.module.ts, meu-modulo.controller.ts,
 *    meu-modulo.service.ts, dto/, entities/ (se necessário)
 * 3. Crie a migration: backend/src/database/migrations/<timestamp>-create-meu-modulo.ts
 * 4. Adicione o módulo ao grupo correto abaixo.
 * 5. Guards globais e interceptors são aplicados automaticamente — não há
 *    configuração extra necessária no módulo.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * DOMÍNIOS
 * ─────────────────────────────────────────────────────────────────────────
 * IDENTITY       — autenticação, usuários, perfis, permissões (RBAC)
 * TENANT         — empresas, obras, políticas multi-tenant, calendário
 * OPERATIONS     — módulos de campo: APRs, PTSs, DDSs, DIDs, ARRs, etc.
 * COMPLIANCE     — conformidade, qualidade, gestão: auditorias, contratos,
 *                  inspeções, não-conformidades, checklists, relatórios
 * PRIVACY        — LGPD: consentimentos, requisições de privacidade,
 *                  governança de dados
 * COMMUNICATION  — notificações, e-mail, push, assinaturas
 * INFRASTRUCTURE — serviços transversais: comum, Redis, IA, filas,
 *                  observabilidade, segurança, importação de docs,
 *                  dashboard, disaster recovery
 */

// ─── Identity ────────────────────────────────────────────────────────────────
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { RbacModule } from '../rbac/rbac.module';

export const IDENTITY_MODULES: NestModule[] = [
  AuthModule,
  UsersModule,
  ProfilesModule,
  RbacModule,
];

// ─── Tenant ──────────────────────────────────────────────────────────────────
import { CompaniesModule } from '../companies/companies.module';
import { SitesModule } from '../sites/sites.module';
import { TenantPoliciesModule } from '../tenant-policies/tenant-policies.module';
import { CalendarModule } from '../calendar/calendar.module';

export const TENANT_MODULES: NestModule[] = [
  CompaniesModule,
  SitesModule,
  TenantPoliciesModule,
  CalendarModule,
];

// ─── Operations ──────────────────────────────────────────────────────────────
import { ActivitiesModule } from '../activities/activities.module';
import { RisksModule } from '../risks/risks.module';
import { EpisModule } from '../epis/epis.module';
import { ToolsModule } from '../tools/tools.module';
import { MachinesModule } from '../machines/machines.module';
import { AprsModule } from '../aprs/aprs.module';
import { PtsModule } from '../pts/pts.module';
import { DdsModule } from '../dds/dds.module';
import { DidsModule } from '../dids/dids.module';
import { ArrsModule } from '../arrs/arrs.module';
import { RdosModule } from '../rdos/rdos.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { ServiceOrdersModule } from '../service-orders/service-orders.module';
import { TrainingsModule } from '../trainings/trainings.module';
import { MedicalExamsModule } from '../medical-exams/medical-exams.module';

export const OPERATIONS_MODULES: NestModule[] = [
  ActivitiesModule,
  RisksModule,
  EpisModule,
  ToolsModule,
  MachinesModule,
  AprsModule,
  PtsModule,
  DdsModule,
  DidsModule,
  ArrsModule,
  RdosModule,
  ExpensesModule,
  ServiceOrdersModule,
  TrainingsModule,
  MedicalExamsModule,
];

// ─── Compliance ───────────────────────────────────────────────────────────────
import { AuditsModule } from '../audits/audits.module';
import { InspectionsModule } from '../inspections/inspections.module';
import { NonConformitiesModule } from '../nonconformities/nonconformities.module';
import { ChecklistsModule } from '../checklists/checklists.module';
import { ReportsModule } from '../reports/reports.module';
import { ContractsModule } from '../contracts/contracts.module';
import { DocumentRegistryModule } from '../document-registry/document-registry.module';

export const COMPLIANCE_MODULES: NestModule[] = [
  AuditsModule,
  InspectionsModule,
  NonConformitiesModule,
  ChecklistsModule,
  ReportsModule,
  ContractsModule,
  DocumentRegistryModule,
];

// ─── Privacy (LGPD) ──────────────────────────────────────────────────────────
import { ConsentsModule } from '../consents/consents.module';
import { PrivacyRequestsModule } from '../privacy-requests/privacy-requests.module';
import { PrivacyGovernanceModule } from '../privacy-governance/privacy-governance.module';
import { AdminModule } from '../admin/admin.module';

export const PRIVACY_MODULES: NestModule[] = [
  ConsentsModule,
  PrivacyRequestsModule,
  PrivacyGovernanceModule,
  AdminModule,
];

// ─── Communication ───────────────────────────────────────────────────────────
import { MailModule } from '../mail/mail.module';
import { PushModule } from '../push/push.module';
import { SignaturesModule } from '../signatures/signatures.module';
import { TasksModule } from '../tasks/tasks.module';

export const COMMUNICATION_MODULES: NestModule[] = [
  MailModule,
  PushModule,
  SignaturesModule,
  TasksModule,
];

// ─── Infrastructure ───────────────────────────────────────────────────────────
import { CommonModule } from '../common/common.module';
import { RedisModule } from '../common/redis/redis.module';
import { AiModule } from '../ai/ai.module';
import { DataLoaderModule } from '../common/dataloader/dataloader.module';
import { ObservabilityModule } from '../common/observability/observability.module';
import { SecurityAuditModule } from '../common/security/security-audit.module';
import { FileInspectionModule } from '../common/security/file-inspection.module';
import { DocumentImportModule } from '../document-import/document-import.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { DisasterRecoveryModule } from '../disaster-recovery/disaster-recovery.module';
import { AuditModule } from '../audit/audit.module';

export const INFRASTRUCTURE_MODULES: NestModule[] = [
  CommonModule,
  RedisModule,
  AiModule,
  DataLoaderModule,
  ObservabilityModule,
  SecurityAuditModule,
  FileInspectionModule,
  DocumentImportModule,
  DashboardModule,
  DisasterRecoveryModule,
  AuditModule,
];

/**
 * Lista completa de feature modules na ordem correta de registro.
 * Infraestrutura primeiro (CommonModule, RedisModule), depois features.
 */
export const ALL_FEATURE_MODULES: NestModule[] = [
  ...INFRASTRUCTURE_MODULES,
  ...IDENTITY_MODULES,
  ...TENANT_MODULES,
  ...OPERATIONS_MODULES,
  ...COMPLIANCE_MODULES,
  ...PRIVACY_MODULES,
  ...COMMUNICATION_MODULES,
];
