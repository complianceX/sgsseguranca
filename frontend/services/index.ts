/**
 * Barrel de serviços organizado por domínio.
 *
 * Exporta apenas os objetos de serviço (não os tipos/interfaces — importe-os
 * diretamente do arquivo fonte para evitar conflitos de nome entre domínios).
 *
 * Para adicionar um novo serviço:
 *   1. Crie frontend/services/<entidade>Service.ts
 *   2. Adicione o export nomeado no grupo correto abaixo.
 */

// ─── Identity ────────────────────────────────────────────────────────────────
export { authService } from './authService';
export { usersService } from './usersService';

// ─── Tenant ──────────────────────────────────────────────────────────────────
export { companiesService } from './companiesService';
export { sitesService } from './sitesService';
export { calendarService } from './calendarService';

// ─── Operations ──────────────────────────────────────────────────────────────
export { aprsService } from './aprsService';
export { ptsService } from './ptsService';
export { ddsService } from './ddsService';
export { didsService } from './didsService';
export { arrsService } from './arrsService';
export { rdosService } from './rdosService';
export { activitiesService } from './activitiesService';
export { nonConformitiesService } from './nonConformitiesService';
export { correctiveActionsService } from './correctiveActionsService';
export { serviceOrdersService } from './serviceOrdersService';
export { medicalExamsService } from './medicalExamsService';
export { epiAssignmentsService } from './epiAssignmentsService';
export { episService } from './episService';
export { machinesService } from './machinesService';
export { risksService } from './risksService';

// ─── Compliance ───────────────────────────────────────────────────────────────
export { auditsService } from './auditsService';
export { checklistsService } from './checklistsService';
export { reportsService } from './reportsService';
export { photographicReportsService } from './photographicReportsService';
export { documentImportService } from './documentImportService';
export { documentRegistryService } from './documentRegistryService';

// ─── Privacy (LGPD) ──────────────────────────────────────────────────────────
export { consentsService } from './consentsService';

// ─── Communication ───────────────────────────────────────────────────────────
export { mailService } from './mailService';
export { mailLogsService } from './mailLogsService';
export { notificationsService } from './notificationsService';
export { signaturesService } from './signaturesService';

// ─── AI / Sophie ─────────────────────────────────────────────────────────────
export { aiService } from './aiService';
export { sophieService } from './sophieService';
export { sstAgentService } from './sstAgentService';

// ─── Dashboard & Infra ────────────────────────────────────────────────────────
export { dashboardService } from './dashboardService';
export { fetchAllPages } from './pagination';
